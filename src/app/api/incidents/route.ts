import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedIncidents } from '@/lib/simulation'
import { isAlertmanagerConfigured } from '@/lib/prometheus'
import { dispatchAlerts } from '@/lib/alert-dispatcher'
import { enqueueNotification } from '@/lib/notification-queue'
import { createHash } from 'node:crypto'
import { currentOnCallEmails, matchRouting } from '@/lib/oncall-store'
import { getSettings } from '@/lib/settings-store'
import { writeAuditSync, getClientIp } from '@/lib/audit'
import { collectIncidents, IncidentSourceUnavailable } from '@/lib/incident-source'
import { loadOverrides, saveOverrides, loadHistory, loadSnapshot, applyOverrides, archiveIncident, episodeId } from '@/lib/incident-store'
import { withStoreLock } from '@/lib/json-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  try {
    const { incidents, live } = await collectIncidents()
    if (live) {
      try { dispatchAlerts(incidents) } catch { console.error('[incidents] dispatch deferred; incident response remains live') }
    }
    const episodes = new Set(incidents.map(episodeId))
    const history = loadHistory().filter(incident => !episodes.has(episodeId(incident))).slice(0, 50)
    return NextResponse.json([...incidents, ...history])
  } catch (error) {
    if (error instanceof IncidentSourceUnavailable) {
      try { return NextResponse.json(applyOverrides(simulatedIncidents(), true)) }
      catch { return NextResponse.json({ error: 'Incident persistence unavailable' }, { status: 503 }) }
    }
    return NextResponse.json({ error: 'Incident persistence unavailable' }, { status: 503 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 }) }
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { id, status, notes, assignTo, createdAt } = body as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim() || id.length > 300
      || (status !== undefined && (typeof status !== 'string' || !['acknowledged', 'resolved', 'open'].includes(status)))
      || (notes !== undefined && (typeof notes !== 'string' || notes.length > 4000))
      || (createdAt !== undefined && typeof createdAt !== 'string')
      || (assignTo !== undefined && (typeof assignTo !== 'string' || (assignTo !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignTo)) || assignTo.length > 254))
      || (status === undefined && assignTo === undefined && notes === undefined)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    let current
    let live = false
    try {
      const collected = await collectIncidents()
      current = collected.incidents
      live = collected.live
    } catch {
      current = applyOverrides(loadSnapshot())
      live = isAlertmanagerConfigured()
      if (isAlertmanagerConfigured() && current.length === 0) return NextResponse.json({ error: 'Incident source unavailable; try again shortly' }, { status: 503 })
    }
    const sourceIncident = current.find(incident => incident.id === id)
    const known = sourceIncident ?? loadHistory().find(incident => incident.id === id && (!createdAt || incident.createdAt === createdAt))
    if (!known) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    if (createdAt && createdAt !== known.createdAt) return NextResponse.json({ error: 'Incident has changed; refresh before acting' }, { status: 409 })
    if (status === 'open' && !sourceIncident) return NextResponse.json({ error: 'Cannot reopen an alert that is no longer active' }, { status: 409 })
    return withStoreLock('incident-state', () => {
      const before = applyOverrides([known])[0]
      if (before.status === 'resolved' && status === 'acknowledged') return NextResponse.json({ error: 'Reopen the incident before acknowledging it' }, { status: 409 })
      const nextStatus = status === undefined ? before.status : status as typeof before.status
      const after = {
        ...before, status: nextStatus,
        resolvedAt: nextStatus === 'resolved' ? before.resolvedAt ?? new Date().toISOString() : undefined,
        assignedTo: assignTo !== undefined ? (assignTo as string || undefined) : before.assignedTo ?? (status && status !== 'open' ? auth.email : undefined),
        ...(notes !== undefined ? { notes: notes as string } : {}),
      }
      const changed = JSON.stringify(before) !== JSON.stringify(after)
      const action = status === 'resolved' ? 'incident.resolve' : status === 'acknowledged' ? 'incident.acknowledge' : assignTo !== undefined ? 'incident.assign' : 'incident.update'
      const audit = { actor: auth.email, action, detail: `${before.title}: ${nextStatus}`, ip: getClientIp(req), incidentId: id, episodeId: episodeId(before), before: { ...before }, after: { ...after }, notes: after.notes }
      if (changed) {
        writeAuditSync({ ...audit, outcome: 'requested' })
        const overrides = loadOverrides()
        overrides[id] = { status: after.status, resolvedAt: after.resolvedAt, assignedTo: after.assignedTo, notes: after.notes, episodeCreatedAt: after.createdAt }
        saveOverrides(overrides)
        if (after.status === 'resolved') archiveIncident(after)
        writeAuditSync({ ...audit, outcome: 'succeeded' })
      }
      const rule = matchRouting(after.severity, after.category)
      const recipients = [...rule.notifyEmails, ...(rule.notifyOncall ? currentOnCallEmails() : []), ...(getSettings().alertRecipients ?? '').split(',').map(value => value.trim()).filter(Boolean)]
      const identity = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      enqueueNotification(after, `${action}:${identity}`, `[VynDC] ${action}: ${after.title}\nStatus: ${after.status}${after.assignedTo ? `\nAssigned to: ${after.assignedTo}` : ''}`, { includeSlack: rule.notifySlack, recipients, simulation: !live })
      return NextResponse.json({ ok: true })
    })
  } catch {
    return NextResponse.json({ error: 'Unable to save incident action; refresh before retrying' }, { status: 503 })
  }
}
