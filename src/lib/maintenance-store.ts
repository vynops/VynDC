import fs from 'fs'
import path from 'path'

export type MaintenanceScope = 'all' | 'host' | 'rack' | 'category'

export interface MaintenanceWindow {
  id: string
  title: string
  description: string
  scope: MaintenanceScope
  /** hostnames, rack IDs, or category names (empty = all) */
  scopeValues: string[]
  startsAt: string   // ISO-8601
  endsAt: string     // ISO-8601
  suppressAlerts: boolean
  pauseSla: boolean
  createdBy: string
  createdAt: string
}

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'maintenance-windows.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function loadMaintenanceWindows(): MaintenanceWindow[] {
  ensureDir()
  if (!fs.existsSync(FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as MaintenanceWindow[]
  } catch {
    return []
  }
}

export function saveMaintenanceWindows(windows: MaintenanceWindow[]): void {
  ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(windows, null, 2), 'utf8')
}

/** Returns windows that are currently active (now is between startsAt and endsAt) */
export function activeMaintenanceWindows(): MaintenanceWindow[] {
  const now = new Date()
  return loadMaintenanceWindows().filter(
    w => new Date(w.startsAt) <= now && new Date(w.endsAt) > now
  )
}

/**
 * Returns true if an incident with the given host/rack/category
 * is covered by any active maintenance window with suppressAlerts=true.
 */
export function isUnderMaintenance(opts: {
  hostname?: string
  rack?: string
  category?: string
}): boolean {
  const active = activeMaintenanceWindows().filter(w => w.suppressAlerts)
  if (active.length === 0) return false

  for (const w of active) {
    if (w.scope === 'all') return true
    if (w.scope === 'host' && opts.hostname && w.scopeValues.includes(opts.hostname)) return true
    if (w.scope === 'rack' && opts.rack && w.scopeValues.includes(opts.rack)) return true
    if (w.scope === 'category' && opts.category && w.scopeValues.includes(opts.category)) return true
  }
  return false
}

/**
 * Returns true if an incident's SLA clock should be paused
 * (covered by an active window with pauseSla=true).
 */
export function isSlapaused(opts: {
  hostname?: string
  rack?: string
  category?: string
}): boolean {
  const active = activeMaintenanceWindows().filter(w => w.pauseSla)
  if (active.length === 0) return false

  for (const w of active) {
    if (w.scope === 'all') return true
    if (w.scope === 'host' && opts.hostname && w.scopeValues.includes(opts.hostname)) return true
    if (w.scope === 'rack' && opts.rack && w.scopeValues.includes(opts.rack)) return true
    if (w.scope === 'category' && opts.category && w.scopeValues.includes(opts.category)) return true
  }
  return false
}
