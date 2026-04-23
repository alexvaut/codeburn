import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useFilters } from '../filters-context'
import { useCostMode, displayCost } from '../cost-mode'
import { fmtCompact, fmtCost, fmtNumber } from '../format'

export function KpiGrid() {
  const { filters } = useFilters()
  const { mode } = useCostMode()
  const { data } = useQuery({
    queryKey: ['summary', filters],
    queryFn: () => api.summary(filters),
  })

  const t = data?.totals
  const currency = data?.currency ?? 'USD'
  const totalCost = t ? displayCost(t, mode) : 0
  const avgTurnCost = t ? displayCost({ cost: t.avgLast5TurnCost, cacheReadCost: t.avgLast5TurnCacheReadCost }, mode) : 0

  return (
    <section className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-5">
      <div className="bg-white p-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Total cost</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{data?.label ?? '…'}</span>
        </div>
        <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular">
          {t ? fmtCost(totalCost, currency) : '—'}
        </div>
        <div className="mt-1 text-xs text-slate-500">{t ? `${fmtNumber(t.sessions)} sessions` : ''}</div>
      </div>

      <div className="bg-white p-5">
        <div className="text-xs text-slate-500">API calls</div>
        <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular">
          {t ? fmtNumber(t.calls) : '—'}
        </div>
        <div className="mt-1 text-xs text-slate-500">{t ? `${fmtNumber(t.sessions)} sessions` : ''}</div>
      </div>

      <div className="bg-white p-5">
        <div className="text-xs text-slate-500">Cache hit rate</div>
        <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular">
          {t ? `${t.cacheHitPercent.toFixed(1)}%` : '—'}
        </div>
        <div className="mt-1 flex gap-3 text-xs text-slate-500">
          {t ? <>
            <span>{fmtCompact(t.tokens.cacheRead)} read</span>
            <span>{fmtCompact(t.tokens.cacheWrite)} written</span>
          </> : null}
        </div>
      </div>

      <div className="bg-white p-5">
        <div className="text-xs text-slate-500">Avg cost / user turn</div>
        <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular">
          {t ? fmtCost(avgTurnCost, currency) : '—'}
        </div>
        <div className="mt-1 text-xs text-slate-500">Across last 5 turns of each session</div>
      </div>

      <div className="bg-white p-5">
        <div className="text-xs text-slate-500">Tokens</div>
        <div className="mt-2 flex items-baseline gap-3">
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular">
            {t ? fmtCompact(t.tokens.input) : '—'}
            <span className="text-xs font-normal text-slate-500"> in</span>
          </div>
          <div className="font-mono text-lg text-slate-700 tabular">
            {t ? fmtCompact(t.tokens.output) : '—'}
            <span className="text-xs text-slate-500"> out</span>
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-500">Fresh input vs output</div>
      </div>
    </section>
  )
}
