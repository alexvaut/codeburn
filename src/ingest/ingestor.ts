import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { readSessionLines } from '../fs-utils.js'
import { classifyTurn } from '../classifier.js'
import { calculateCost } from '../models.js'
import { getProvider } from '../providers/index.js'
import type { SessionSource } from '../providers/types.js'
import type {
  ClassifiedTurn,
  JournalEntry,
  ParsedApiCall,
  ParsedTurn,
  SessionSummary,
  TokenUsage,
} from '../types.js'
import {
  buildSessionSummary,
  canonicalizeProject,
  extractMcpTools,
  groupIntoTurns,
  parseJsonlLine,
  type CompiledRule,
} from '../parser-internals.js'
import { getDb } from '../db/connection.js'
import {
  deleteSessionsForFile,
  getSourceFile,
  upsertSession,
  upsertSourceFile,
} from '../db/repo.js'

/// A single claude project dir expands into multiple .jsonl files. We track watermarks at
/// file level. Non-claude providers track one watermark per source-file.
export type FileTask = {
  provider: string
  project: string
  filePath: string
}

async function collectClaudeJsonlFiles(dirPath: string): Promise<string[]> {
  const files = await readdir(dirPath).catch(() => [])
  const out = files.filter(f => f.endsWith('.jsonl')).map(f => join(dirPath, f))
  for (const entry of files) {
    if (entry.endsWith('.jsonl')) continue
    const subagentsPath = join(dirPath, entry, 'subagents')
    const subFiles = await readdir(subagentsPath).catch(() => [])
    for (const sf of subFiles) {
      if (sf.endsWith('.jsonl')) out.push(join(subagentsPath, sf))
    }
  }
  return out
}

export async function expandSourcesToFiles(sources: SessionSource[]): Promise<FileTask[]> {
  const tasks: FileTask[] = []
  for (const src of sources) {
    if (src.provider === 'claude') {
      const files = await collectClaudeJsonlFiles(src.path)
      for (const f of files) tasks.push({ provider: 'claude', project: src.project, filePath: f })
    } else {
      tasks.push({ provider: src.provider, project: src.project, filePath: src.path })
    }
  }
  return tasks
}

async function parseClaudeFile(filePath: string, project: string): Promise<SessionSummary | null> {
  const entries: JournalEntry[] = []
  let hasLines = false
  for await (const line of readSessionLines(filePath)) {
    hasLines = true
    const entry = parseJsonlLine(line)
    if (entry) entries.push(entry)
  }
  if (!hasLines || entries.length === 0) return null
  const sessionId = basename(filePath, '.jsonl')
  const turns = groupIntoTurns(entries, new Set())
  if (turns.length === 0) return null
  const classified = turns.map(classifyTurn)
  const session = buildSessionSummary(sessionId, project, classified)
  return session.apiCalls > 0 ? session : null
}

function providerCallToTurn(call: {
  provider: string; model: string; inputTokens: number; outputTokens: number;
  cacheCreationInputTokens: number; cacheReadInputTokens: number; cachedInputTokens: number;
  reasoningTokens: number; webSearchRequests: number; costUSD: number; tools: string[];
  bashCommands: string[]; timestamp: string; speed: 'standard' | 'fast';
  deduplicationKey: string; userMessage: string; sessionId: string;
}): ParsedTurn {
  const usage: TokenUsage = {
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    cacheCreationInputTokens: call.cacheCreationInputTokens,
    cacheCreation1hTokens: 0,
    cacheCreation5mTokens: 0,
    cacheReadInputTokens: call.cacheReadInputTokens,
    cachedInputTokens: call.cachedInputTokens,
    reasoningTokens: call.reasoningTokens,
    webSearchRequests: call.webSearchRequests,
  }
  const tools = call.tools
  const apiCall: ParsedApiCall = {
    provider: call.provider,
    model: call.model,
    usage,
    costUSD: call.costUSD,
    cacheReadCostUSD: calculateCost(call.model, 0, 0, 0, call.cacheReadInputTokens, 0, call.speed),
    tools,
    mcpTools: extractMcpTools(tools),
    hasAgentSpawn: tools.includes('Agent'),
    hasPlanMode: tools.includes('EnterPlanMode'),
    speed: call.speed,
    timestamp: call.timestamp,
    bashCommands: call.bashCommands,
    deduplicationKey: call.deduplicationKey,
  }
  return {
    userMessage: call.userMessage,
    assistantCalls: [apiCall],
    timestamp: call.timestamp,
    sessionId: call.sessionId,
  }
}

async function parseProviderFile(
  providerName: string,
  project: string,
  filePath: string,
): Promise<SessionSummary[]> {
  const provider = await getProvider(providerName)
  if (!provider) return []
  const parser = provider.createSessionParser(
    { path: filePath, project, provider: providerName },
    new Set<string>(),
  )
  const sessionMap = new Map<string, ClassifiedTurn[]>()
  for await (const call of parser.parse()) {
    const turn = providerCallToTurn(call)
    const classified = classifyTurn(turn)
    const existing = sessionMap.get(call.sessionId) ?? []
    existing.push(classified)
    sessionMap.set(call.sessionId, existing)
  }
  const out: SessionSummary[] = []
  for (const [sessionId, turns] of sessionMap) {
    const session = buildSessionSummary(sessionId, project, turns)
    if (session.apiCalls > 0) out.push(session)
  }
  return out
}

/// Ingest a single file if its (size, mtime) changed since last ingest. Returns true if work
/// was done. Silently returns false when the file vanished or has no meaningful data.
export async function ingestFileIfChanged(
  task: FileTask,
  rules: CompiledRule[],
): Promise<boolean> {
  let s
  try {
    s = await stat(task.filePath)
  } catch {
    return false
  }
  const db = getDb()
  const existing = getSourceFile(db, task.filePath)
  if (existing && existing.size === s.size && existing.mtime_ms === Math.floor(s.mtimeMs)) {
    return false
  }

  const canonical = canonicalizeProject(task.project, rules)

  if (task.provider === 'claude') {
    const session = await parseClaudeFile(task.filePath, task.project)
    db.transaction(() => {
      if (existing) {
        deleteSessionsForFile(db, 'claude', task.project, [basename(task.filePath, '.jsonl')])
      }
      if (session) upsertSession(db, 'claude', task.project, canonical, session)
      upsertSourceFile(db, {
        path: task.filePath,
        provider: 'claude',
        project: task.project,
        size: s.size,
        mtime_ms: Math.floor(s.mtimeMs),
        last_offset: s.size,
        ingested_at: Date.now(),
      })
    })
  } else {
    const sessions = await parseProviderFile(task.provider, task.project, task.filePath)
    db.transaction(() => {
      // For provider files, a single source_file can produce many sessions; replace by
      // deleting all prior sessions whose rows came from this (provider, project) — safe because
      // one provider source_file maps 1:1 to a project+provider pair for Cursor/OpenCode.
      if (existing) {
        const prior = db.query<{ session_id: string }>(
          'SELECT session_id FROM sessions WHERE provider = ? AND project = ?',
          [task.provider, task.project],
        )
        deleteSessionsForFile(db, task.provider, task.project, prior.map(r => r.session_id))
      }
      for (const session of sessions) {
        upsertSession(db, task.provider, task.project, canonical, session)
      }
      upsertSourceFile(db, {
        path: task.filePath,
        provider: task.provider,
        project: task.project,
        size: s.size,
        mtime_ms: Math.floor(s.mtimeMs),
        last_offset: s.size,
        ingested_at: Date.now(),
      })
    })
  }
  return true
}
