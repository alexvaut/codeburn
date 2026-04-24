import type { SqliteWritable } from '../sqlite.js'

export const SCHEMA_VERSION = 1

const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_files (
  path TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  project TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  last_offset INTEGER NOT NULL DEFAULT 0,
  ingested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_provider ON source_files(provider);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  project TEXT NOT NULL,
  project_canonical TEXT NOT NULL,
  first_ts TEXT,
  last_ts TEXT,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL,
  PRIMARY KEY (session_id, provider, project)
);
CREATE INDEX IF NOT EXISTS idx_sessions_range ON sessions(last_ts, first_ts);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);
CREATE INDEX IF NOT EXISTS idx_sessions_canonical ON sessions(project_canonical);
`

export function runMigrations(db: SqliteWritable): void {
  db.exec(DDL)
  const current = db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', ['schema_version'])
  if (!current) {
    db.run('INSERT INTO meta (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)])
  }
}
