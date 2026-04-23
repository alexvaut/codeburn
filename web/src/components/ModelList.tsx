import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useFilters } from '../filters-context'
import { useCostMode, displayCost } from '../cost-mode'
import { fmtCost, fmtNumber } from '../format'
import { Bar } from './Bar'

export function ModelList() {
  const { filters } = useFilters()
  const { mode } = useCostMode()
  const { data } = useQuery({ queryKey: ['models', filters], queryFn: () => api.models(filters) })
  const rows = (data ?? []).map(r => ({ ...r, displayCost: displayCost(r, mode) }))
  const max = rows.reduce((m, r) => Math.max(m, r.displayCost), 0)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">By Model</h2>
        <span className="text-[11px] text-slate-500">cost · cache hit · calls</span>
      </div>
      <div className="space-y-2.5">
        {rows.map(r => (
          <div key={r.name} className="grid grid-cols-[10rem_1fr_5rem_4rem_4rem] items-center gap-3 text-sm">
            <div className="truncate font-mono text-slate-900" title={r.name}>{r.name}</div>
            <Bar value={r.displayCost} max={max} height="h-1.5" />
            <div className="text-right font-mono font-medium text-slate-900 tabular">{fmtCost(r.displayCost)}</div>
            <div className="text-right font-mono text-slate-600 tabular">{r.cacheHitPercent.toFixed(1)}%</div>
            <div className="text-right font-mono text-slate-500 tabular">{fmtNumber(r.calls)}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-xs text-slate-500">No models.</div>}
      </div>
    </div>
  )
}
