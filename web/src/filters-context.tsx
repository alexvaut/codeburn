import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FilterState, Period } from './api'

type Ctx = {
  filters: FilterState
  setPeriod: (p: Period) => void
  setDateRange: (from: string | null, to: string | null) => void
  setProject: (v: string | null) => void
  setModel: (v: string | null) => void
  setProvider: (v: string | null) => void
}

const FiltersContext = createContext<Ctx | null>(null)

const VALID_PERIODS: Period[] = ['today', 'yesterday', 'week', '30days', 'month', 'all', '5h', '7d']

function parseFromUrl(search: string): FilterState {
  const sp = new URLSearchParams(search)
  const rawPeriod = sp.get('period')
  const period: Period = VALID_PERIODS.includes(rawPeriod as Period) ? (rawPeriod as Period) : 'week'
  return {
    period,
    from: sp.get('from'),
    to: sp.get('to'),
    project: sp.get('project'),
    model: sp.get('model'),
    provider: sp.get('provider'),
  }
}

function toSearch(f: FilterState): string {
  const sp = new URLSearchParams()
  if (f.from) sp.set('from', f.from)
  if (f.to) sp.set('to', f.to)
  if (!f.from && !f.to && f.period !== 'week') sp.set('period', f.period)
  if (f.project) sp.set('project', f.project)
  if (f.model) sp.set('model', f.model)
  if (f.provider) sp.set('provider', f.provider)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(() => parseFromUrl(window.location.search))

  useEffect(() => {
    const next = `${window.location.pathname}${toSearch(filters)}${window.location.hash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) window.history.pushState(null, '', next)
  }, [filters])

  useEffect(() => {
    const onPop = () => setFilters(parseFromUrl(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setPeriod = useCallback((p: Period) => {
    setFilters(f => ({ ...f, period: p, from: null, to: null }))
  }, [])
  const setDateRange = useCallback((from: string | null, to: string | null) => {
    setFilters(f => ({ ...f, from, to }))
  }, [])
  const setProject = useCallback((v: string | null) => setFilters(f => ({ ...f, project: v })), [])
  const setModel = useCallback((v: string | null) => setFilters(f => ({ ...f, model: v })), [])
  const setProvider = useCallback((v: string | null) => setFilters(f => ({ ...f, provider: v })), [])

  const api = useMemo<Ctx>(() => ({
    filters, setPeriod, setDateRange, setProject, setModel, setProvider,
  }), [filters, setPeriod, setDateRange, setProject, setModel, setProvider])

  return <FiltersContext.Provider value={api}>{children}</FiltersContext.Provider>
}

export function useFilters(): Ctx {
  const ctx = useContext(FiltersContext)
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider')
  return ctx
}
