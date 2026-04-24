import { readConfig } from '../config.js'
import { discoverAllSessions } from '../providers/index.js'
import { compileRules } from '../parser-internals.js'
import { expandSourcesToFiles, ingestFileIfChanged } from './ingestor.js'
import { getStatus, updateStatus } from './status.js'

let sweeping: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | null = null

export async function sweepOnce(): Promise<void> {
  if (sweeping) return sweeping
  sweeping = (async () => {
    try {
      updateStatus({ phase: 'scanning', startedAt: Date.now(), finishedAt: null, error: null, filesDone: 0, filesTotal: 0, currentFile: null })
      const config = await readConfig()
      const rules = compileRules(config.projectGroups)
      const sources = await discoverAllSessions()
      const tasks = await expandSourcesToFiles(sources)
      updateStatus({ phase: 'ingesting', filesTotal: tasks.length })
      let done = 0
      for (const task of tasks) {
        updateStatus({ currentFile: task.filePath })
        try {
          await ingestFileIfChanged(task, rules)
        } catch (err) {
          // One bad file shouldn't stop the whole sweep.
          const msg = err instanceof Error ? err.message : String(err)
          process.stderr.write(`codeburn: ingest failed for ${task.filePath}: ${msg}\n`)
        }
        done++
        updateStatus({ filesDone: done })
      }
      updateStatus({ phase: 'idle', currentFile: null, finishedAt: Date.now(), lastSweepAt: Date.now() })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      updateStatus({ phase: 'error', error: msg, finishedAt: Date.now() })
    } finally {
      sweeping = null
    }
  })()
  return sweeping
}

export function startSweeper(intervalMs: number): void {
  if (timer) return
  // Kick off an initial sweep right away; then on interval.
  void sweepOnce()
  timer = setInterval(() => { void sweepOnce() }, intervalMs)
}

export function stopSweeper(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function isSweepRunning(): boolean {
  return getStatus().phase === 'scanning' || getStatus().phase === 'ingesting'
}
