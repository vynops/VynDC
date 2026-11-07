/**
 * alert-dispatcher.ts — Core incident management engine
 *
 * Called by the worker and successful live incident reads. For each incident:
 *  1. NEW alert: enqueue routed channel deliveries
 *  2. SLA breach: enqueue acknowledgement/resolution breach deliveries
 *  3. Escalation: enqueue bounded policy steps based on elapsed time
 *
 * Guards:
 *  - File-based cooldown: only dispatches once per COOLDOWN_SECONDS
 *  - Catch-up suppression: first-seen old alerts skip historical notifications
 *  - Escalation cap: won't re-fire a step already fired
 *
 * Network delivery and retries run independently from the persisted queue.
 */
import { enqueueNotification } from './notification-queue'
import {
  loadSeenAlerts, saveSeenAlerts,
  matchRouting, loadSla, findPolicy,
  currentOnCallEmails,
} from './oncall-store'
import { getSettings } from './settings-store'
import { isUnderMaintenance, isSlapaused } from './maintenance-store'
import { archiveIncident as appendToHistory, type StoredIncident as Incident } from './incident-store'
import { withStoreLock } from './json-store'
import { writeAuditSync } from './audit'
import fs from 'fs'
import path from 'path'

/** Minimum seconds between dispatch runs (prevents duplicate floods from concurrent polls) */
const COOLDOWN_SECONDS = 55

const LOCK_FILE    = path.join(process.cwd(), 'data', 'dispatch-lock.json')

function readLock(): number {
  try {
    if (!fs.existsSync(LOCK_FILE)) return 0
    const { lastRun } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) as { lastRun: number }
    return lastRun ?? 0
  } catch { return 0 }
}

function writeLock() {
  const dir = path.dirname(LOCK_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ lastRun: Date.now() }), 'utf8')
}

/** Build a human-readable alert message */
function formatMsg(prefix: string, inc: Incident): string {
  const sev = inc.severity.toUpperCase()
  const host = inc.hostname ? ` — \`${inc.hostname}\`` : ''
  return `${prefix} *[${sev}]* ${inc.title}${host}\nCategory: ${inc.category} | Status: ${inc.status}`
}

/**
 * Dispatch notifications for a batch of active incidents.
 * Saves scheduling state after notification jobs are persisted.
 */
export function dispatchAlerts(incidents: Incident[]): void {
  return withStoreLock('incident-dispatch', () => dispatchBatch(incidents))
}

function dispatchBatch(incidents: Incident[]): void {
  // ── Cooldown guard: skip if ran recently ──────────────────────
  const now = Date.now()
  if (now - readLock() < COOLDOWN_SECONDS * 1000) return
  writeLock()

  const seen   = loadSeenAlerts()
  const sla    = loadSla()
  const settings = getSettings()
  const defaultEmails = (settings.alertRecipients ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const activeIds = new Set(incidents.map(incident => incident.id))
  for (const [id, entry] of Object.entries(seen)) {
    if (activeIds.has(id)) continue
    entry.missingCount = (entry.missingCount ?? 0) + 1
    if (entry.missingCount < 2) continue
    const previous: Incident = entry.incident ?? {
      id, title: entry.title, severity: entry.severity as Incident['severity'],
      createdAt: entry.firstSeenAt, status: 'open', category: 'hardware', description: '',
    }
    if (appendToHistory(previous, 'source-cleared')) {
      writeAuditSync({ actor: 'system', action: 'incident.source-resolve', detail: 'Alert absent from two successful source reads', ip: 'system', incidentId: id, episodeId: `${id}:${previous.createdAt}`, before: { ...previous }, after: { status: 'resolved' }, outcome: 'succeeded' })
      if (entry.incident && !isUnderMaintenance({ hostname: previous.hostname, rack: previous.rack, category: previous.category })) {
        const rule = matchRouting(previous.severity, previous.category)
        enqueueNotification(previous, 'incident.source-resolve', `[VynDC] Alert cleared: ${previous.title}`, { includeSlack: rule.notifySlack, recipients: [...rule.notifyEmails, ...(rule.notifyOncall ? currentOnCallEmails() : []), ...defaultEmails] })
      }
    }
    delete seen[id]
  }

  for (const inc of incidents) {
    if (seen[inc.id] && seen[inc.id].firstSeenAt !== inc.createdAt) {
      if (seen[inc.id].incident) appendToHistory(seen[inc.id].incident!, 'episode-replaced')
      delete seen[inc.id]
    }
    // Clean up resolved — persist to history first
    if (inc.status === 'resolved') {
      appendToHistory(inc)
      delete seen[inc.id]
      continue
    }

    const rule    = matchRouting(inc.severity, inc.category)
    const policy  = rule.escalationPolicyId ? findPolicy(rule.escalationPolicyId) : null
    const oncall  = currentOnCallEmails()
    const slaTier = sla[inc.severity] ?? sla.medium ?? { ackMinutes: 120, resolveMinutes: 480 }

    const ageMin  = (now - new Date(inc.createdAt).getTime()) / 60_000

    // ── MAINTENANCE WINDOW SUPPRESSION ──────────────────────────
    const maintenanceCtx = { hostname: inc.hostname, rack: inc.rack, category: inc.category }
    const slaPaused = isSlapaused(maintenanceCtx)
    const previousEntry = seen[inc.id]
    if (previousEntry) {
      if (slaPaused && previousEntry.slaPauseStartedAt === undefined) previousEntry.slaPauseStartedAt = now
      if (!slaPaused && previousEntry.slaPauseStartedAt !== undefined) {
        previousEntry.slaPausedMs = (previousEntry.slaPausedMs ?? 0) + now - previousEntry.slaPauseStartedAt
        delete previousEntry.slaPauseStartedAt
      }
    }
    const slaAgeMin = Math.max(0, ageMin - ((previousEntry?.slaPausedMs ?? 0)
      + (previousEntry?.slaPauseStartedAt !== undefined ? now - previousEntry.slaPauseStartedAt : 0)) / 60_000)
    if (isUnderMaintenance(maintenanceCtx) || inc.sourceSuppressed) {
      // Mark as seen so we don't flood when the window ends, but skip all notifications
      if (!seen[inc.id]) {
        seen[inc.id] = {
          id: inc.id,
          incident: inc,
          slaPauseStartedAt: slaPaused ? now : undefined,
          slaPausedMs: 0,
          firstSeenAt: inc.createdAt,
          severity: inc.severity,
          title: inc.title,
          notifiedAt: new Date().toISOString(),
          escalationStep: 0,
          acknowledged: inc.status === 'acknowledged',
          resolved: false,
          ackBreachNotified: true,   // suppress SLA breach alerts during maintenance
          resolveBreachNotified: true,
        }
      } else {
        seen[inc.id].incident = inc
        seen[inc.id].missingCount = 0
      }
      continue
    }

    // ── SLA PAUSE CHECK ──────────────────────────────────────────
    if (!seen[inc.id]) {
      // Catch-up suppression: if alert is already older than all SLA + escalation
      // thresholds, mark everything as already notified to avoid a historical flood.
      const maxEscDelay  = policy ? Math.max(...policy.steps.map(s => s.delayMin), 0) : 0
      const isCatchUp    = ageMin > Math.max(slaTier.ackMinutes, slaTier.resolveMinutes, maxEscDelay)

      seen[inc.id] = {
        id:                     inc.id,
        incident:               inc,
        slaPauseStartedAt:      slaPaused ? now : undefined,
        slaPausedMs:            0,
        firstSeenAt:            inc.createdAt,
        severity:               inc.severity,
        title:                  inc.title,
        notifiedAt:             new Date().toISOString(),
        escalationStep:         isCatchUp ? (policy?.steps.length ?? 0) : 0,
        acknowledged:           inc.status === 'acknowledged',
        resolved:               false,
        ackBreachNotified:      isCatchUp || (!slaPaused && ageMin > slaTier.ackMinutes),
        resolveBreachNotified:  isCatchUp || (!slaPaused && ageMin > slaTier.resolveMinutes),
      }

      if (!isCatchUp) {
        // Only send "new alert" notification for genuinely fresh alerts
        const emails = [...new Set([
          ...rule.notifyEmails,
          ...(rule.notifyOncall ? oncall : []),
          ...defaultEmails,
        ])]
        const msg = formatMsg('🚨', inc)
        enqueueNotification(inc, 'initial', msg, { includeSlack: rule.notifySlack, recipients: emails, subject: `[VynDC] ${inc.severity.toUpperCase()}: ${inc.title}` })
      }
      continue
    }

    const entry = seen[inc.id]
    entry.incident = inc
    entry.missingCount = 0
    entry.acknowledged = inc.status === 'acknowledged'

    // ── 2. SLA ACK BREACH ────────────────────────────────────────
    if (!entry.acknowledged && !entry.ackBreachNotified && !slaPaused && slaAgeMin > slaTier.ackMinutes) {
      entry.ackBreachNotified = true
      const emails = [...new Set([...oncall, ...defaultEmails])]
      const msg = `⚠️ *SLA ACK BREACH* — Not acknowledged within ${slaTier.ackMinutes}min\n*[${inc.severity.toUpperCase()}]* ${inc.title} (open ${Math.round(ageMin)}min)`
      enqueueNotification(inc, 'ack-breach', msg, { recipients: emails, subject: `[VynDC SLA Breach] ${inc.title}` })
    }

    // ── 3. SLA RESOLVE BREACH ────────────────────────────────────
    if (!entry.resolveBreachNotified && !slaPaused && slaAgeMin > slaTier.resolveMinutes) {
      entry.resolveBreachNotified = true
      const emails = [...new Set([...oncall, ...defaultEmails])]
      const msg = `🔴 *SLA RESOLVE BREACH* — Unresolved for ${Math.round(ageMin)}min (SLA: ${slaTier.resolveMinutes}min)\n*[${inc.severity.toUpperCase()}]* ${inc.title}`
      enqueueNotification(inc, 'resolve-breach', msg, { recipients: emails, subject: `[VynDC SLA Resolve Breach] ${inc.title}` })
    }

    // ── 4. ESCALATION STEPS ──────────────────────────────────────
    if (policy && entry.escalationStep < policy.steps.length) {
      const step = policy.steps[entry.escalationStep]
      if (step && ageMin >= step.delayMin) {
        // Advance step BEFORE saving to prevent re-fire on concurrent call
        entry.escalationStep++
        const emails = [...new Set([
          ...step.notifyEmails,
          ...(step.notifyOncall ? oncall : []),
          ...defaultEmails,
        ])]
        const prefix = step.message ? `🔺 *${step.message}*` : `🔺 *Escalation step ${entry.escalationStep}*`
        const msg = `${prefix}\n*[${inc.severity.toUpperCase()}]* ${inc.title} — open ${Math.round(ageMin)}min`
        enqueueNotification(inc, `escalation-${entry.escalationStep}`, msg, { includeSlack: step.notifySlack, recipients: emails, subject: `[VynDC Escalation] ${inc.title}` })
      }
    }
  }

  saveSeenAlerts(seen)

}
