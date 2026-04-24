import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type SessionWindow, type SessionLimits } from '../api'
import { useFilters } from '../filters-context'
import { fmtCost } from '../format'

type BudgetSource = 'empirical' | 'static'

const TIER_LABEL: Record<SessionLimits['tier'], string> = {
  pro: 'Pro',
  max_5x: 'Max 5×',
  max_20x: 'Max 20×',
  unknown: 'Unknown tier',
}

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    const rh = h % 24
    return `${d}d ${rh}h`
  }
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtCountdown(resetsAt: number, now: number): string {
  return fmtDuration(resetsAt - Math.floor(now / 1000))
}

function pctBarColor(pct: number): string {
  if (pct >= 100) return 'bg-rose-700'
  if (pct >= 85) return 'bg-amber-600'
  return 'bg-slate-700'
}

type Pace =
  | { status: 'ok' }
  | { status: 'over'; extraSeconds: number; projected: number }

function computePace(win: SessionWindow, now: number): Pace | null {
  const nowSec = Math.floor(now / 1000)
  const startSec = Math.floor(new Date(win.windowStart).getTime() / 1000)
  const endSec = Math.floor(new Date(win.windowEnd).getTime() / 1000)
  const elapsed = nowSec - startSec
  const duration = endSec - startSec
  if (elapsed <= 0 || duration <= 0) return null
  const u = win.utilization
  if (u >= 1) {
    return { status: 'over', extraSeconds: Math.max(0, endSec - nowSec), projected: u }
  }
  if (u <= 0) return { status: 'ok' }
  const projected = (u * duration) / elapsed
  if (projected <= 1) return { status: 'ok' }
  const timeToLimit = (elapsed * (1 - u)) / u
  const extra = Math.max(0, endSec - nowSec - timeToLimit)
  return { status: 'over', extraSeconds: extra, projected }
}

function WindowCell({ title, win, source, now }: { title: string; win: SessionWindow | null; source: BudgetSource; now: number }) {
  if (!win) {
    return (
      <div className="flex-1 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{title}</div>
        <div className="mt-2 text-xs text-slate-400">No data yet. Send a request to populate.</div>
      </div>
    )
  }

  const effectiveSource: BudgetSource = source === 'empirical' && win.empiricalUsable ? 'empirical' : 'static'
  const budget = effectiveSource === 'empirical' ? (win.empiricalBudgetUsd ?? win.staticBudgetUsd) : win.staticBudgetUsd
  const pct = win.utilization * 100
  const remaining = Math.max(0, budget - win.spentUsd)
  const clampedPct = Math.min(100, pct)
  const fallbackFired = source === 'empirical' && !win.empiricalUsable
  const pace = computePace(win, now)

  return (
    <div className="flex-1 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{title}</div>
        <div className="text-xs text-slate-500">resets in {fmtCountdown(win.resetsAt, now)}</div>
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className="font-mono text-3xl font-semibold text-slate-900 tabular">{pct.toFixed(1)}%</div>
        <div className="text-xs text-slate-500">
          {fmtCost(win.spentUsd)} of <span className="font-medium text-slate-700">{fmtCost(budget)}</span>
          {' · '}
          <span className="text-slate-400">{fmtCost(remaining)} left</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${pctBarColor(pct)}`} style={{ width: `${clampedPct}%` }} />
      </div>
      {pace && (
        <div className="mt-1.5 text-[11px]">
          {pace.status === 'ok' ? (
            <span className="font-medium text-emerald-600">On pace — full window usable</span>
          ) : (
            <span className={`font-medium ${pace.projected >= 1.5 ? 'text-rose-600' : 'text-amber-600'}`}>
              ~{fmtDuration(pace.extraSeconds)} of extra usage needed at this pace
            </span>
          )}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
        <span>
          budget:{' '}
          <span className="font-medium text-slate-600">
            {effectiveSource === 'empirical' ? 'empirical' : 'static'}
          </span>
          {fallbackFired && <span className="text-slate-400"> (fallback &lt;10%)</span>}
        </span>        
      </div>
    </div>
  )
}

export function SessionWindows() {
  const { filters } = useFilters()
  const { data } = useQuery({ queryKey: ['summary', filters], queryFn: () => api.summary(filters) })
  const [source, setSource] = useState<BudgetSource>('empirical')
  const [now, setNow] = useState<number>(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const limits = data?.sessionLimits
  if (!limits) return null

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Session limits</h2>
          <span className="text-[11px] text-slate-500">{TIER_LABEL[limits.tier]}</span>
          {limits.stale && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">stale</span>}
        </div>
        <BudgetSourceToggle source={source} setSource={setSource} />
      </div>
      <div className="flex flex-col divide-y divide-slate-100 md:flex-row md:divide-x md:divide-y-0">
        <WindowCell title="5-hour" win={limits.fiveHour} source={source} now={now} />
        <WindowCell title="7-day" win={limits.sevenDay} source={source} now={now} />
      </div>
      <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-500">
        Dollars exclude cache reads (what actually consumes your plan window). Empirical budget = spend ÷ utilization, falls back to static tier table below 10%.
      </div>
    </section>
  )
}

function BudgetSourceToggle({ source, setSource }: { source: BudgetSource; setSource: (s: BudgetSource) => void }) {
  const btn = (s: BudgetSource, label: string, title: string) => (
    <button
      key={s}
      onClick={() => setSource(s)}
      title={title}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        source === s
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
      {btn('empirical', 'Empirical', 'Budget inferred from your actual spend ÷ utilization (needs ≥10% util)')}
      {btn('static', 'Static', 'Budget from the published tier table (Pro / Max 5× / Max 20×)')}
    </div>
  )
}
