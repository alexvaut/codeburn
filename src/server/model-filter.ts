import { getShortModelName } from '../models.js'
import type { ClassifiedTurn, ParsedApiCall, ProjectSummary, SessionSummary, TaskCategory, TokenUsage } from '../types.js'

function emptyTokens(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    webSearchRequests: 0,
  }
}

function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    webSearchRequests: a.webSearchRequests + b.webSearchRequests,
  }
}

function rebuildSession(session: SessionSummary, keptTurns: ClassifiedTurn[]): SessionSummary {
  let totalCostUSD = 0
  let totalCacheReadCostUSD = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalCacheWriteTokens = 0
  let apiCalls = 0
  const modelBreakdown: Record<string, { calls: number; costUSD: number; cacheReadCostUSD: number; tokens: TokenUsage }> = {}
  const toolBreakdown: Record<string, { calls: number }> = {}
  const mcpBreakdown: Record<string, { calls: number }> = {}
  const bashBreakdown: Record<string, { calls: number }> = {}
  const categoryBreakdown: Record<TaskCategory, { turns: number; costUSD: number; cacheReadCostUSD: number; retries: number; editTurns: number; oneShotTurns: number }> = {} as never

  for (const turn of keptTurns) {
    let turnCost = 0
    let turnCacheReadCost = 0
    for (const call of turn.assistantCalls) {
      turnCost += call.costUSD
      turnCacheReadCost += call.cacheReadCostUSD
      totalCostUSD += call.costUSD
      totalCacheReadCostUSD += call.cacheReadCostUSD
      totalInputTokens += call.usage.inputTokens
      totalOutputTokens += call.usage.outputTokens
      totalCacheReadTokens += call.usage.cacheReadInputTokens
      totalCacheWriteTokens += call.usage.cacheCreationInputTokens
      apiCalls += 1

      const modelKey = getShortModelName(call.model)
      const m = modelBreakdown[modelKey] ?? { calls: 0, costUSD: 0, cacheReadCostUSD: 0, tokens: emptyTokens() }
      m.calls += 1
      m.costUSD += call.costUSD
      m.cacheReadCostUSD += call.cacheReadCostUSD
      m.tokens = addTokens(m.tokens, call.usage)
      modelBreakdown[modelKey] = m

      for (const t of call.tools) {
        if (t.startsWith('mcp__')) {
          const server = t.split('__')[1] ?? t
          mcpBreakdown[server] = { calls: (mcpBreakdown[server]?.calls ?? 0) + 1 }
        } else {
          toolBreakdown[t] = { calls: (toolBreakdown[t]?.calls ?? 0) + 1 }
        }
      }
      for (const cmd of call.bashCommands) {
        bashBreakdown[cmd] = { calls: (bashBreakdown[cmd]?.calls ?? 0) + 1 }
      }
    }
    const cat = categoryBreakdown[turn.category] ?? { turns: 0, costUSD: 0, cacheReadCostUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 }
    cat.turns += 1
    cat.costUSD += turnCost
    cat.cacheReadCostUSD += turnCacheReadCost
    cat.retries += turn.retries
    if (turn.hasEdits) cat.editTurns += 1
    if (turn.hasEdits && turn.retries === 0) cat.oneShotTurns += 1
    categoryBreakdown[turn.category] = cat
  }

  return {
    ...session,
    totalCostUSD,
    totalCacheReadCostUSD,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    apiCalls,
    turns: keptTurns,
    modelBreakdown,
    toolBreakdown,
    mcpBreakdown,
    bashBreakdown,
    categoryBreakdown,
  }
}

export function filterProjectsByModel(projects: ProjectSummary[], model: string | null): ProjectSummary[] {
  if (!model) return projects
  const out: ProjectSummary[] = []
  for (const project of projects) {
    const keptSessions: SessionSummary[] = []
    for (const session of project.sessions) {
      const keptTurns: ClassifiedTurn[] = []
      for (const turn of session.turns) {
        const matchedCalls: ParsedApiCall[] = turn.assistantCalls.filter(c => getShortModelName(c.model) === model)
        if (matchedCalls.length === 0) continue
        keptTurns.push({ ...turn, assistantCalls: matchedCalls })
      }
      if (keptTurns.length === 0) continue
      keptSessions.push(rebuildSession(session, keptTurns))
    }
    if (keptSessions.length === 0) continue
    const totalCostUSD = keptSessions.reduce((s, x) => s + x.totalCostUSD, 0)
    const totalCacheReadCostUSD = keptSessions.reduce((s, x) => s + x.totalCacheReadCostUSD, 0)
    const totalApiCalls = keptSessions.reduce((s, x) => s + x.apiCalls, 0)
    out.push({ ...project, sessions: keptSessions, totalCostUSD, totalCacheReadCostUSD, totalApiCalls })
  }
  return out
}
