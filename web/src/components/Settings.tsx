import { useEffect, useRef, useState } from 'react'
import { api, type IngestStatus, type SettingsPayload } from '../api'
import { navigate } from '../router'

export function Settings() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [status, setStatus] = useState<IngestStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [intervalSec, setIntervalSec] = useState(30)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    api.settings().then(s => {
      setSettings(s)
      setEnabled(s.ingestion.enabled)
      setIntervalSec(Math.round(s.ingestion.sweepIntervalMs / 1000))
    }).catch(e => setErr(String(e)))

    const es = new EventSource(api.ingestStatusStreamUrl)
    esRef.current = es
    es.onmessage = (ev) => {
      try { setStatus(JSON.parse(ev.data) as IngestStatus) } catch {}
    }
    es.onerror = () => { /* let browser reconnect */ }
    return () => { es.close() }
  }, [])

  async function onLoadAll() {
    setErr(null)
    try {
      await api.ingestStart()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function onSaveSettings() {
    setErr(null)
    try {
      await api.updateSettings({ enabled, sweepIntervalMs: Math.max(5, intervalSec) * 1000 })
      const s = await api.settings()
      setSettings(s)
    } catch (e) {
      setErr(String(e))
    }
  }

  const phase = status?.phase ?? 'idle'
  const isRunning = phase === 'scanning' || phase === 'ingesting'
  const pct = status && status.filesTotal > 0 ? Math.round((status.filesDone / status.filesTotal) * 100) : 0
  const sessionsInDb = status?.sessionsInDb ?? settings?.sessionsInDb ?? 0

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <header className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
        <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Settings</h1>
        <button
          onClick={() => navigate('/')}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to Dashboard
        </button>
      </header>

      {err && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Data ingestion</h2>
        <p className="mb-4 text-xs text-slate-600">
          Sessions in database: <span className="font-mono">{sessionsInDb}</span>.
          Use the button below to run a full scan (first-time setup or after a config change).
          The background sweeper keeps the database current.
        </p>
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={onLoadAll}
            disabled={isRunning}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {isRunning ? 'Scanning…' : (sessionsInDb === 0 ? 'Load all data' : 'Re-scan all files')}
          </button>
          <span className="text-xs text-slate-500">Phase: <span className="font-mono">{phase}</span></span>
        </div>
        {status && status.filesTotal > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
              <span>{status.filesDone} / {status.filesTotal} files</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            {status.currentFile && (
              <p className="mt-2 truncate text-[11px] text-slate-400" title={status.currentFile}>{status.currentFile}</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Background sweeper</h2>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Enable background sweeper (pick up new and updated session files)
        </label>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          Sweep interval (seconds)
          <input
            type="number"
            min={5}
            value={intervalSec}
            onChange={e => setIntervalSec(Number(e.target.value))}
            className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-500">(restart server to apply interval changes)</span>
        </label>
        <button
          onClick={onSaveSettings}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </section>
    </div>
  )
}
