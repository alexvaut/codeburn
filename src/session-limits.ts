import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

import { parseAllSessions } from './parser.js'
import type { ProjectSummary } from './types.js'

export type TierBudget = { fiveHourUsd: number; sevenDayUsd: number }

export type SubscriptionTier = 'pro' | 'max_5x' | 'max_20x' | 'unknown'

const STATIC_TIER_BUDGETS: Record<SubscriptionTier, TierBudget> = {
  pro:       { fiveHourUsd: 4.13,  sevenDayUsd: 37.50 },
  max_5x:    { fiveHourUsd: 24.75, sevenDayUsd: 312.50 },
  max_20x:   { fiveHourUsd: 82.50, sevenDayUsd: 625.00 },
  unknown:   { fiveHourUsd: 0,     sevenDayUsd: 0 },
}

export function getStaticTierBudget(tier: SubscriptionTier): TierBudget {
  return STATIC_TIER_BUDGETS[tier]
}

function tierFromCredential(rateLimitTier: string | undefined, subscriptionType: string | undefined): SubscriptionTier {
  const raw = (rateLimitTier ?? '').toLowerCase()
  if (raw.includes('max_20x')) return 'max_20x'
  if (raw.includes('max_5x')) return 'max_5x'
  if (raw.includes('pro')) return 'pro'
  const sub = (subscriptionType ?? '').toLowerCase()
  if (sub === 'pro') return 'pro'
  if (sub === 'max') return 'max_5x'
  return 'unknown'
}

type CredentialsPayload = {
  accessToken: string
  tier: SubscriptionTier
  subscriptionType: string | null
  rateLimitTier: string | null
}

async function readCredentials(): Promise<CredentialsPayload | null> {
  const path = join(homedir(), '.claude', '.credentials.json')
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; subscriptionType?: string; rateLimitTier?: string } }
    const oauth = parsed.claudeAiOauth
    if (!oauth?.accessToken) return null
    return {
      accessToken: oauth.accessToken,
      tier: tierFromCredential(oauth.rateLimitTier, oauth.subscriptionType),
      subscriptionType: oauth.subscriptionType ?? null,
      rateLimitTier: oauth.rateLimitTier ?? null,
    }
  } catch {
    return null
  }
}

type WindowStatus = {
  utilization: number
  resetsAt: number
  status: string | null
}

export type SessionLimitsData = {
  fiveHour: WindowStatus | null
  sevenDay: WindowStatus | null
  overallStatus: string | null
  representativeClaim: string | null
  tier: SubscriptionTier
  subscriptionType: string | null
  rateLimitTier: string | null
  staticBudget: TierBudget
  fetchedAt: number
  stale?: boolean
  error?: string
}

function parseWindow(headers: Record<string, string>, abbrev: '5h' | '7d'): WindowStatus | null {
  const util = headers[`anthropic-ratelimit-unified-${abbrev}-utilization`]
  const reset = headers[`anthropic-ratelimit-unified-${abbrev}-reset`]
  if (util === undefined || reset === undefined) return null
  const utilization = Number(util)
  const resetsAt = Number(reset)
  if (!Number.isFinite(utilization) || !Number.isFinite(resetsAt)) return null
  return {
    utilization,
    resetsAt,
    status: headers[`anthropic-ratelimit-unified-${abbrev}-status`] ?? null,
  }
}

async function probeRateLimitHeaders(token: string): Promise<Record<string, string> | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'quota' }],
      }),
    })
    const out: Record<string, string> = {}
    res.headers.forEach((v, k) => { out[k.toLowerCase()] = v })
    return out
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const CACHE_TTL_MS = 60_000
let cached: SessionLimitsData | null = null

export async function getSessionLimits(force = false): Promise<SessionLimitsData | null> {
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached

  const creds = await readCredentials()
  if (!creds) return null

  const headers = await probeRateLimitHeaders(creds.accessToken)
  const fetchedAt = Date.now()
  if (!headers) {
    const fallback: SessionLimitsData = {
      fiveHour: cached?.fiveHour ?? null,
      sevenDay: cached?.sevenDay ?? null,
      overallStatus: cached?.overallStatus ?? null,
      representativeClaim: cached?.representativeClaim ?? null,
      tier: creds.tier,
      subscriptionType: creds.subscriptionType,
      rateLimitTier: creds.rateLimitTier,
      staticBudget: getStaticTierBudget(creds.tier),
      fetchedAt,
      stale: true,
      error: 'probe_failed',
    }
    return fallback
  }

  const data: SessionLimitsData = {
    fiveHour: parseWindow(headers, '5h'),
    sevenDay: parseWindow(headers, '7d'),
    overallStatus: headers['anthropic-ratelimit-unified-status'] ?? null,
    representativeClaim: headers['anthropic-ratelimit-unified-representative-claim'] ?? null,
    tier: creds.tier,
    subscriptionType: creds.subscriptionType,
    rateLimitTier: creds.rateLimitTier,
    staticBudget: getStaticTierBudget(creds.tier),
    fetchedAt,
  }
  cached = data
  return data
}

export type WindowSpend = {
  windowStart: Date
  windowEnd: Date
  spentUsd: number
}

export function computeWindowSpend(projects: ProjectSummary[], windowStart: Date, windowEnd: Date): WindowSpend {
  let spent = 0
  for (const project of projects) {
    for (const session of project.sessions) {
      for (const turn of session.turns) {
        for (const call of turn.assistantCalls) {
          if (!call.timestamp) continue
          const ts = new Date(call.timestamp)
          if (Number.isNaN(ts.getTime())) continue
          if (ts < windowStart || ts > windowEnd) continue
          spent += call.costUSD - call.cacheReadCostUSD
        }
      }
    }
  }
  return { windowStart, windowEnd, spentUsd: spent }
}

export async function getWindowSpendFromSessions(
  resetsAt: number,
  windowSeconds: number,
  now = Date.now(),
): Promise<WindowSpend> {
  const windowEnd = new Date(resetsAt * 1000)
  const windowStart = new Date(windowEnd.getTime() - windowSeconds * 1000)
  const nowDate = new Date(now)
  const projects = await parseAllSessions({ start: windowStart, end: nowDate > windowEnd ? windowEnd : nowDate }, 'claude')
  return computeWindowSpend(projects, windowStart, windowEnd)
}
