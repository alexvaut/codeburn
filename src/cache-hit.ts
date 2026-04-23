export function cacheHitPercent(inputTokens: number, cacheReadTokens: number, cacheWriteTokens: number): number {
  const denom = inputTokens + cacheReadTokens + cacheWriteTokens
  if (denom === 0) return 0
  return Math.round((cacheReadTokens / denom) * 1000) / 10
}
