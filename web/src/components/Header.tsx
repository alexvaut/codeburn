import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useFilters } from '../filters-context'
import { api } from '../api'
import { useCostMode, type CostMode } from '../cost-mode'
import { navigate } from '../router'

export function Header() {
  const qc = useQueryClient()
  const { filters } = useFilters()
  const { mode, setMode } = useCostMode()
  const isFetching = useIsFetching() > 0

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">
            <path d="M12 2s4 4 4 9a4 4 0 1 1-8 0c0-2 1-3 1-3s1 2 3 2c0-3-2-5 0-8zM6 15a6 6 0 0 0 12 0c0 4-3 7-6 7s-6-3-6-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">CodeBurn</h1>
          <p className="text-xs text-slate-500">AI coding token usage</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <CostModeToggle mode={mode} setMode={setMode} />
        {isFetching && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            Loading…
          </span>
        )}
        <a
          href={api.exportCsvUrl(filters)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </a>
        <button
          onClick={() => navigate('/settings')}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Settings
        </button>
        <button
          onClick={() => qc.invalidateQueries()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={isFetching}
        >
          Refresh
        </button>
      </div>
    </header>
  )
}

function CostModeToggle({ mode, setMode }: { mode: CostMode; setMode: (m: CostMode) => void }) {
  const btn = (m: CostMode, label: string, title: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      title={title}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        mode === m
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
      {btn('subscription', 'Subscription', 'Costs excluding cache reads — matches Claude plan usage')}
      {btn('api', 'API', 'Full API list prices including cache reads')}
    </div>
  )
}
