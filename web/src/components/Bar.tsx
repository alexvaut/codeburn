import { pctOf } from '../format'

const TRACK = '#F1F5F9'
const DEFAULT_COLOR = '#334155'

type Props = {
  value: number
  max: number
  color?: string
  height?: 'h-1.5' | 'h-2'
}

export function Bar({ value, max, color = DEFAULT_COLOR, height = 'h-2' }: Props) {
  const pct = pctOf(value, max)
  return (
    <div className={`relative ${height} w-full overflow-hidden rounded-full`} style={{ background: TRACK }}>
      <div className={`${height} rounded-full`} style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
