export type Period = 'today' | 'yesterday' | 'week' | '30days' | 'month' | 'all' | '5h' | '7d'

export type FilterState = {
  period: Period
  from: string | null
  to: string | null
  project: string | null
  model: string | null
  provider: string | null
}

export type Summary = {
  currency: string
  label: string
  period: string
  totals: {
    cost: number
    cacheReadCost: number
    calls: number
    sessions: number
    cacheHitPercent: number
    avgLast5TurnCost: number
    avgLast5TurnCacheReadCost: number
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  }
  plan: {
    id: string
    displayName: string
    monthlyUsd: number
    spent: number
    spentSubscription: number
    budget: number
    percentUsed: number
    percentUsedSubscription: number
    status: 'under' | 'near' | 'over'
    statusSubscription: 'under' | 'near' | 'over'
    projectedMonthEnd: number
    projectedMonthEndSubscription: number
    daysUntilReset: number
  } | null
  sessionLimits: SessionLimits | null
}

export type SessionWindow = {
  utilization: number
  resetsAt: number
  windowStart: string
  windowEnd: string
  status: string | null
  spentUsd: number
  empiricalBudgetUsd: number | null
  staticBudgetUsd: number
  empiricalUsable: boolean
}

export type SessionLimits = {
  tier: 'pro' | 'max_5x' | 'max_20x' | 'unknown'
  subscriptionType: string | null
  rateLimitTier: string | null
  overallStatus: string | null
  representativeClaim: string | null
  fetchedAt: number
  stale: boolean
  error: string | null
  fiveHour: SessionWindow | null
  sevenDay: SessionWindow | null
}

export type DailyPoint = {
  date: string
  cost: number
  cacheReadCost: number
  calls: number
  sessions: number
  inputTokens: number
  outputTokens: number
}

export type ProjectRow = {
  name: string
  path: string
  cost: number
  cacheReadCost: number
  avgCostPerSession: number
  avgCacheReadCostPerSession: number
  calls: number
  sessions: number
  cacheHitPercent: number
}

export type SessionRow = {
  project: string
  sessionId: string
  date: string | null
  model: string | null
  cost: number
  cacheReadCost: number
  calls: number
  cacheHitPercent: number
  avgLast5TurnCost: number
  avgLast5TurnCacheReadCost: number
  turns: number
}

export type SessionTurn = {
  timestamp: string
  category: string
  userMessage: string
  calls: number
  cost: number
  cacheReadCost: number
  retries: number
  hasEdits: boolean
}

export type SessionDetail = {
  sessionId: string
  project: string
  projectPath: string
  firstTimestamp: string
  lastTimestamp: string
  cost: number
  cacheReadCost: number
  calls: number
  totalTurns: number
  avgLast5TurnCost: number
  avgLast5TurnCacheReadCost: number
  cacheHitPercent: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  modelBreakdown: Array<{ name: string; cost: number; cacheReadCost: number; calls: number }>
  turns: SessionTurn[]
}

export type ActivityRow = {
  category: string
  name: string
  cost: number
  cacheReadCost: number
  turns: number
  editTurns: number
  oneShotTurns: number
  oneShotRate: number | null
  cacheHitPercent: number
}

export type ModelRow = {
  name: string
  cost: number
  cacheReadCost: number
  calls: number
  cacheHitPercent: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
}

export type ToolsPayload = {
  tools: Array<{ name: string; calls: number }>
  bash: Array<{ name: string; calls: number }>
  mcp: Array<{ name: string; calls: number }>
}

export type FiltersPayload = {
  projects: string[]
  models: string[]
  providers: Array<{ name: string; displayName: string }>
  periods: string[]
}

function toQuery(f: FilterState): string {
  const params = new URLSearchParams()
  if (f.from) params.set('from', f.from)
  if (f.to) params.set('to', f.to)
  if (!f.from && !f.to) params.set('period', f.period)
  if (f.project) params.set('project', f.project)
  if (f.model) params.set('model', f.model)
  if (f.provider) params.set('provider', f.provider)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function fetchJson<T>(path: string, f: FilterState): Promise<T> {
  const res = await fetch(`/api${path}${toQuery(f)}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  summary: (f: FilterState) => fetchJson<Summary>('/summary', f),
  daily: (f: FilterState) => fetchJson<DailyPoint[]>('/daily', f),
  projects: (f: FilterState) => fetchJson<ProjectRow[]>('/projects', f),
  topSessions: (f: FilterState) => fetchJson<SessionRow[]>('/sessions/top', f),
  activities: (f: FilterState) => fetchJson<ActivityRow[]>('/activities', f),
  models: (f: FilterState) => fetchJson<ModelRow[]>('/models', f),
  tools: (f: FilterState) => fetchJson<ToolsPayload>('/tools', f),
  filters: (f: FilterState) => fetchJson<FiltersPayload>('/filters', f),
  exportCsvUrl: (f: FilterState) => `/api/export.csv${toQuery(f)}`,
  session: async (id: string): Promise<SessionDetail> => {
    const res = await fetch(`/api/session/${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(`/session/${id} → ${res.status}`)
    return res.json() as Promise<SessionDetail>
  },
}
