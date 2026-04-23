import { parseAllSessions } from '../src/parser.js'
import { calculateCost } from '../src/models.js'

const FIVE_H_START = new Date('2026-04-23T10:00:00Z')
const FIVE_H_END = new Date('2026-04-23T15:00:00Z')
const SEVEN_D_START = new Date('2026-04-22T14:00:00Z')
const SEVEN_D_END = new Date('2026-04-29T14:00:00Z')
const SEVEN_D_SONNET_START = new Date('2026-04-22T15:00:00Z')
const SEVEN_D_SONNET_END = new Date('2026-04-29T15:00:00Z')

const FIVE_H_UTIL = 23.0
const SEVEN_D_UTIL = 16.0
const SEVEN_D_SONNET_UTIL = 10.0

type Totals = {
  turns: number
  calls: number
  costFull: number
  costNoCacheRead: number
  costOnlyOutput: number
  cacheReadCost: number
  cacheReadTokens: number
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
}

function empty(): Totals {
  return { turns: 0, calls: 0, costFull: 0, costNoCacheRead: 0, costOnlyOutput: 0, cacheReadCost: 0, cacheReadTokens: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0 }
}

function sumInWindow(projects: Awaited<ReturnType<typeof parseAllSessions>>, start: Date, end: Date, modelFilter?: (m: string) => boolean) {
  const t = empty()
  for (const p of projects) {
    for (const s of p.sessions) {
      for (const turn of s.turns) {
        if (!turn.timestamp) continue
        const ts = new Date(turn.timestamp)
        if (Number.isNaN(ts.getTime())) continue
        if (ts < start || ts > end) continue
        let counted = false
        for (const call of turn.assistantCalls) {
          if (modelFilter && !modelFilter(call.model)) continue
          counted = true
          t.calls++
          t.costFull += call.costUSD
          const u = call.usage
          t.inputTokens += u.inputTokens
          t.outputTokens += u.outputTokens
          t.cacheReadTokens += u.cacheReadInputTokens
          t.cacheWriteTokens += u.cacheCreationInputTokens
          const cacheReadCost = calculateCost(call.model, 0, 0, 0, u.cacheReadInputTokens, 0, call.speed)
          const onlyOutputCost = calculateCost(call.model, 0, u.outputTokens, 0, 0, 0, call.speed)
          t.cacheReadCost += cacheReadCost
          t.costNoCacheRead += call.costUSD - cacheReadCost
          t.costOnlyOutput += onlyOutputCost
        }
        if (counted) t.turns++
      }
    }
  }
  return t
}

function fmt(n: number) { return `$${n.toFixed(2)}` }

function report(label: string, t: Totals, util: number) {
  console.log(`\n${label}`)
  console.log(`  turns: ${t.turns}   calls: ${t.calls}`)
  console.log(`  cache-read tokens: ${t.cacheReadTokens.toLocaleString()} (cost ${fmt(t.cacheReadCost)})`)
  console.log(`  output tokens: ${t.outputTokens.toLocaleString()}`)
  console.log(`  reported utilization: ${util}%`)
  console.log(`  -- inferred 100% budget under each hypothesis --`)
  if (t.costFull > 0)        console.log(`    H1 full cost (input+output+cacheW+cacheR): spent ${fmt(t.costFull)}  ->  100% = ${fmt(t.costFull / util * 100)}`)
  if (t.costNoCacheRead > 0) console.log(`    H2 excl. cache reads:                      spent ${fmt(t.costNoCacheRead)}  ->  100% = ${fmt(t.costNoCacheRead / util * 100)}`)
  if (t.costOnlyOutput > 0)  console.log(`    H3 output tokens only:                     spent ${fmt(t.costOnlyOutput)}  ->  100% = ${fmt(t.costOnlyOutput / util * 100)}`)
}

async function main() {
  const range = { start: new Date('2026-04-22T00:00:00Z'), end: new Date('2026-04-30T00:00:00Z') }
  const projects = await parseAllSessions(range, 'claude')

  console.log('=== Max 5x budget inference: does cache-read count? ===')
  console.log('Article-predicted Max 5x: ~$24.75 per 5h, ~$312.50 per 7d (at $7.5/M credits avg).')

  report('5-hour window', sumInWindow(projects, FIVE_H_START, FIVE_H_END), FIVE_H_UTIL)
  report('7-day window (all models)', sumInWindow(projects, SEVEN_D_START, SEVEN_D_END), SEVEN_D_UTIL)
  report('7-day Sonnet-only', sumInWindow(projects, SEVEN_D_SONNET_START, SEVEN_D_SONNET_END, m => /sonnet/i.test(m)), SEVEN_D_SONNET_UTIL)
}

main().catch(e => { console.error(e); process.exit(1) })
