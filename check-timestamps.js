const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')

const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
const db = new Database(dbPath, { readonly: true })

const rows = db.prepare(`
  SELECT json_extract(value, '$.createdAt') as ts
  FROM cursorDiskKV
  WHERE key LIKE 'bubbleId:%'
    AND json_extract(value, '$.tokenCount.inputTokens') > 0
  ORDER BY json_extract(value, '$.createdAt') DESC
  LIMIT 5
`).all()

console.log('Latest 5 timestamps:', rows)
console.log('As dates:', rows.map(r => ({ ts: r.ts, date: new Date(r.ts).toISOString() })))
console.log('Now:', Date.now())
console.log('120 days ago:', Date.now() - 120 * 24 * 60 * 60 * 1000)
db.close()
