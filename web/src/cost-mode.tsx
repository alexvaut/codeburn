import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type CostMode = 'subscription' | 'api'

type Ctx = {
  mode: CostMode
  setMode: (m: CostMode) => void
  resolveDefault: (desired: CostMode) => void
}

const CostModeContext = createContext<Ctx | null>(null)

function parseFromUrl(search: string): CostMode | null {
  const raw = new URLSearchParams(search).get('mode')
  return raw === 'subscription' || raw === 'api' ? raw : null
}

function writeToUrl(mode: CostMode) {
  const sp = new URLSearchParams(window.location.search)
  sp.set('mode', mode)
  const next = `${window.location.pathname}?${sp.toString()}${window.location.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) window.history.replaceState(null, '', next)
}

export function CostModeProvider({ children }: { children: ReactNode }) {
  const fromUrl = parseFromUrl(window.location.search)
  const [mode, setModeState] = useState<CostMode>(fromUrl ?? 'api')
  const userOverridden = useRef<boolean>(fromUrl !== null)

  const setMode = useCallback((m: CostMode) => {
    userOverridden.current = true
    setModeState(m)
    writeToUrl(m)
  }, [])

  const resolveDefault = useCallback((desired: CostMode) => {
    if (userOverridden.current) return
    setModeState(prev => prev === desired ? prev : desired)
  }, [])

  useEffect(() => {
    const onPop = () => {
      const next = parseFromUrl(window.location.search)
      if (next) {
        userOverridden.current = true
        setModeState(next)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const api = useMemo<Ctx>(() => ({ mode, setMode, resolveDefault }), [mode, setMode, resolveDefault])

  return <CostModeContext.Provider value={api}>{children}</CostModeContext.Provider>
}

export function useCostMode(): Ctx {
  const ctx = useContext(CostModeContext)
  if (!ctx) throw new Error('useCostMode must be used within CostModeProvider')
  return ctx
}

export function displayCost(row: { cost: number; cacheReadCost?: number }, mode: CostMode): number {
  return mode === 'subscription' ? row.cost - (row.cacheReadCost ?? 0) : row.cost
}
