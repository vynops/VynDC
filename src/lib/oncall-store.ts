/**
 * oncall-store.ts — Data stores for on-call, routing, SLA, escalations, seen-alerts
 * All persisted as JSON files in data/
 */
import fs from 'fs'
import path from 'path'

const DATA = path.join(process.cwd(), 'data')
const ensure = () => { if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true }) }

function load<T>(file: string, def: T): T {
  ensure()
  const f = path.join(DATA, file)
  if (!fs.existsSync(f)) return def
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) as T } catch { return def }
}
function save(file: string, data: unknown) {
  ensure()
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2), 'utf8')
}

// ─────────────────────────────────────────
// On-Call Shifts
// ─────────────────────────────────────────
export interface Shift {
  id: string
  name: string        // e.g. "Primary On-Call"
  userEmail: string
  userName: string
  startTime: string   // ISO 8601
  endTime: string     // ISO 8601
  timezone: string    // e.g. "UTC", "America/New_York"
}

export interface OnCallStore {
  shifts: Shift[]
}

const defaultOncall: OnCallStore = { shifts: [] }

export function loadOncall(): OnCallStore { return load('oncall.json', defaultOncall) }
export function saveOncall(data: OnCallStore) { save('oncall.json', data) }

/** Returns emails of users currently on-call based on active shifts */
export function currentOnCallEmails(): string[] {
  const now = new Date()
  return loadOncall().shifts
    .filter(s => new Date(s.startTime) <= now && new Date(s.endTime) > now)
    .map(s => s.userEmail)
}

/** Returns the primary on-call person (first active shift, or null) */
export function currentOnCallPerson(): Shift | null {
  const now = new Date()
  return loadOncall().shifts.find(s => new Date(s.startTime) <= now && new Date(s.endTime) > now) ?? null
}

// ─────────────────────────────────────────
// Routing Rules
// ─────────────────────────────────────────
export interface RoutingRule {
  id: string
  name: string
  /** 'critical' | 'high' | 'medium' | 'low' | '*' */
  severity: string
  /** category match or '*' */
  category: string
  notifyEmails: string[]  // explicit email list
  notifySlack: boolean
  notifyOncall: boolean   // also notify whoever is on-call
  escalationPolicyId: string
}

const defaultRouting: RoutingRule[] = [
  {
    id: 'default',
    name: 'Default — notify on-call',
    severity: '*',
    category: '*',
    notifyEmails: [],
    notifySlack: true,
    notifyOncall: true,
    escalationPolicyId: 'default',
  },
]

export function loadRouting(): RoutingRule[] { return load('routing.json', defaultRouting) }
export function saveRouting(r: RoutingRule[]) { save('routing.json', r) }

/** Find best matching routing rule for a given severity + category */
export function matchRouting(severity: string, category: string): RoutingRule {
  const rules = loadRouting()
  return (
    rules.find(r => r.severity === severity && r.category === category) ??
    rules.find(r => r.severity === severity && r.category === '*') ??
    rules.find(r => r.severity === '*' && r.category === category) ??
    rules.find(r => r.severity === '*' && r.category === '*') ??
    defaultRouting[0]
  )
}

// ─────────────────────────────────────────
// SLA Policies
// ─────────────────────────────────────────
export interface SlaTier {
  ackMinutes: number
  resolveMinutes: number
}

export type SlaConfig = Record<string, SlaTier>

const defaultSla: SlaConfig = {
  critical: { ackMinutes: 15,  resolveMinutes: 60   },
  high:     { ackMinutes: 30,  resolveMinutes: 240  },
  medium:   { ackMinutes: 120, resolveMinutes: 480  },
  low:      { ackMinutes: 480, resolveMinutes: 1440 },
}

export function loadSla(): SlaConfig { return { ...defaultSla, ...load('sla.json', {}) } }
export function saveSla(s: SlaConfig) { save('sla.json', s) }

// ─────────────────────────────────────────
// Escalation Policies
// ─────────────────────────────────────────
export interface EscalationStep {
  delayMin: number        // minutes after incident creation
  notifyEmails: string[]
  notifySlack: boolean
  notifyOncall: boolean
  message?: string        // optional custom message prefix
}

export interface EscalationPolicy {
  id: string
  name: string
  steps: EscalationStep[]
}

const defaultEscalations: EscalationPolicy[] = [
  {
    id: 'default',
    name: 'Default Escalation',
    steps: [
      { delayMin: 15, notifyEmails: [], notifySlack: true,  notifyOncall: true,  message: 'Reminder: unacknowledged' },
      { delayMin: 30, notifyEmails: [], notifySlack: true,  notifyOncall: true,  message: 'Escalation: unresolved 30min' },
      { delayMin: 60, notifyEmails: [], notifySlack: true,  notifyOncall: false, message: 'Critical escalation: 1hr unresolved' },
    ],
  },
]

export function loadEscalations(): EscalationPolicy[] {
  const saved = load<EscalationPolicy[]>('escalation-policies.json', [])
  return saved.length ? saved : defaultEscalations
}
export function saveEscalations(p: EscalationPolicy[]) { save('escalation-policies.json', p) }

export function findPolicy(id: string): EscalationPolicy | null {
  return loadEscalations().find(p => p.id === id) ?? null
}

// ─────────────────────────────────────────
// Seen Alerts — tracks notification state per incident
// ─────────────────────────────────────────
export interface SeenAlert {
  id: string
  firstSeenAt: string          // ISO — when we first saw this alert
  severity: string
  title: string
  notifiedAt: string           // ISO — last notification sent
  escalationStep: number       // index of next escalation step to fire
  acknowledged: boolean
  resolved: boolean
  ackBreachNotified: boolean   // sent SLA ack-breach notification?
  resolveBreachNotified: boolean
}

export function loadSeenAlerts(): Record<string, SeenAlert> { return load('seen-alerts.json', {}) }
export function saveSeenAlerts(s: Record<string, SeenAlert>) { save('seen-alerts.json', s) }
