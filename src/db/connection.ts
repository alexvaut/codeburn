import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openWritable, type SqliteWritable } from '../sqlite.js'
import { getDbPath } from '../paths.js'
import { runMigrations } from './schema.js'

let db: SqliteWritable | null = null

export function getDb(): SqliteWritable {
  if (db) return db
  const path = getDbPath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  db = openWritable(path)
  runMigrations(db)
  return db
}

export function closeDb(): void {
  if (db) {
    try { db.close() } catch { /* ignore */ }
    db = null
  }
}
