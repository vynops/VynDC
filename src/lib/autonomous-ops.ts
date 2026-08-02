import fs from 'fs'
import path from 'path'

export type AutonomousMode = 'recommend-only' | 'supervised-execute' | 'autonomous-low-risk'

export interface AutonomousConfig {
  mode: AutonomousMode
  lowRiskAutoClasses: string[]
  maxAutoActionsPerHour: number
  safetyPolicies: {
    requireRollbackPlan: boolean
    blockOutsideBusinessHours: boolean
  }
}

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'autonomous-ops.json')

const DEFAULTS: AutonomousConfig = {
  mode: 'recommend-only',
  lowRiskAutoClasses: ['cache-clear', 'service-restart-safe', 'notify-only'],
  maxAutoActionsPerHour: 10,
  safetyPolicies: {
    requireRollbackPlan: true,
    blockOutsideBusinessHours: false,
  },
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function getAutonomousConfig(): AutonomousConfig {
  ensureDir()
  if (!fs.existsSync(FILE)) return { ...DEFAULTS }
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<AutonomousConfig>
    return {
      ...DEFAULTS,
      ...raw,
      safetyPolicies: {
        ...DEFAULTS.safetyPolicies,
        ...(raw.safetyPolicies ?? {}),
      },
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAutonomousConfig(partial: Partial<AutonomousConfig>): AutonomousConfig {
  const current = getAutonomousConfig()
  const next: AutonomousConfig = {
    ...current,
    ...partial,
    safetyPolicies: {
      ...current.safetyPolicies,
      ...(partial.safetyPolicies ?? {}),
    },
  }
  ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}
