import fs from 'fs'
import path from 'path'
import type { RunbookStep } from './runbook-store'
import { sendEmail, sendWebhookNotifications } from './notifier'
import { getSettings } from './settings-store'

type IncidentOverride = {
  notes?: string
  assignedTo?: string
  _tags?: string[]
  [key: string]: unknown
}

const INCIDENT_OVERRIDES_FILE = path.join(process.cwd(), 'data', 'incidents.json')

function loadOverrides(): Record<string, IncidentOverride> {
  if (!fs.existsSync(INCIDENT_OVERRIDES_FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(INCIDENT_OVERRIDES_FILE, 'utf8')) as Record<string, IncidentOverride>
  } catch {
    return {}
  }
}

function saveOverrides(overrides: Record<string, IncidentOverride>) {
  const dir = path.dirname(INCIDENT_OVERRIDES_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(INCIDENT_OVERRIDES_FILE, JSON.stringify(overrides, null, 2), 'utf8')
}

function appendNote(existing: string | undefined, next: string): string {
  const line = next.trim()
  if (!line) return existing ?? ''
  if (!existing?.trim()) return line
  return `${existing.trim()}\n${line}`
}

function recipientList(): string[] {
  const { alertRecipients } = getSettings()
  return (alertRecipients ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

export async function executeRunbookSteps(params: {
  runbookName: string
  steps: RunbookStep[]
  executionId: string
  incidentId?: string
  requestedBy: string
}): Promise<{ actionLog: Array<{ ts: string; stepId: string; action: string; detail: string }>; failedCount: number }> {
  const { runbookName, steps, executionId, incidentId, requestedBy } = params

  const actionLog: Array<{ ts: string; stepId: string; action: string; detail: string }> = []
  let failedCount = 0

  for (const step of steps) {
    const ts = new Date().toISOString()
    try {
      if (step.actionType === 'notify') {
        const message = step.payload.message?.trim() || `[VynDC] Runbook '${runbookName}' executed (${executionId}).`
        await sendWebhookNotifications(message)

        const recipients = recipientList()
        if (recipients.length > 0) {
          await sendEmail(recipients, `[VynDC Runbook] ${runbookName}`, message)
        }

        actionLog.push({ ts, stepId: step.id, action: 'executed', detail: `notify: ${message}` })
        continue
      }

      if (!incidentId) {
        actionLog.push({ ts, stepId: step.id, action: 'skipped', detail: `${step.actionType}: incidentId required` })
        continue
      }

      const overrides = loadOverrides()
      const current = overrides[incidentId] ?? {}

      if (step.actionType === 'incident-note') {
        const note = step.payload.note?.trim() || step.payload.message?.trim() || `Runbook '${runbookName}' note by ${requestedBy}`
        overrides[incidentId] = { ...current, notes: appendNote(current.notes, note) }
        saveOverrides(overrides)
        actionLog.push({ ts, stepId: step.id, action: 'executed', detail: `incident-note: ${note}` })
        continue
      }

      if (step.actionType === 'assign-owner') {
        const owner = step.payload.owner?.trim() || requestedBy
        overrides[incidentId] = { ...current, assignedTo: owner }
        saveOverrides(overrides)
        actionLog.push({ ts, stepId: step.id, action: 'executed', detail: `assign-owner: ${owner}` })
        continue
      }

      if (step.actionType === 'tag') {
        const tag = step.payload.tag?.trim()
        if (!tag) {
          actionLog.push({ ts, stepId: step.id, action: 'skipped', detail: 'tag: payload.tag is empty' })
          continue
        }
        const existingTags = Array.isArray(current._tags) ? current._tags : []
        const tags = existingTags.includes(tag) ? existingTags : [...existingTags, tag]
        const note = `[tag:${tag}] added by runbook '${runbookName}'`
        overrides[incidentId] = {
          ...current,
          _tags: tags,
          notes: appendNote(current.notes, note),
        }
        saveOverrides(overrides)
        actionLog.push({ ts, stepId: step.id, action: 'executed', detail: `tag: ${tag}` })
        continue
      }

      actionLog.push({ ts, stepId: step.id, action: 'skipped', detail: `${step.actionType}: unsupported action type` })
    } catch (e) {
      failedCount += 1
      actionLog.push({
        ts,
        stepId: step.id,
        action: 'failed',
        detail: e instanceof Error ? e.message : 'Step execution failed',
      })
    }
  }

  return { actionLog, failedCount }
}
