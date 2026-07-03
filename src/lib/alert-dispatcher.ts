/**
 * alert-dispatcher.ts — Core incident management engine
 *
 * Called after every incidents fetch. For each active incident:
 *  1. NEW alert  → send initial Slack + email via routing rule
 *  2. SLA breach → send ack-breach / resolve-breach notification
 *  3. Escalation → fire escalation steps based on elapsed time
 *
 * Guards:
 *  - File-based cooldown: only dispatches once per COOLDOWN_SECONDS
 *  - Catch-up suppression: first-seen old alerts skip historical notifications
 *  - Escalation cap: won't re-fire a step already fired
 *
 * All notification I/O is fire-and-forget (non-blocking).
 */
import { sendSlack, sendEmail } from './notifier'
import {
  loadSeenAlerts, saveSeenAlerts,
  matchRouting, loadSla, findPolicy,
  currentOnCallEmails,
  type SeenAlert,
} from './oncall-store'
import { getSettings } from './settings-store'
import type { Incident } from './simulation'
import fs from 'fs'
import path from 'path'

/** Minimum seconds between dispatch runs (prevents duplicate floods from concurrent polls) */
const COOLDOWN_SECONDS = 55

const LOCK_FILE = path.join(process.cwd(), 'data', 'dispatch-lock.json')

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

function plainText(s: string) { return s.replace(/\*/g, '').replace(/`/g, '') }

/**
 * Dispatch notifications for a batch of active incidents.
 * Saves seen-alert state. Fires all I/O async without awaiting.
 */
export function dispatchAlerts(incidents: Incident[]): void {
  // ── Cooldown guard: skip if ran recently ──────────────────────
  const now = Date.now()
  if (now - readLock() < COOLDOWN_SECONDS * 1000) return
  writeLock()

  const seen   = loadSeenAlerts()
  const sla    = loadSla()
  const notify: (() => Promise<void>)[] = []
  const settings = getSettings()

  // Default recipients from settings (fallback when routing has no emails)
  const defaultEmails = (settings.alertRecipients ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  for (const inc of incidents) {
    // Clean up resolved
    if (inc.status === 'resolved') {
      delete seen[inc.id]
      continue
    }

    const rule    = matchRouting(inc.severity, inc.category)
    const policy  = rule.escalationPolicyId ? findPolicy(rule.escalationPolicyId) : null
    const oncall  = currentOnCallEmails()
    const slaTier = sla[inc.severity] ?? sla.medium ?? { ackMinutes: 120, resolveMinutes: 480 }

    const ageMin  = (now - new Date(inc.createdAt).getTime()) / 60_000

    // ── 1. NEW INCIDENT ──────────────────────────────────────────
    if (!seen[inc.id]) {
      // Catch-up suppression: if alert is already older than all SLA + escalation
      // thresholds, mark everything as already notified to avoid a historical flood.
      const maxEscDelay  = policy ? Math.max(...policy.steps.map(s => s.delayMin), 0) : 0
      const isCatchUp    = ageMin > Math.max(slaTier.ackMinutes, slaTier.resolveMinutes, maxEscDelay)

      seen[inc.id] = {
        id:                     inc.id,
        firstSeenAt:            inc.createdAt,
        severity:               inc.severity,
        title:                  inc.title,
        notifiedAt:             new Date().toISOString(),
        escalationStep:         isCatchUp ? (policy?.steps.length ?? 0) : 0,
        acknowledged:           inc.status === 'acknowledged',
        resolved:               false,
        ackBreachNotified:      isCatchUp || ageMin > slaTier.ackMinutes,
        resolveBreachNotified:  isCatchUp || ageMin > slaTier.resolveMinutes,
      }

      if (!isCatchUp) {
        // Only send "new alert" notification for genuinely fresh alerts
        const emails = [...new Set([
          ...rule.notifyEmails,
          ...(rule.notifyOncall ? oncall : []),
          ...defaultEmails,
        ])]
        const msg = formatMsg('🚨', inc)
        notify.push(async () => {
          if (rule.notifySlack) await sendSlack(msg)
          if (emails.length)    await sendEmail(emails, `[VynDC] ${inc.severity.toUpperCase()}: ${inc.title}`, plainText(msg))
        })
      }
      continue
    }

    const entry = seen[inc.id]
    entry.acknowledged = inc.status === 'acknowledged'

    // ── 2. SLA ACK BREACH ────────────────────────────────────────
    if (!entry.acknowledged && !entry.ackBreachNotified && ageMin > slaTier.ackMinutes) {
      entry.ackBreachNotified = true
      const emails = [...new Set([...oncall, ...defaultEmails])]
      const msg = `⚠️ *SLA ACK BREACH* — Not acknowledged within ${slaTier.ackMinutes}min\n*[${inc.severity.toUpperCase()}]* ${inc.title} (open ${Math.round(ageMin)}min)`
      notify.push(async () => {
        await sendSlack(msg)
        if (emails.length) await sendEmail(emails, `[VynDC SLA Breach] ${inc.title}`, plainText(msg))
      })
    }

    // ── 3. SLA RESOLVE BREACH ────────────────────────────────────
    if (!entry.resolveBreachNotified && ageMin > slaTier.resolveMinutes) {
      entry.resolveBreachNotified = true
      const emails = [...new Set([...oncall, ...defaultEmails])]
      const msg = `🔴 *SLA RESOLVE BREACH* — Unresolved for ${Math.round(ageMin)}min (SLA: ${slaTier.resolveMinutes}min)\n*[${inc.severity.toUpperCase()}]* ${inc.title}`
      notify.push(async () => {
        await sendSlack(msg)
        if (emails.length) await sendEmail(emails, `[VynDC SLA Resolve Breach] ${inc.title}`, plainText(msg))
      })
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
        notify.push(async () => {
          if (step.notifySlack) await sendSlack(msg)
          if (emails.length)    await sendEmail(emails, `[VynDC Escalation] ${inc.title}`, plainText(msg))
        })
      }
    }
  }

  saveSeenAlerts(seen)

  // Fire all notifications without blocking the API response
  for (const fn of notify) {
    fn().catch(e => console.error('[dispatcher] notification error:', e))
  }
}
