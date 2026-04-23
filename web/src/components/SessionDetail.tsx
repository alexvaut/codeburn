import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useCostMode, displayCost } from '../cost-mode'
import { fmtCompact, fmtCost, fmtNumber } from '../format'
import { navigate } from '../router'
import { Bar } from './Bar'

const CATEGORY_LABELS: Record<string, string> = {
  coding: 'Coding',
  debugging: 'Debugging',
  feature: 'Feature Dev',
  refactoring: 'Refactoring',
  testing: 'Testing',
  exploration: 'Exploration',
  planning: 'Planning',
  delegation: 'Delegation',
  git: 'Git Ops',
  'build/deploy': 'Build/Deploy',
  conversation: 'Conversation',
  brainstorming: 'Brainstorming',
  general: 'General',
}

function fmtTimestamp(ts: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const { mode } = useCostMode()
  const { data, isLoading, error } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.session(sessionId),
  })
  const totalCost = data ? displayCost(data, mode) : 0
  const avgTurnCost = data ? displayCost({ cost: data.avgLast5TurnCost, cacheReadCost: data.avgLast5TurnCacheReadCost }, mode) : 0
  const modelRows = data?.modelBreakdown.map(m => ({ ...m, displayCost: displayCost(m, mode) })) ?? []
  const modelMax = modelRows[0]?.displayCost ?? 0

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <button
            onClick={() => navigate('/')}
            className="mb-2 text-xs text-slate-500 hover:text-slate-900"
          >
            ← Back to dashboard
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Session detail</h1>
          <p className="font-mono text-xs text-slate-500">{sessionId}</p>
        </div>
      </header>

      {isLoading && <div className="mt-8 text-sm text-slate-500">Loading…</div>}
      {error && <div className="mt-8 text-sm text-rose-700">Failed to load session: {String(error)}</div>}

      {data && (
        <>
          <section className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-5">
            <div className="bg-white p-5">
              <div className="text-xs text-slate-500">Project</div>
              <div className="mt-2 truncate text-lg font-semibold text-slate-900" title={data.projectPath}>{data.project}</div>
              <div className="mt-1 text-xs text-slate-500">{fmtTimestamp(data.firstTimestamp)} → {fmtTimestamp(data.lastTimestamp)}</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-xs text-slate-500">Total cost</div>
              <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular">{fmtCost(totalCost)}</div>
              <div className="mt-1 text-xs text-slate-500">{fmtNumber(data.calls)} calls · {fmtNumber(data.totalTurns)} turns</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-xs text-slate-500">Avg cost / user turn</div>
              <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular">{fmtCost(avgTurnCost)}</div>
              <div className="mt-1 text-xs text-slate-500">Last 5 turns</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-xs text-slate-500">Cache hit rate</div>
              <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular">{data.cacheHitPercent.toFixed(1)}%</div>
              <div className="mt-1 flex gap-3 text-xs text-slate-500">
                <span>{fmtCompact(data.tokens.cacheRead)} read</span>
                <span>{fmtCompact(data.tokens.cacheWrite)} written</span>
              </div>
            </div>
            <div className="bg-white p-5">
              <div className="text-xs text-slate-500">Tokens</div>
              <div className="mt-2 flex items-baseline gap-3">
                <div className="font-mono text-2xl font-semibold text-slate-900 tabular">
                  {fmtCompact(data.tokens.input)}
                  <span className="text-xs font-normal text-slate-500"> in</span>
                </div>
                <div className="font-mono text-lg text-slate-700 tabular">
                  {fmtCompact(data.tokens.output)}
                  <span className="text-xs text-slate-500"> out</span>
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">Fresh input vs output</div>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Models used</h2>
            <div className="space-y-2 text-sm">
              {modelRows.map(m => (
                <div key={m.name} className="grid grid-cols-[10rem_1fr_auto_auto] items-center gap-3">
                  <span className="truncate font-mono text-slate-900">{m.name}</span>
                  <Bar value={m.displayCost} max={modelMax} height="h-1.5" />
                  <span className="text-right font-mono font-medium text-slate-900 tabular">{fmtCost(m.displayCost)}</span>
                  <span className="w-16 text-right font-mono text-slate-500 tabular">{fmtNumber(m.calls)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">User turns</h2>
              <span className="text-[11px] text-slate-500">{data.turns.length} turns · most recent last</span>
            </div>
            <div className="overflow-x-auto scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-3 w-10 text-right">#</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">User message</th>
                    <th className="py-2 pr-3 text-right">Calls</th>
                    <th className="py-2 pr-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.turns.map((t, i) => (
                    <tr key={i} className="align-top hover:bg-slate-50">
                      <td className="py-2.5 pr-3 text-right font-mono text-xs text-slate-400 tabular">{i + 1}</td>
                      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs text-slate-600 tabular">{fmtTimestamp(t.timestamp)}</td>
                      <td className="py-2.5 pr-3 text-xs text-slate-600">{CATEGORY_LABELS[t.category] ?? t.category}</td>
                      <td className="py-2.5 pr-3 text-slate-900">
                        <div className="max-w-[600px] whitespace-pre-wrap break-words text-xs">{t.userMessage || <span className="text-slate-400">(no text)</span>}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-slate-600 tabular">{t.calls}</td>
                      <td className="py-2.5 pr-3 text-right font-mono font-medium text-slate-900 tabular">{fmtCost(displayCost(t, mode))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
