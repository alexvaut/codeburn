import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './api'
import { useFilters } from './filters-context'
import { useCostMode } from './cost-mode'
import { useRoute } from './router'
import { Header } from './components/Header'
import { FiltersBar } from './components/FiltersBar'
import { KpiGrid } from './components/KpiGrid'
import { PlanUsage } from './components/PlanUsage'
import { SessionWindows } from './components/SessionWindows'
import { DailyChart } from './components/DailyChart'
import { ProjectList } from './components/ProjectList'
import { TopSessions } from './components/TopSessions'
import { ActivityList } from './components/ActivityList'
import { ModelList } from './components/ModelList'
import { CallList } from './components/CallList'
import { SessionDetail } from './components/SessionDetail'
import { Settings } from './components/Settings'

export function App() {
  const pathname = useRoute()
  const sessionMatch = pathname.match(/^\/session\/(.+)$/)
  if (sessionMatch) return <SessionDetail sessionId={decodeURIComponent(sessionMatch[1])} />
  if (pathname === '/settings') return <Settings />
  return <Dashboard />
}

function Dashboard() {
  const { filters } = useFilters()
  const summary = useQuery({ queryKey: ['summary', filters], queryFn: () => api.summary(filters) })
  const tools = useQuery({ queryKey: ['tools', filters], queryFn: () => api.tools(filters) })
  const t = tools.data
  const { resolveDefault } = useCostMode()
  const planId = summary.data?.plan?.id
  useEffect(() => {
    if (planId == null) return
    resolveDefault(planId !== 'none' ? 'subscription' : 'api')
  }, [planId, resolveDefault])

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <Header />
      <FiltersBar />
      <KpiGrid />
      <PlanUsage />
      <SessionWindows />

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyChart />
        <ProjectList />
      </section>

      <TopSessions />

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityList />
        <ModelList />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CallList title="Core Tools" label="calls" color="#0891B2" items={t?.tools ?? []} />
        <CallList title="Shell Commands" label="calls" color="#C2410C" items={t?.bash ?? []} />
      </section>

      <section className="mt-6">
        <CallList title="MCP Servers" label="calls" color="#7C3AED" items={t?.mcp ?? []} grid />
      </section>

      <footer className="mt-8 border-t border-slate-200 py-6 text-center text-[11px] text-slate-500">
        CodeBurn · local data · {new Date().toLocaleDateString()}
      </footer>
    </div>
  )
}
