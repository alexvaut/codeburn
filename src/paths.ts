import { homedir } from 'os'
import { join } from 'path'

export function getCacheDir(): string {
  return process.env['CODEBURN_CACHE_DIR'] ?? join(homedir(), '.cache', 'codeburn')
}

export function getDbPath(): string {
  return join(getCacheDir(), 'codeburn.db')
}
