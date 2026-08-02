import fs from 'fs'
import path from 'path'

export type RunbookRisk = 'low' | 'medium' | 'high'

export interface RunbookStep {
  id: string
  name: string
  actionType: 'notify' | 'incident-note' | 'assign-owner' | 'tag'
  payload: Record<string, string>
}

export interface Runbook {
  id: string
  name: string
  description: string
  class: string
  risk: RunbookRisk
  rollbackPlan: string
  enabled: boolean
  steps: RunbookStep[]
}

export interface RunbookExecution {
  id: string
  runbookId: string
  incidentId?: string
  requestedBy: string
  mode: 'recommend-only' | 'supervised-execute' | 'autonomous-low-risk'
  status: 'recommended' | 'pending-approval' | 'executed' | 'rejected'
  reason: string
  createdAt: string
  approvedBy?: string
  approvedAt?: string
  executedAt?: string
  actionLog: Array<{ ts: string; stepId: string; action: string; detail: string }>
}

const DATA_DIR = path.join(process.cwd(), 'data')
const RUNBOOK_FILE = path.join(DATA_DIR, 'runbooks.json')
const EXECUTIONS_FILE = path.join(DATA_DIR, 'runbook-executions.json')

const DEFAULT_RUNBOOKS: Runbook[] = [
  {
    id: 'rb-safe-service-restart',
    name: 'Safe Service Restart',
    description: 'Notify channel, tag incident, and assign owner before controlled restart.',
    class: 'service-restart-safe',
    risk: 'low',
    rollbackPlan: 'Revert to previous service instance and re-open incident.',
    enabled: true,
    steps: [
      { id: 'notify', name: 'Notify channel', actionType: 'notify', payload: { channel: 'slack', message: 'Starting safe service restart runbook.' } },
      { id: 'assign', name: 'Assign primary responder', actionType: 'assign-owner', payload: { owner: 'oncall' } },
      { id: 'tag', name: 'Tag incident', actionType: 'tag', payload: { tag: 'auto-remediation' } },
    ],
  },
]

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadJson<T>(file: string, fallback: T): T {
  ensureDir()
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function saveJson(file: string, data: unknown) {
  ensureDir()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export function loadRunbooks(): Runbook[] {
  const loaded = loadJson<Runbook[]>(RUNBOOK_FILE, [])
  return loaded.length ? loaded : DEFAULT_RUNBOOKS
}

export function saveRunbooks(runbooks: Runbook[]): void {
  saveJson(RUNBOOK_FILE, runbooks)
}

export function loadRunbookExecutions(): RunbookExecution[] {
  return loadJson<RunbookExecution[]>(EXECUTIONS_FILE, [])
}

export function saveRunbookExecutions(executions: RunbookExecution[]): void {
  saveJson(EXECUTIONS_FILE, executions)
}
