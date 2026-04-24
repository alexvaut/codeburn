import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useFilters } from '../filters-context'
import { useCostMode, displayCost } from '../cost-mode'
import { fmtCost, fmtNumber } from '../format'
import { navigate } from '../router'
import { Bar } from './Bar'

export function TopSessions() {
  const { filters } = useFilters()
  const { mode } = useCostMode()
  const { data } = useQuery({ queryKey: ['sessions-top', filters], queryFn: () => api.topSessions(filters) })
  const rows = (data ?? []).map(r => ({
    ...r,
    displayCost: displayCost(r, mode),
    displayAvgTurn: displayCost({ cost: r.avgLast5TurnCost, cacheReadCost: r.avgLast5TurnCacheReadCost }, mode),
  }))
  const max = rows.reduce((m, r) => Math.max(m, r.displayCost), 0)

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Top Sessions</h2>
        <span className="text-[11px] text-slate-500">highest spend</span>
      </div>
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Project</th>
              <th className="py-2 pr-3">Model</th>
              <th className="py-2 pr-3 w-[25%]">Cost distribution</th>
              <th className="py-2 pr-3 text-right">Cost</th>
              <th className="py-2 pr-3 text-right">Cost/turn</th>
              <th className="py-2 pr-3 text-right">Cache</th>
              <th className="py-2 pr-3 text-right">Calls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono tabular">
            {rows.map(r => (
              <tr
                key={r.sessionId}
                onClick={() => navigate(`/session/${r.sessionId}`)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="py-2.5 pr-3 text-slate-600">{r.date ?? '—'}</td>
                <td className="py-2.5 pr-3">
                  <div className="text-slate-900">{r.project}</div>
                  {r.projectPath && r.projectPath !== r.project && (
                    <div className="text-[10px] font-normal text-slate-400">{r.projectPath}</div>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  {r.model ? (
                    <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700">{r.model}</span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="py-2.5 pr-3"><Bar value={r.displayCost} max={max} height="h-1.5" /></td>
                <td className="py-2.5 pr-3 text-right font-medium text-slate-900">{fmtCost(r.displayCost)}</td>
                <td className="py-2.5 pr-3 text-right text-slate-600">{fmtCost(r.displayAvgTurn)}</td>
                <td className="py-2.5 pr-3 text-right text-slate-600">{r.cacheHitPercent.toFixed(1)}%</td>
                <td className="py-2.5 pr-3 text-right text-slate-600">{fmtNumber(r.calls)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-4 text-center text-xs text-slate-500">No sessions.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
