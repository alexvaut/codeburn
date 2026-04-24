import { readdir, stat } from 'fs/promises'
import { basename, join } from 'path'
import { readSessionLines } from './fs-utils.js'
import { calculateCost } from './models.js'
import { discoverAllSessions, getProvider } from './providers/index.js'
import type { ParsedProviderCall } from './providers/types.js'
import type {
  ClassifiedTurn,
  DateRange,
  JournalEntry,
  ParsedApiCall,
  ParsedTurn,
  ProjectSummary,
  SessionSummary,
  TokenUsage,
} from './types.js'
import { classifyTurn } from './classifier.js'
import { readConfig } from './config.js'
import {
  buildSessionSummary,
  canonicalizeProject,
  compileRules,
  extractMcpTools,
  groupIntoTurns,
  parseJsonlLine,
  unsanitizePath,
  type CompiledRule,
} from './parser-internals.js'

async function parseSessionFile(
  filePath: string,
  project: string,
  seenMsgIds: Set<string>,
  dateRange?: DateRange,
): Promise<SessionSummary | null> {
  // Skip files whose mtime is older than the range start. A session file
  // can only contain entries up to its last-modified time; if that predates
  // the requested range, nothing in this file can match.
  if (dateRange) {
    try {
      const s = await stat(filePath)
      if (s.mtimeMs < dateRange.start.getTime()) return null
    } catch { /* fall through to normal read; missing stat shouldn't break parsing */ }
  }
  const entries: JournalEntry[] = []
  let hasLines = false

  for await (const line of readSessionLines(filePath)) {
    hasLines = true
    const entry = parseJsonlLine(line)
    if (entry) entries.push(entry)
  }

  if (!hasLines) return null

  if (entries.length === 0) return null

  const sessionId = basename(filePath, '.jsonl')
  let turns = groupIntoTurns(entries, seenMsgIds)
  if (dateRange) {
    turns = turns.filter(turn => {
      if (turn.assistantCalls.length === 0) return false
      const firstCallTs = turn.assistantCalls[0]!.timestamp
      if (!firstCallTs) return false
      const ts = new Date(firstCallTs)
      return ts >= dateRange.start && ts <= dateRange.end
    })
    if (turns.length === 0) return null
  }
  const classified = turns.map(classifyTurn)

  return buildSessionSummary(sessionId, project, classified)
}

async function collectJsonlFiles(dirPath: string): Promise<string[]> {
  const files = await readdir(dirPath).catch(() => [])
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).map(f => join(dirPath, f))

  for (const entry of files) {
    if (entry.endsWith('.jsonl')) continue
    const subagentsPath = join(dirPath, entry, 'subagents')
    const subFiles = await readdir(subagentsPath).catch(() => [])
    for (const sf of subFiles) {
      if (sf.endsWith('.jsonl')) jsonlFiles.push(join(subagentsPath, sf))
    }
  }

  return jsonlFiles
}

async function scanProjectDirs(dirs: Array<{ path: string; name: string }>, seenMsgIds: Set<string>, rules: CompiledRule[], dateRange?: DateRange): Promise<ProjectSummary[]> {
  const projectMap = new Map<string, SessionSummary[]>()
  const projectPathMap = new Map<string, string>()

  for (const { path: dirPath, name: dirName } of dirs) {
    const jsonlFiles = await collectJsonlFiles(dirPath)
    const canonical = canonicalizeProject(dirName, rules)

    for (const filePath of jsonlFiles) {
      const session = await parseSessionFile(filePath, dirName, seenMsgIds, dateRange)
      if (session && session.apiCalls > 0) {
        const existing = projectMap.get(canonical) ?? []
        existing.push(session)
        projectMap.set(canonical, existing)
        const path = unsanitizePath(dirName)
        const current = projectPathMap.get(canonical)
        if (!current || path.length < current.length) projectPathMap.set(canonical, path)
      }
    }
  }

  const projects: ProjectSummary[] = []
  for (const [name, sessions] of projectMap) {
    projects.push({
      project: name,
      projectPath: projectPathMap.get(name) ?? unsanitizePath(name),
      sessions,
      totalCostUSD: sessions.reduce((s, sess) => s + sess.totalCostUSD, 0),
      totalCacheReadCostUSD: sessions.reduce((s, sess) => s + sess.totalCacheReadCostUSD, 0),
      totalApiCalls: sessions.reduce((s, sess) => s + sess.apiCalls, 0),
    })
  }

  return projects
}

function providerCallToTurn(call: ParsedProviderCall): ParsedTurn {
  const tools = call.tools
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

async function parseProviderSources(
  providerName: string,
  sources: Array<{ path: string; project: string }>,
  seenKeys: Set<string>,
  rules: CompiledRule[],
  dateRange?: DateRange,
): Promise<ProjectSummary[]> {
  const provider = await getProvider(providerName)
  if (!provider) return []

  const sessionMap = new Map<string, { project: string; turns: ClassifiedTurn[] }>()

  for (const source of sources) {
    if (dateRange) {
      try {
        const s = await stat(source.path)
        if (s.mtimeMs < dateRange.start.getTime()) continue
      } catch { /* fall through; treat unknown stat as "may contain data" */ }
    }
    const parser = provider.createSessionParser(
      { path: source.path, project: source.project, provider: providerName },
      seenKeys,
    )

    for await (const call of parser.parse()) {
      if (dateRange) {
        if (!call.timestamp) continue
        const ts = new Date(call.timestamp)
        if (ts < dateRange.start || ts > dateRange.end) continue
      }

      const turn = providerCallToTurn(call)
      const classified = classifyTurn(turn)
      const key = `${providerName}:${call.sessionId}:${source.project}`

      const existing = sessionMap.get(key)
      if (existing) {
        existing.turns.push(classified)
      } else {
        sessionMap.set(key, { project: source.project, turns: [classified] })
      }
    }
  }

  const projectMap = new Map<string, SessionSummary[]>()
  const projectPathMap = new Map<string, string>()
  for (const [key, { project, turns }] of sessionMap) {
    const sessionId = key.split(':')[1] ?? key
    const session = buildSessionSummary(sessionId, project, turns)
    if (session.apiCalls > 0) {
      const canonical = canonicalizeProject(project, rules)
      const existing = projectMap.get(canonical) ?? []
      existing.push(session)
      projectMap.set(canonical, existing)
      const path = unsanitizePath(project)
      const current = projectPathMap.get(canonical)
      if (!current || path.length < current.length) projectPathMap.set(canonical, path)
    }
  }

  const projects: ProjectSummary[] = []
  for (const [name, sessions] of projectMap) {
    projects.push({
      project: name,
      projectPath: projectPathMap.get(name) ?? unsanitizePath(name),
      sessions,
      totalCostUSD: sessions.reduce((s, sess) => s + sess.totalCostUSD, 0),
      totalCacheReadCostUSD: sessions.reduce((s, sess) => s + sess.totalCacheReadCostUSD, 0),
      totalApiCalls: sessions.reduce((s, sess) => s + sess.apiCalls, 0),
    })
  }

  return projects
}

const CACHE_TTL_MS = 60_000
const MAX_CACHE_ENTRIES = 10
const sessionCache = new Map<string, { data: ProjectSummary[]; ts: number }>()

function cacheKey(dateRange?: DateRange, providerFilter?: string): string {
  const s = dateRange ? `${dateRange.start.getTime()}:${dateRange.end.getTime()}` : 'none'
  return `${s}:${providerFilter ?? 'all'}`
}

function cachePut(key: string, data: ProjectSummary[]) {
  const now = Date.now()
  for (const [k, v] of sessionCache) {
    if (now - v.ts > CACHE_TTL_MS) sessionCache.delete(k)
  }
  if (sessionCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = [...sessionCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) sessionCache.delete(oldest[0])
  }
  sessionCache.set(key, { data, ts: now })
}

export function filterProjectsByName(
  projects: ProjectSummary[],
  include?: string[],
  exclude?: string[],
): ProjectSummary[] {
  let result = projects
  if (include && include.length > 0) {
    const patterns = include.map(s => s.toLowerCase())
    result = result.filter(p => {
      const name = p.project.toLowerCase()
      const path = p.projectPath.toLowerCase()
      return patterns.some(pat => name.includes(pat) || path.includes(pat))
    })
  }
  if (exclude && exclude.length > 0) {
    const patterns = exclude.map(s => s.toLowerCase())
    result = result.filter(p => {
      const name = p.project.toLowerCase()
      const path = p.projectPath.toLowerCase()
      return !patterns.some(pat => name.includes(pat) || path.includes(pat))
    })
  }
  return result
}

export async function parseAllSessions(dateRange?: DateRange, providerFilter?: string): Promise<ProjectSummary[]> {
  const key = cacheKey(dateRange, providerFilter)
  const cached = sessionCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

  const seenMsgIds = new Set<string>()
  const seenKeys = new Set<string>()
  const config = await readConfig()
  const rules = compileRules(config.projectGroups)
  const allSources = await discoverAllSessions(providerFilter)

  const claudeSources = allSources.filter(s => s.provider === 'claude')
  const nonClaudeSources = allSources.filter(s => s.provider !== 'claude')

  const claudeDirs = claudeSources.map(s => ({ path: s.path, name: s.project }))
  const claudeProjects = await scanProjectDirs(claudeDirs, seenMsgIds, rules, dateRange)

  const providerGroups = new Map<string, Array<{ path: string; project: string }>>()
  for (const source of nonClaudeSources) {
    const existing = providerGroups.get(source.provider) ?? []
    existing.push({ path: source.path, project: source.project })
    providerGroups.set(source.provider, existing)
  }

  const otherProjects: ProjectSummary[] = []
  for (const [providerName, sources] of providerGroups) {
    const projects = await parseProviderSources(providerName, sources, seenKeys, rules, dateRange)
    otherProjects.push(...projects)
  }

  const mergedMap = new Map<string, ProjectSummary>()
  for (const p of [...claudeProjects, ...otherProjects]) {
    const existing = mergedMap.get(p.project)
    if (existing) {
      existing.sessions.push(...p.sessions)
      existing.totalCostUSD += p.totalCostUSD
      existing.totalCacheReadCostUSD += p.totalCacheReadCostUSD
      existing.totalApiCalls += p.totalApiCalls
      if (p.projectPath.length < existing.projectPath.length) existing.projectPath = p.projectPath
    } else {
      mergedMap.set(p.project, { ...p })
    }
  }

  const result = Array.from(mergedMap.values()).sort((a, b) => b.totalCostUSD - a.totalCostUSD)
  cachePut(key, result)
  return result
}
