import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useFilters } from '../filters-context'
import { useCostMode, displayCost } from '../cost-mode'
import { fmtCost } from '../format'
import { Bar } from './Bar'

const COLORS: Record<string, string> = {
  coding: '#2563EB',
  debugging: '#DC2626',
  feature: '#16A34A',
  refactoring: '#CA8A04',
  testing: '#9333EA',
  exploration: '#0891B2',
  planning: '#4F46E5',
  delegation: '#7C3AED',
  git: '#64748B',
  'build/deploy': '#0F766E',
  conversation: '#64748B',
  brainstorming: '#BE185D',
  general: '#64748B',
}

function oneShotClass(rate: number | null): string {
  if (rate === null) return 'text-slate-400'
  if (rate >= 60) return 'text-emerald-700'
  if (rate >= 40) return 'text-amber-700'
  return 'text-rose-700'
}

export function ActivityList() {
  const { filters } = useFilters()
  const { mode } = useCostMode()
  const { data } = useQuery({ queryKey: ['activities', filters], queryFn: () => api.activities(filters) })
  const rows = (data ?? []).map(r => ({ ...r, displayCost: displayCost(r, mode) }))
  const max = rows.reduce((m, r) => Math.max(m, r.displayCost), 0)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">By Activity</h2>
        <span className="text-[11px] text-slate-500">cost · turns · cache · 1-shot</span>
      </div>
      <div className="space-y-2.5">
        {rows.map(r => {
          const color = COLORS[r.category] ?? '#334155'
          return (
            <div key={r.category} className="grid grid-cols-[8rem_1fr_5rem_3.5rem_3.5rem_3.5rem] items-center gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate text-slate-900">{r.name}</span>
              </div>
              <Bar value={r.displayCost} max={max} color={color} height="h-1.5" />
              <div className="text-right font-mono font-medium text-slate-900 tabular">{fmtCost(r.displayCost)}</div>
              <div className="text-right font-mono text-slate-600 tabular">{r.turns}</div>
              <div className="text-right font-mono text-slate-600 tabular">{r.cacheHitPercent.toFixed(1)}%</div>
              <div className={`text-right font-mono tabular ${oneShotClass(r.oneShotRate)}`}>
                {r.oneShotRate === null ? '—' : `${r.oneShotRate.toFixed(0)}%`}
              </div>
            </div>
          )
        })}
        {rows.length === 0 && <div className="text-xs text-slate-500">No activities.</div>}
      </div>
    </div>
  )
}
