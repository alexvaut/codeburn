import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useFilters } from '../filters-context'
import { useCostMode, displayCost } from '../cost-mode'
import { fmtCost, fmtNumber } from '../format'
import { Bar } from './Bar'

export function ProjectList() {
  const { filters } = useFilters()
  const { mode } = useCostMode()
  const { data } = useQuery({ queryKey: ['projects', filters], queryFn: () => api.projects(filters) })
  const rows = (data ?? []).map(p => ({
    ...p,
    displayCost: displayCost(p, mode),
    displayAvgPerSession: displayCost({ cost: p.avgCostPerSession, cacheReadCost: p.avgCacheReadCostPerSession }, mode),
  }))
  const max = rows.reduce((m, p) => Math.max(m, p.displayCost), 0)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">By Project</h2>
        <span className="text-[11px] text-slate-500">cost · avg/session · cache · sessions</span>
      </div>
      <div className="space-y-3">
        {rows.map(p => (
          <div key={p.name} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-900" title={p.path}>{p.name}</div>
              <Bar value={p.displayCost} max={max} height="h-1.5" />
            </div>
            <div className="w-20 text-right font-mono font-medium text-slate-900 tabular">{fmtCost(p.displayCost)}</div>
            <div className="w-16 text-right font-mono text-slate-600 tabular">{fmtCost(p.displayAvgPerSession)}</div>
            <div className="w-14 text-right font-mono text-slate-600 tabular">{p.cacheHitPercent.toFixed(1)}%</div>
            <div className="w-10 text-right font-mono text-slate-500 tabular">{fmtNumber(p.sessions)}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-xs text-slate-500">No projects.</div>}
      </div>
    </div>
  )
}
