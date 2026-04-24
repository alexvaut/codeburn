import { EventEmitter } from 'node:events'

export type IngestPhase = 'idle' | 'scanning' | 'ingesting' | 'error'

export type IngestStatus = {
  phase: IngestPhase
  filesTotal: number
  filesDone: number
  currentFile: string | null
  startedAt: number | null
  finishedAt: number | null
  error: string | null
  lastSweepAt: number | null
}

const initial: IngestStatus = {
  phase: 'idle',
  filesTotal: 0,
  filesDone: 0,
  currentFile: null,
  startedAt: null,
  finishedAt: null,
  error: null,
  lastSweepAt: null,
}

let current: IngestStatus = { ...initial }
export const statusEmitter = new EventEmitter()
statusEmitter.setMaxListeners(50)

export function getStatus(): IngestStatus {
  return { ...current }
}

export function updateStatus(patch: Partial<IngestStatus>): void {
  current = { ...current, ...patch }
  statusEmitter.emit('change', getStatus())
}

export function resetStatus(): void {
  current = { ...initial, lastSweepAt: current.lastSweepAt }
  statusEmitter.emit('change', getStatus())
}
