export const fmtNumber = (n: number): string => n.toLocaleString()

export const fmtCost = (n: number, currency = 'USD'): string => {
  const digits = Math.abs(n) < 100 ? 2 : 2
  if (currency === 'USD') return `$${n.toFixed(digits)}`
  return `${n.toFixed(digits)} ${currency}`
}

export const fmtCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

export const pctOf = (v: number, max: number): number => (max > 0 ? (v / max) * 100 : 0)
