import { fmtNumber } from '../format'
import { Bar } from './Bar'

type Props = {
  title: string
  label: string
  color?: string
  items: Array<{ name: string; calls: number }>
  grid?: boolean
}

export function CallList({ title, label, color, items, grid }: Props) {
  const max = items.reduce((m, x) => Math.max(m, x.calls), 0)
  const rowClass = 'grid grid-cols-[8rem_1fr_4rem] items-center gap-3 text-sm'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <div className={grid ? 'grid grid-cols-1 gap-2 md:grid-cols-2' : 'space-y-2'}>
        {items.map(x => (
          <div key={x.name} className={rowClass}>
            <div className="truncate font-mono text-slate-900" title={x.name}>{x.name}</div>
            <Bar value={x.calls} max={max} color={color} height="h-1.5" />
            <div className="text-right font-mono text-slate-600 tabular">{fmtNumber(x.calls)}</div>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-slate-500">None.</div>}
      </div>
    </div>
  )
}
