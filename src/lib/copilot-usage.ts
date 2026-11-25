import fs from 'fs'
import path from 'path'
import type { AppSettings } from './settings-store'

interface DayUsage {
  requests: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type ModelIdentity = { provider: AppSettings['aiProvider']; model: string }
type ModelUsage = DayUsage & ModelIdentity
type UsageStore = Record<string, DayUsage & { models?: ModelUsage[] }>
type RecentUsage = DayUsage & { date: string; provider: string | null; model: string | null }

export interface CopilotUsageResponse {
  today: DayUsage
  allTime: DayUsage
  recentByModel: RecentUsage[]
}

const EMPTY: DayUsage = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'copilot-usage.json')

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function read(): UsageStore {
  ensureDir()
  if (!fs.existsSync(FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as UsageStore
  } catch {
    return {}
  }
}

function write(data: UsageStore) {
  ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
}

export function recordUsage(promptTokens: number, completionTokens: number, identity: ModelIdentity): void {
  const store = read()
  const key = today()
  const existing = store[key] ?? EMPTY
  const models = store[key]?.models ?? []
  const index = models.findIndex(row => row.provider === identity.provider && row.model === identity.model)
  const increment = { requests: 1, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
  const modelUsage = { ...identity, ...sum(models[index] ?? EMPTY, increment) }
  if (index === -1) models.push(modelUsage)
  else models[index] = modelUsage
  store[key] = { ...sum(existing, increment), models }
  write(store)
}

function sum(a: DayUsage, b: DayUsage, sign = 1): DayUsage {
  return {
    requests: a.requests + b.requests * sign,
    promptTokens: a.promptTokens + b.promptTokens * sign,
    completionTokens: a.completionTokens + b.completionTokens * sign,
    totalTokens: a.totalTokens + b.totalTokens * sign,
  }
}

export function getCopilotUsage(now = new Date()): CopilotUsageResponse {
  const store = read()
  const date = now.toISOString().slice(0, 10)
  const firstDay = new Date(now)
  firstDay.setUTCDate(firstDay.getUTCDate() - 6)
  const start = firstDay.toISOString().slice(0, 10)
  const recentByModel: RecentUsage[] = []
  for (const day of Object.keys(store).filter(day => day >= start && day <= date).sort().reverse()) {
    const usage = store[day]
    const models = usage.models ?? []
    for (const model of models) recentByModel.push({ date: day, ...model })
    const unattributed = models.reduce((total, model) => sum(total, model, -1), usage)
    if (unattributed.requests > 0) {
      recentByModel.push({ date: day, provider: null, model: null, ...sum(EMPTY, unattributed) })
    }
  }
  return {
    today: sum(EMPTY, store[date] ?? EMPTY),
    allTime: Object.values(store).reduce((total, day) => sum(total, day), EMPTY),
    recentByModel,
  }
}
