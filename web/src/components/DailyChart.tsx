import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import { useFilters } from '../filters-context'
import { useCostMode, displayCost } from '../cost-mode'
import { fmtCost, fmtNumber } from '../format'

export function DailyChart() {
  const { filters } = useFilters()
  const { mode } = useCostMode()
  const { data } = useQuery({ queryKey: ['daily', filters], queryFn: () => api.daily(filters) })
  const currency = 'USD'

  const points = (data ?? []).map(d => ({
    date: d.date,
    label: d.date.slice(5),
    cost: displayCost(d, mode),
    calls: d.calls,
  }))

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Daily Activity</h2>
        <span className="text-[11px] text-slate-500">cost · calls</span>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: '#F8FAFC' }}
              contentStyle={{
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 11,
                padding: '6px 8px',
              }}
              formatter={(value: number, key: string) =>
                key === 'cost' ? [fmtCost(value, currency), 'cost'] : [fmtNumber(value), 'calls']
              }
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="cost" fill="#334155" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
