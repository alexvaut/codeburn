import type { DateRange, ProjectSummary, SessionSummary } from '../types.js'
import { filterSessionByRange, unsanitizePath } from '../parser-internals.js'
import { getDb } from './connection.js'
import { queryRawSessions } from './repo.js'

function isoOr(d?: Date): string | undefined {
  return d ? d.toISOString() : undefined
}

export async function queryProjects(
  dateRange?: DateRange,
  providerFilter?: string,
): Promise<ProjectSummary[]> {
  const db = getDb()
  const rows = queryRawSessions(db, {
    provider: providerFilter,
    rangeStartIso: isoOr(dateRange?.start),
    rangeEndIso: isoOr(dateRange?.end),
  })

  const projectMap = new Map<string, SessionSummary[]>()
  const projectPathMap = new Map<string, string>()

  for (const { row, summary } of rows) {
    let restricted: SessionSummary | null = summary
    if (dateRange) {
      restricted = filterSessionByRange(summary, dateRange)
      if (!restricted) continue
    }
    if (restricted.apiCalls === 0) continue
    const canonical = row.project_canonical
    const existing = projectMap.get(canonical) ?? []
    existing.push(restricted)
    projectMap.set(canonical, existing)
    const path = unsanitizePath(row.project)
    const current = projectPathMap.get(canonical)
    if (!current || path.length < current.length) projectPathMap.set(canonical, path)
  }

  const projects: ProjectSummary[] = []
  for (const [name, sessions] of projectMap) {
    projects.push({
      project: name,
      projectPath: projectPathMap.get(name) ?? unsanitizePath(name),
      sessions,
      totalCostUSD: sessions.reduce((s, x) => s + x.totalCostUSD, 0),
      totalCacheReadCostUSD: sessions.reduce((s, x) => s + x.totalCacheReadCostUSD, 0),
      totalApiCalls: sessions.reduce((s, x) => s + x.apiCalls, 0),
    })
  }

  return projects.sort((a, b) => b.totalCostUSD - a.totalCostUSD)
}
