import { useQuery } from '@tanstack/react-query'
import { api, type Period } from '../api'
import { useFilters } from '../filters-context'

const BASE_PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 Days' },
  { id: '30days', label: '30 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
]

const WINDOW_PERIODS: Array<{ id: Period; label: string }> = [
  { id: '5h', label: '5h Window' },
  { id: '7d', label: '7d Window' },
]

export function FiltersBar() {
  const { filters, setPeriod, setDateRange, setProject, setModel, setProvider } = useFilters()
  const { data } = useQuery({ queryKey: ['filters', filters], queryFn: () => api.filters(filters) })
  const { data: summary } = useQuery({ queryKey: ['summary', filters], queryFn: () => api.summary(filters) })

  const hasSessionLimits = !!(summary?.sessionLimits?.fiveHour || summary?.sessionLimits?.sevenDay)
  const periods = hasSessionLimits ? [...BASE_PERIODS, ...WINDOW_PERIODS] : BASE_PERIODS

  const activePeriod = filters.from || filters.to ? null : filters.period

  const projectOptions = data?.projects ?? []
  const projectList = filters.project && !projectOptions.includes(filters.project)
    ? [filters.project, ...projectOptions]
    : projectOptions
  const modelOptions = data?.models ?? []
  const modelList = filters.model && !modelOptions.includes(filters.model)
    ? [filters.model, ...modelOptions]
    : modelOptions

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-slate-200 p-0.5">
          {periods.map(p => {
            const active = activePeriod === p.id
            return (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={
                  active
                    ? 'rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white'
                    : 'rounded px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900'
                }
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="mx-1 hidden h-6 w-px bg-slate-200 md:block" />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">From</label>
          <input
            type="date"
            value={filters.from ?? ''}
            onChange={e => setDateRange(e.target.value || null, filters.to)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
          />
          <label className="text-xs text-slate-500">To</label>
          <input
            type="date"
            value={filters.to ?? ''}
            onChange={e => setDateRange(filters.from, e.target.value || null)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={filters.project ?? ''}
            onChange={e => setProject(e.target.value || null)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            <option value="">All projects</option>
            {projectList.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filters.model ?? ''}
            onChange={e => setModel(e.target.value || null)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            <option value="">All models</option>
            {modelList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={filters.provider ?? ''}
            onChange={e => setProvider(e.target.value || null)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            <option value="">All providers</option>
            {data?.providers.map(p => <option key={p.name} value={p.name}>{p.displayName}</option>)}
          </select>
        </div>
      </div>
    </section>
  )
}
