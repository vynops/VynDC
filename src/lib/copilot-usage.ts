import fs from 'fs'
import path from 'path'

interface DayUsage {
  requests: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type UsageStore = Record<string, DayUsage>

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

export function recordUsage(promptTokens: number, completionTokens: number): void {
  const store = read()
  const key = today()
  const existing = store[key] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  store[key] = {
    requests: existing.requests + 1,
    promptTokens: existing.promptTokens + promptTokens,
    completionTokens: existing.completionTokens + completionTokens,
    totalTokens: existing.totalTokens + promptTokens + completionTokens,
  }
  write(store)
}

export function getUsageToday(): DayUsage {
  const store = read()
  return store[today()] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

export function getUsageLast7Days(): Array<{ date: string } & DayUsage> {
  const store = read()
  const result = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({ date: key, ...(store[key] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }) })
  }
  return result
}
