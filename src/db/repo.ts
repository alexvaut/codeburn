import type { SqliteWritable } from '../sqlite.js'
import type { SessionSummary } from '../types.js'

export type SourceFileRow = {
  path: string
  provider: string
  project: string
  size: number
  mtime_ms: number
  last_offset: number
  ingested_at: number
}

export type SessionRow = {
  session_id: string
  provider: string
  project: string
  project_canonical: string
  first_ts: string | null
  last_ts: string | null
  total_cost_usd: number
  api_calls: number
  summary_json: string
}

export function getSourceFile(db: SqliteWritable, path: string): SourceFileRow | undefined {
  return db.get<SourceFileRow>('SELECT * FROM source_files WHERE path = ?', [path])
}

export function listSourceFiles(db: SqliteWritable): SourceFileRow[] {
  return db.query<SourceFileRow>('SELECT * FROM source_files')
}

export function upsertSourceFile(db: SqliteWritable, row: SourceFileRow): void {
  db.run(
    `INSERT INTO source_files (path, provider, project, size, mtime_ms, last_offset, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       provider=excluded.provider,
       project=excluded.project,
       size=excluded.size,
       mtime_ms=excluded.mtime_ms,
       last_offset=excluded.last_offset,
       ingested_at=excluded.ingested_at`,
    [row.path, row.provider, row.project, row.size, row.mtime_ms, row.last_offset, row.ingested_at],
  )
}

export function upsertSession(
  db: SqliteWritable,
  provider: string,
  project: string,
  projectCanonical: string,
  session: SessionSummary,
): void {
  db.run(
    `INSERT INTO sessions (session_id, provider, project, project_canonical, first_ts, last_ts, total_cost_usd, api_calls, summary_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, provider, project) DO UPDATE SET
       project_canonical=excluded.project_canonical,
       first_ts=excluded.first_ts,
       last_ts=excluded.last_ts,
       total_cost_usd=excluded.total_cost_usd,
       api_calls=excluded.api_calls,
       summary_json=excluded.summary_json`,
    [
      session.sessionId,
      provider,
      project,
      projectCanonical,
      session.firstTimestamp || null,
      session.lastTimestamp || null,
      session.totalCostUSD,
      session.apiCalls,
      JSON.stringify(session),
    ],
  )
}

export function deleteSessionsForFile(
  db: SqliteWritable,
  provider: string,
  project: string,
  sessionIds: string[],
): void {
  if (sessionIds.length === 0) return
  const placeholders = sessionIds.map(() => '?').join(',')
  db.run(
    `DELETE FROM sessions WHERE provider = ? AND project = ? AND session_id IN (${placeholders})`,
    [provider, project, ...sessionIds],
  )
}

export type SessionQuery = {
  provider?: string
  rangeStartIso?: string
  rangeEndIso?: string
}

/// Fetch all sessions whose last-ts >= rangeStart AND first-ts <= rangeEnd. Returns parsed
/// summaries. Caller is responsible for final in-range turn filtering + re-aggregation.
export function queryRawSessions(db: SqliteWritable, q: SessionQuery): Array<{
  row: SessionRow
  summary: SessionSummary
}> {
  const conds: string[] = []
  const params: unknown[] = []
  if (q.provider && q.provider !== 'all') {
    conds.push('provider = ?')
    params.push(q.provider)
  }
  if (q.rangeEndIso) {
    conds.push('(first_ts IS NULL OR first_ts <= ?)')
    params.push(q.rangeEndIso)
  }
  if (q.rangeStartIso) {
    conds.push('(last_ts IS NULL OR last_ts >= ?)')
    params.push(q.rangeStartIso)
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
  const rows = db.query<SessionRow>(`SELECT * FROM sessions ${where}`, params)
  return rows.map(row => ({ row, summary: JSON.parse(row.summary_json) as SessionSummary }))
}

export function countSessions(db: SqliteWritable): number {
  const r = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM sessions')
  return r?.c ?? 0
}
