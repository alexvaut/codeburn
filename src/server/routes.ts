import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { cacheHitPercent } from '../cache-hit.js'
import { aggregateProjectsIntoDays, buildPeriodDataFromDays, dateKey } from '../day-aggregator.js'
import { convertCost, getCurrency } from '../currency.js'
import { getPlanUsageOrNull } from '../plan-usage.js'
import { getAllProviders } from '../providers/index.js'
import { getSessionLimits, computeWindowSpend } from '../session-limits.js'
import { CATEGORY_LABELS, type ClassifiedTurn, type ProjectSummary, type SessionSummary, type TaskCategory } from '../types.js'

import { parseAllSessions } from '../parser.js'
import { loadFilteredProjects, parseFilters, type Filters } from './filters.js'
import { filterProjectsByModel } from './model-filter.js'
import { getDb } from '../db/connection.js'
import { countSessions } from '../db/repo.js'
import { getStatus, statusEmitter, type IngestStatus } from '../ingest/status.js'
import { isSweepRunning, sweepOnce } from '../ingest/sweeper.js'
import { getIngestionConfig, readConfig, saveIngestionConfig, DEFAULT_SWEEP_INTERVAL_MS } from '../config.js'

const FIVE_HOUR_SECONDS = 5 * 60 * 60
const SEVEN_DAY_SECONDS = 7 * 24 * 60 * 60
const EMPIRICAL_MIN_UTILIZATION = 0.10

async function buildSessionLimitsJson() {
  const limits = await getSessionLimits().catch(() => null)
  if (!limits) return null

  const now = Date.now()
  let projectsForWindow: Awaited<ReturnType<typeof parseAllSessions>> | null = null
  if (limits.sevenDay) {
    const start = new Date((limits.sevenDay.resetsAt - SEVEN_DAY_SECONDS) * 1000)
    const end = new Date(Math.min(limits.sevenDay.resetsAt * 1000, now))
    projectsForWindow = await parseAllSessions({ start, end }, 'claude').catch(() => null)
  }

  type WindowIn = NonNullable<typeof limits>['fiveHour']
  function windowJson(win: WindowIn, windowSeconds: number, staticBudgetUsd: number) {
    if (!win) return null
    const windowEnd = new Date(win.resetsAt * 1000)
    const windowStart = new Date(windowEnd.getTime() - windowSeconds * 1000)
    const spend = projectsForWindow ? computeWindowSpend(projectsForWindow, windowStart, windowEnd) : null
    const spentUsd = spend?.spentUsd ?? 0
    const empiricalBudgetUsd = win.utilization >= EMPIRICAL_MIN_UTILIZATION && spentUsd > 0
      ? spentUsd / win.utilization
      : null
    return {
      utilization: win.utilization,
      resetsAt: win.resetsAt,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      status: win.status,
      spentUsd: convertCost(spentUsd),
      empiricalBudgetUsd: empiricalBudgetUsd !== null ? convertCost(empiricalBudgetUsd) : null,
      staticBudgetUsd: convertCost(staticBudgetUsd),
      empiricalUsable: empiricalBudgetUsd !== null,
    }
  }

  return {
    tier: limits.tier,
    subscriptionType: limits.subscriptionType,
    rateLimitTier: limits.rateLimitTier,
    overallStatus: limits.overallStatus,
    representativeClaim: limits.representativeClaim,
    fetchedAt: limits.fetchedAt,
    stale: !!limits.stale,
    error: limits.error ?? null,
    fiveHour: windowJson(limits.fiveHour, FIVE_HOUR_SECONDS, limits.staticBudget.fiveHourUsd),
    sevenDay: windowJson(limits.sevenDay, SEVEN_DAY_SECONDS, limits.staticBudget.sevenDayUsd),
  }
}

async function loadView(req: FastifyRequest): Promise<{ filters: Filters; projects: ProjectSummary[] }> {
  const filters = await parseFilters(req.query as Record<string, unknown>)
  const projects = filterProjectsByModel(await loadFilteredProjects(filters), filters.model)
  return { filters, projects }
}

function allSessions(projects: ProjectSummary[]): SessionSummary[] {
  return projects.flatMap(p => p.sessions)
}

function planUsageJson(p: Awaited<ReturnType<typeof getPlanUsageOrNull>>) {
  if (!p) return null
  return {
    id: p.plan.id,
    displayName: p.plan.id,
    monthlyUsd: p.plan.monthlyUsd,
    provider: p.plan.provider,
    spent: convertCost(p.spentApiEquivalentUsd),
    spentSubscription: convertCost(p.spentSubscriptionUsd),
    budget: convertCost(p.budgetUsd),
    percentUsed: Math.round(p.percentUsed * 10) / 10,
    percentUsedSubscription: Math.round(p.percentUsedSubscription * 10) / 10,
    status: p.status,
    statusSubscription: p.statusSubscription,
    projectedMonthEnd: convertCost(p.projectedMonthUsd),
    projectedMonthEndSubscription: convertCost(p.projectedMonthUsdSubscription),
    daysUntilReset: p.daysUntilReset,
    periodStart: p.periodStart.toISOString(),
    periodEnd: p.periodEnd.toISOString(),
  }
}

function sortEntries<T>(m: Record<string, T>, key: (v: T) => number): Array<[string, T]> {
  return Object.entries(m).sort(([, a], [, b]) => key(b) - key(a))
}

function turnCostUSD(t: ClassifiedTurn): number {
  return t.assistantCalls.reduce((a, c) => a + c.costUSD, 0)
}

function turnCacheReadCostUSD(t: ClassifiedTurn): number {
  return t.assistantCalls.reduce((a, c) => a + c.cacheReadCostUSD, 0)
}

function avgLast5TurnCostUSD(turns: ClassifiedTurn[]): { cost: number; cacheReadCost: number } {
  const last5 = turns.slice(-5)
  if (last5.length === 0) return { cost: 0, cacheReadCost: 0 }
  const cost = last5.reduce((a, t) => a + turnCostUSD(t), 0) / last5.length
  const cacheReadCost = last5.reduce((a, t) => a + turnCacheReadCostUSD(t), 0) / last5.length
  return { cost, cacheReadCost }
}

function avgLast5TurnCostAcrossSessions(sessions: SessionSummary[]): { cost: number; cacheReadCost: number } {
  const costs: Array<{ cost: number; cacheReadCost: number }> = []
  for (const s of sessions) {
    for (const t of s.turns.slice(-5)) costs.push({ cost: turnCostUSD(t), cacheReadCost: turnCacheReadCostUSD(t) })
  }
  if (costs.length === 0) return { cost: 0, cacheReadCost: 0 }
  const cost = costs.reduce((a, b) => a + b.cost, 0) / costs.length
  const cacheReadCost = costs.reduce((a, b) => a + b.cacheReadCost, 0) / costs.length
  return { cost, cacheReadCost }
}

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/filters', async (req) => {
    const f = await parseFilters(req.query as Record<string, unknown>)

    // Projects dropdown: respect period/provider/model, ignore project filter
    const forProjects = filterProjectsByModel(
      await loadFilteredProjects({ ...f, projects: [], excludes: [] }),
      f.model,
    )
    const projectNames = new Set<string>()
    for (const p of forProjects) projectNames.add(p.project)

    // Models dropdown: respect period/provider/project, ignore model filter
    const forModels = await loadFilteredProjects({ ...f, model: null })
    const modelNames = new Set<string>()
    for (const p of forModels) {
      for (const sess of p.sessions) {
        for (const m of Object.keys(sess.modelBreakdown)) modelNames.add(m)
      }
    }

    const allProviders = await getAllProviders()
    return {
      projects: [...projectNames].sort(),
      models: [...modelNames].sort(),
      providers: allProviders.map(p => ({ name: p.name, displayName: p.displayName })),
      periods: ['today', 'yesterday', 'week', '30days', 'month', 'all'],
    }
  })

  app.get('/api/summary', async (req) => {
    const { filters, projects } = await loadView(req)
    const days = aggregateProjectsIntoDays(projects)
    const period = buildPeriodDataFromDays(days, filters.label)
    const sessions = allSessions(projects)
    const totalInput = sessions.reduce((s, x) => s + x.totalInputTokens, 0)
    const totalOutput = sessions.reduce((s, x) => s + x.totalOutputTokens, 0)
    const totalCacheRead = sessions.reduce((s, x) => s + x.totalCacheReadTokens, 0)
    const totalCacheWrite = sessions.reduce((s, x) => s + x.totalCacheWriteTokens, 0)
    const totalCacheWrite1h = sessions.reduce((s, x) => s + x.totalCacheWrite1hTokens, 0)
    const totalCacheWrite5m = sessions.reduce((s, x) => s + x.totalCacheWrite5mTokens, 0)
    const plan = await getPlanUsageOrNull().catch(() => null)
    const sessionLimits = await buildSessionLimitsJson()
    const { code } = getCurrency()
    const avgLast5 = avgLast5TurnCostAcrossSessions(sessions)
    return {
      currency: code,
      label: filters.label,
      period: filters.period,
      totals: {
        cost: convertCost(period.cost),
        cacheReadCost: convertCost(period.cacheReadCost),
        calls: period.calls,
        sessions: period.sessions,
        cacheHitPercent: cacheHitPercent(totalInput, totalCacheRead, totalCacheWrite),
        avgLast5TurnCost: convertCost(avgLast5.cost),
        avgLast5TurnCacheReadCost: convertCost(avgLast5.cacheReadCost),
        tokens: {
          input: totalInput,
          output: totalOutput,
          cacheRead: totalCacheRead,
          cacheWrite: totalCacheWrite,
          cacheWrite1h: totalCacheWrite1h,
          cacheWrite5m: totalCacheWrite5m,
        },
      },
      plan: planUsageJson(plan),
      sessionLimits,
    }
  })

  app.get('/api/daily', async (req) => {
    const { projects } = await loadView(req)
    const days = aggregateProjectsIntoDays(projects)
    return days.map(d => ({
      date: d.date,
      cost: convertCost(d.cost),
      cacheReadCost: convertCost(d.cacheReadCost),
      calls: d.calls,
      sessions: d.sessions,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
    }))
  })

  app.get('/api/projects', async (req) => {
    const { projects } = await loadView(req)
    const limit = Math.min(100, Math.max(1, Number((req.query as Record<string, unknown>).limit ?? 20)))
    return projects
      .slice()
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .slice(0, limit)
      .map(p => {
        const input = p.sessions.reduce((s, x) => s + x.totalInputTokens, 0)
        const cacheRead = p.sessions.reduce((s, x) => s + x.totalCacheReadTokens, 0)
        const cacheWrite = p.sessions.reduce((s, x) => s + x.totalCacheWriteTokens, 0)
        return {
          name: p.project,
          path: p.projectPath,
          cost: convertCost(p.totalCostUSD),
          cacheReadCost: convertCost(p.totalCacheReadCostUSD),
          avgCostPerSession: p.sessions.length > 0 ? convertCost(p.totalCostUSD / p.sessions.length) : 0,
          avgCacheReadCostPerSession: p.sessions.length > 0 ? convertCost(p.totalCacheReadCostUSD / p.sessions.length) : 0,
          calls: p.totalApiCalls,
          sessions: p.sessions.length,
          cacheHitPercent: cacheHitPercent(input, cacheRead, cacheWrite),
        }
      })
  })

  app.get('/api/sessions/top', async (req) => {
    const { projects } = await loadView(req)
    const limit = Math.min(50, Math.max(1, Number((req.query as Record<string, unknown>).limit ?? 10)))
    return projects
      .flatMap(p => p.sessions.map(s => {
        const topModel = sortEntries(s.modelBreakdown, v => v.costUSD)[0]
        const avg5 = avgLast5TurnCostUSD(s.turns)
        return {
          project: p.project,
          projectPath: s.project.replace(/-/g, '/'),
          sessionId: s.sessionId,
          date: s.firstTimestamp ? dateKey(s.firstTimestamp) : null,
          model: topModel ? topModel[0] : null,
          cost: convertCost(s.totalCostUSD),
          cacheReadCost: convertCost(s.totalCacheReadCostUSD),
          calls: s.apiCalls,
          cacheHitPercent: cacheHitPercent(s.totalInputTokens, s.totalCacheReadTokens, s.totalCacheWriteTokens),
          avgLast5TurnCost: convertCost(avg5.cost),
          avgLast5TurnCacheReadCost: convertCost(avg5.cacheReadCost),
          turns: s.turns.length,
        }
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit)
  })

  app.get('/api/activities', async (req) => {
    const { projects } = await loadView(req)
    const sessions = allSessions(projects)
    const totals: Record<string, { turns: number; cost: number; cacheReadCost: number; editTurns: number; oneShotTurns: number; input: number; cacheRead: number; cacheWrite: number }> = {}
    for (const sess of sessions) {
      for (const [cat, d] of Object.entries(sess.categoryBreakdown)) {
        const t = totals[cat] ?? { turns: 0, cost: 0, cacheReadCost: 0, editTurns: 0, oneShotTurns: 0, input: 0, cacheRead: 0, cacheWrite: 0 }
        t.turns += d.turns
        t.cost += d.costUSD
        t.cacheReadCost += d.cacheReadCostUSD
        t.editTurns += d.editTurns
        t.oneShotTurns += d.oneShotTurns
        totals[cat] = t
      }
      for (const turn of sess.turns) {
        const t = totals[turn.category]
        if (!t) continue
        for (const call of turn.assistantCalls) {
          t.input += call.usage.inputTokens
          t.cacheRead += call.usage.cacheReadInputTokens
          t.cacheWrite += call.usage.cacheCreationInputTokens
        }
      }
    }
    return sortEntries(totals, v => v.cost).map(([cat, d]) => ({
      category: cat,
      name: CATEGORY_LABELS[cat as TaskCategory] ?? cat,
      cost: convertCost(d.cost),
      cacheReadCost: convertCost(d.cacheReadCost),
      turns: d.turns,
      editTurns: d.editTurns,
      oneShotTurns: d.oneShotTurns,
      oneShotRate: d.editTurns > 0 ? Math.round((d.oneShotTurns / d.editTurns) * 1000) / 10 : null,
      cacheHitPercent: cacheHitPercent(d.input, d.cacheRead, d.cacheWrite),
    }))
  })

  app.get('/api/models', async (req) => {
    const { projects } = await loadView(req)
    const sessions = allSessions(projects)
    const totals: Record<string, { calls: number; cost: number; cacheReadCost: number; input: number; output: number; cacheRead: number; cacheWrite: number }> = {}
    for (const sess of sessions) {
      for (const [name, d] of Object.entries(sess.modelBreakdown)) {
        const t = totals[name] ?? { calls: 0, cost: 0, cacheReadCost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        t.calls += d.calls
        t.cost += d.costUSD
        t.cacheReadCost += d.cacheReadCostUSD
        t.input += d.tokens.inputTokens
        t.output += d.tokens.outputTokens
        t.cacheRead += d.tokens.cacheReadInputTokens
        t.cacheWrite += d.tokens.cacheCreationInputTokens
        totals[name] = t
      }
    }
    return sortEntries(totals, v => v.cost).slice(0, 20).map(([name, d]) => ({
      name,
      cost: convertCost(d.cost),
      cacheReadCost: convertCost(d.cacheReadCost),
      calls: d.calls,
      cacheHitPercent: cacheHitPercent(d.input, d.cacheRead, d.cacheWrite),
      tokens: { input: d.input, output: d.output, cacheRead: d.cacheRead, cacheWrite: d.cacheWrite },
    }))
  })

  app.get('/api/session/:id', async (req, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    // Session detail ignores period/filter — search across all available data.
    const projects = await loadFilteredProjects(await parseFilters({ period: 'all', provider: 'all' }))
    let found: { project: ProjectSummary; session: SessionSummary } | null = null
    for (const p of projects) {
      const s = p.sessions.find(x => x.sessionId === id)
      if (s) { found = { project: p, session: s }; break }
    }
    if (!found) { reply.code(404).send({ error: 'Session not found' }); return }

    const { project: p, session: s } = found
    const turns = s.turns.map(t => ({
      timestamp: t.timestamp,
      category: t.category,
      userMessage: t.userMessage.slice(0, 500),
      calls: t.assistantCalls.length,
      cost: convertCost(turnCostUSD(t)),
      cacheReadCost: convertCost(turnCacheReadCostUSD(t)),
      retries: t.retries,
      hasEdits: t.hasEdits,
    }))
    const avg5 = avgLast5TurnCostUSD(s.turns)
    return {
      sessionId: s.sessionId,
      project: p.project,
      projectPath: p.projectPath,
      firstTimestamp: s.firstTimestamp,
      lastTimestamp: s.lastTimestamp,
      cost: convertCost(s.totalCostUSD),
      cacheReadCost: convertCost(s.totalCacheReadCostUSD),
      calls: s.apiCalls,
      totalTurns: s.turns.length,
      avgLast5TurnCost: convertCost(avg5.cost),
      avgLast5TurnCacheReadCost: convertCost(avg5.cacheReadCost),
      cacheHitPercent: cacheHitPercent(s.totalInputTokens, s.totalCacheReadTokens, s.totalCacheWriteTokens),
      tokens: {
        input: s.totalInputTokens,
        output: s.totalOutputTokens,
        cacheRead: s.totalCacheReadTokens,
        cacheWrite: s.totalCacheWriteTokens,
      },
      modelBreakdown: Object.entries(s.modelBreakdown).map(([name, d]) => ({
        name,
        cost: convertCost(d.costUSD),
        cacheReadCost: convertCost(d.cacheReadCostUSD),
        calls: d.calls,
      })).sort((a, b) => b.cost - a.cost),
      turns,
    }
  })

  app.get('/api/tools', async (req) => {
    const { projects } = await loadView(req)
    const sessions = allSessions(projects)
    const tools: Record<string, number> = {}
    const bash: Record<string, number> = {}
    const mcp: Record<string, number> = {}
    for (const sess of sessions) {
      for (const [t, d] of Object.entries(sess.toolBreakdown)) tools[t] = (tools[t] ?? 0) + d.calls
      for (const [b, d] of Object.entries(sess.bashBreakdown)) bash[b] = (bash[b] ?? 0) + d.calls
      for (const [m, d] of Object.entries(sess.mcpBreakdown)) mcp[m] = (mcp[m] ?? 0) + d.calls
    }
    const limit = Math.min(100, Math.max(1, Number((req.query as Record<string, unknown>).limit ?? 20)))
    const toList = (m: Record<string, number>) =>
      Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, limit).map(([name, calls]) => ({ name, calls }))
    return { tools: toList(tools), bash: toList(bash), mcp: toList(mcp) }
  })

  app.post('/api/ingest/full-rescan', async (_req, reply: FastifyReply) => {
    if (isSweepRunning()) {
      reply.code(409).send({ error: 'ingest already running', status: getStatus() })
      return
    }
    void sweepOnce()
    reply.code(202).send({ status: getStatus() })
  })

  app.get('/api/ingest/status', async (req, reply: FastifyReply) => {
    const wantsStream = (req.headers.accept ?? '').includes('text/event-stream')
    if (!wantsStream) {
      return { ...getStatus(), sessionsInDb: countSessions(getDb()) }
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (s: IngestStatus) => {
      reply.raw.write(`data: ${JSON.stringify(s)}\n\n`)
    }
    send(getStatus())
    const listener = (s: IngestStatus) => send(s)
    statusEmitter.on('change', listener)
    const keepAlive = setInterval(() => { reply.raw.write(': ping\n\n') }, 15_000)
    req.raw.on('close', () => {
      clearInterval(keepAlive)
      statusEmitter.off('change', listener)
    })
    // Prevent fastify from hijacking/closing; returning the raw stream keeps it open.
    return reply
  })

  app.get('/api/settings', async () => {
    const config = await readConfig()
    const ing = getIngestionConfig(config)
    return {
      ingestion: ing,
      defaults: { sweepIntervalMs: DEFAULT_SWEEP_INTERVAL_MS },
      sessionsInDb: countSessions(getDb()),
    }
  })

  app.put('/api/settings', async (req, reply: FastifyReply) => {
    const body = (req.body ?? {}) as { ingestion?: { enabled?: boolean; sweepIntervalMs?: number } }
    if (!body.ingestion) { reply.code(400).send({ error: 'missing ingestion' }); return }
    await saveIngestionConfig(body.ingestion)
    const config = await readConfig()
    return { ingestion: getIngestionConfig(config) }
  })

  app.get('/api/export.csv', async (req, reply: FastifyReply) => {
    const { projects, filters } = await loadView(req)
    const { code } = getCurrency()
    const headers = ['date', 'project', 'sessionId', 'model', 'costUSD', `cost_${code}`, 'cacheReadCostUSD', `cacheReadCost_${code}`, 'calls']
    const lines = [headers.join(',')]
    for (const p of projects) {
      for (const s of p.sessions) {
        const topModel = sortEntries(s.modelBreakdown, v => v.costUSD)[0]
        const date = s.firstTimestamp ? dateKey(s.firstTimestamp) : ''
        const model = topModel ? topModel[0] : ''
        lines.push([
          date,
          csvField(p.project),
          csvField(s.sessionId),
          csvField(model),
          s.totalCostUSD.toFixed(4),
          convertCost(s.totalCostUSD).toFixed(4),
          s.totalCacheReadCostUSD.toFixed(4),
          convertCost(s.totalCacheReadCostUSD).toFixed(4),
          String(s.apiCalls),
        ].join(','))
      }
    }
    const filename = `codeburn-${filters.period}-${new Date().toISOString().slice(0, 10)}.csv`
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return lines.join('\n') + '\n'
  })
}

function csvField(s: string): string {
  const sanitized = /^[\t\r=+\-@]/.test(s) ? `'${s}` : s
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`
  }
  return sanitized
}
