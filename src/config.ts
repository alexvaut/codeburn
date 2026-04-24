import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export type PlanId = 'claude-pro' | 'claude-max' | 'cursor-pro' | 'custom' | 'none'
export type PlanProvider = 'claude' | 'codex' | 'cursor' | 'all'

export type Plan = {
  id: PlanId
  monthlyUsd: number
  provider: PlanProvider
  resetDay?: number
  setAt: string
}

export type ProjectGroupRule = {
  pattern: string
  name: string
}

export type IngestionConfig = {
  enabled?: boolean
  sweepIntervalMs?: number
}

export const DEFAULT_SWEEP_INTERVAL_MS = 30_000

export type CodeburnConfig = {
  currency?: {
    code: string
    symbol?: string
  }
  plan?: Plan
  modelAliases?: Record<string, string>
  projectGroups?: ProjectGroupRule[]
  ingestion?: IngestionConfig
}

export function getIngestionConfig(config: CodeburnConfig): Required<IngestionConfig> {
  return {
    enabled: config.ingestion?.enabled ?? true,
    sweepIntervalMs: Math.max(5_000, config.ingestion?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS),
  }
}

export async function saveIngestionConfig(ingestion: IngestionConfig): Promise<void> {
  const config = await readConfig()
  config.ingestion = { ...config.ingestion, ...ingestion }
  await saveConfig(config)
}

function getConfigDir(): string {
  return join(homedir(), '.config', 'codeburn')
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export async function readConfig(): Promise<CodeburnConfig> {
  try {
    const raw = await readFile(getConfigPath(), 'utf-8')
    return JSON.parse(raw) as CodeburnConfig
  } catch {
    return {}
  }
}

export async function saveConfig(config: CodeburnConfig): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true })
  const configPath = getConfigPath()
  const tmpPath = `${configPath}.tmp`
  await writeFile(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  await rename(tmpPath, configPath)
}

export async function readPlan(): Promise<Plan | undefined> {
  const config = await readConfig()
  return config.plan
}

export async function savePlan(plan: Plan): Promise<void> {
  const config = await readConfig()
  config.plan = plan
  await saveConfig(config)
}

export async function clearPlan(): Promise<void> {
  const config = await readConfig()
  delete config.plan
  await saveConfig(config)
}

export function getConfigFilePath(): string {
  return getConfigPath()
}
