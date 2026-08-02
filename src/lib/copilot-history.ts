import fs from 'fs'
import path from 'path'

export interface CopilotHistoryEntry {
  id: string
  userId: string
  prompt: string
  createdAt: string
}

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'copilot-history.json')
const MAX_ENTRIES = 200

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function read(): CopilotHistoryEntry[] {
  ensureDir()
  if (!fs.existsSync(FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as CopilotHistoryEntry[]
  } catch {
    return []
  }
}

function write(entries: CopilotHistoryEntry[]) {
  ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(entries, null, 2), 'utf8')
}

export function recordPromptHistory(userId: string, prompt: string): void {
  const text = prompt.trim()
  if (!text) return

  const entries = read()
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    prompt: text,
    createdAt: new Date().toISOString(),
  })

  write(entries.slice(0, MAX_ENTRIES))
}

export function getPromptHistory(userId: string, limit = 20): CopilotHistoryEntry[] {
  return read()
    .filter(entry => entry.userId === userId)
    .slice(0, limit)
}