import { filterProjectsByName } from '../parser.js'
import { queryProjects } from '../db/query.js'
import { getSessionLimits } from '../session-limits.js'
import type { DateRange, ProjectSummary } from '../types.js'

export type Period = 'today' | 'yesterday' | 'week' | '30days' | 'month' | 'all' | '5h' | '7d'

export type Filters = {
  range: DateRange
  label: string
  period: Period | 'custom'
  provider: string
  projects: string[]
  excludes: string[]
  model: string | null
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function resolvePeriodSync(period: string): { range: DateRange; label: string; period: Period } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  switch (period) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { range: { start, end }, label: `Today (${toDateString(start)})`, period: 'today' }
    }
    case 'yesterday': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
      return { range: { start, end: yesterdayEnd }, label: `Yesterday (${toDateString(start)})`, period: 'yesterday' }
    }
    case '30days': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
      return { range: { start, end }, label: 'Last 30 Days', period: '30days' }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { range: { start, end }, label: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`, period: 'month' }
    }
    case 'all': {
      const start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
      return { range: { start, end }, label: 'Last 6 months', period: 'all' }
    }
    case 'week':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      return { range: { start, end }, label: 'Last 7 Days', period: 'week' }
    }
  }
}

const FIVE_HOUR_SECONDS = 5 * 60 * 60
const SEVEN_DAY_SECONDS = 7 * 24 * 60 * 60

async function resolveWindowPeriod(period: '5h' | '7d'): Promise<{ range: DateRange; label: string; period: Period }> {
  const limits = await getSessionLimits().catch(() => null)
  const now = Date.now()
  if (period === '5h') {
    const win = limits?.fiveHour
    const resetsAt = win?.resetsAt ?? Math.floor(now / 1000) + FIVE_HOUR_SECONDS
    const end = new Date(resetsAt * 1000)
    const start = new Date(end.getTime() - FIVE_HOUR_SECONDS * 1000)
    return { range: { start, end }, label: '5-Hour Window', period: '5h' }
  } else {
    const win = limits?.sevenDay
    const resetsAt = win?.resetsAt ?? Math.floor(now / 1000) + SEVEN_DAY_SECONDS
    const end = new Date(resetsAt * 1000)
    const start = new Date(end.getTime() - SEVEN_DAY_SECONDS * 1000)
    return { range: { start, end }, label: '7-Day Window', period: '7d' }
  }
}

function parseDate(s: string, endOfDay = false): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!match) throw new Error(`Invalid date: ${s} (expected YYYY-MM-DD)`)
  const [, y, m, d] = match
  const Y = Number(y), M = Number(m) - 1, D = Number(d)
  return endOfDay
    ? new Date(Y, M, D, 23, 59, 59, 999)
    : new Date(Y, M, D, 0, 0, 0, 0)
}

function toArray(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  return String(v).split(',').map(s => s.trim()).filter(Boolean)
}

export async function parseFilters(query: Record<string, unknown>): Promise<Filters> {
  const from = typeof query.from === 'string' && query.from ? query.from : null
  const to = typeof query.to === 'string' && query.to ? query.to : null
  const periodStr = typeof query.period === 'string' && query.period ? query.period : 'week'

  let range: DateRange
  let label: string
  let period: Filters['period']
  if (from || to) {
    const start = from ? parseDate(from, false) : new Date(2000, 0, 1)
    const end = to ? parseDate(to, true) : new Date()
    range = { start, end }
    label = `${from ?? 'all'} to ${to ?? 'today'}`
    period = 'custom'
  } else if (periodStr === '5h' || periodStr === '7d') {
    const r = await resolveWindowPeriod(periodStr)
    range = r.range
    label = r.label
    period = r.period
  } else {
    const r = resolvePeriodSync(periodStr)
    range = r.range
    label = r.label
    period = r.period
  }

  const provider = typeof query.provider === 'string' && query.provider ? query.provider : 'all'
  const projects = toArray(query.project)
  const excludes = toArray(query.exclude)
  const modelRaw = typeof query.model === 'string' ? query.model.trim() : ''
  const model = modelRaw && modelRaw !== 'all' ? modelRaw : null

  return { range, label, period, provider, projects, excludes, model }
}

export async function loadFilteredProjects(f: Filters): Promise<ProjectSummary[]> {
  return filterProjectsByName(
    await queryProjects(f.range, f.provider),
    f.projects,
    f.excludes,
  )
}
