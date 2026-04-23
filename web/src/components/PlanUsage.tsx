import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useFilters } from '../filters-context'
import { useCostMode } from '../cost-mode'
import { fmtCost } from '../format'

export function PlanUsage() {
  const { filters } = useFilters()
  const { mode } = useCostMode()
  const { data } = useQuery({ queryKey: ['summary', filters], queryFn: () => api.summary(filters) })
  const plan = data?.plan
  if (!plan) return null

  const currency = data?.currency ?? 'USD'
  const subscription = mode === 'subscription' && plan.spentSubscription != null
  const spent = subscription ? plan.spentSubscription : plan.spent
  const percentUsed = subscription ? plan.percentUsedSubscription : plan.percentUsed
  const projected = subscription ? plan.projectedMonthEndSubscription : plan.projectedMonthEnd
  const pct = Math.min(100, percentUsed)
  const label = subscription ? 'Plan usage (subscription, excl. cache reads)' : 'Plan usage (API-equivalent)'
  const footer = subscription
    ? `Projected month: ${fmtCost(projected, currency)} · resets in ${plan.daysUntilReset} days. Cache reads don’t count toward Claude subscription limits.`
    : `Projected month: ${fmtCost(projected, currency)} · resets in ${plan.daysUntilReset} days. Subscription plans don’t bill by API cost — this is an estimate of what the same usage would cost at pay-as-you-go rates.`

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1 text-sm text-slate-900">
            <span className="font-semibold">{plan.displayName}</span>
            <span className="text-slate-500">
              {' · '}
              {fmtCost(spent, currency)} {subscription ? 'billable' : 'API-equivalent'} vs {fmtCost(plan.budget, currency)} plan price
            </span>
          </div>
        </div>
        <div className="font-mono text-2xl font-semibold text-slate-900 tabular">{percentUsed.toFixed(1)}%</div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-slate-500">{footer}</div>
    </section>
  )
}
