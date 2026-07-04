import { NextRequest, NextResponse } from 'next/server'
import { requireRole, hasRole } from '@/lib/auth'
import { simulatedIncidents } from '@/lib/simulation'
import type { Incident } from '@/lib/simulation'
import { isAlertmanagerConfigured, alertmanagerAlerts } from '@/lib/prometheus'
import { dispatchAlerts } from '@/lib/alert-dispatcher'
import { sendSlack } from '@/lib/notifier'
import fs from 'fs'
import path from 'path'

const DATA_FILE = path.join(process.cwd(), 'data', 'incidents.json')

function loadOverrides(): Record<string, Partial<Incident>> {
  if (!fs.existsSync(DATA_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return {} }
}

function saveOverrides(o: Record<string, Partial<Incident>>) {
  const dir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(o, null, 2), 'utf8')
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const overrides = loadOverrides()

  if (isAlertmanagerConfigured()) {
    try {
      const rawAlerts = await alertmanagerAlerts()
      const liveIncidents: Incident[] = rawAlerts.map(a => ({
        id: a.fingerprint,
        title: a.annotations.summary ?? a.labels.alertname ?? 'Alert',
        severity: (['critical','high','medium','low'].includes(a.labels.severity)
          ? a.labels.severity : 'medium') as Incident['severity'],
        hostname: a.labels.instance ?? a.labels.node ?? undefined,
        rack: undefined,
        category: 'hardware' as const,
        description: a.annotations.description ?? a.annotations.message ?? '',
        status: a.status.state === 'suppressed' ? 'acknowledged' : 'open',
        createdAt: a.startsAt,
        resolvedAt: a.endsAt && !a.endsAt.startsWith('0001') ? a.endsAt : undefined,
        assignedTo: undefined,
        ...overrides[a.fingerprint],
      }))
      dispatchAlerts(liveIncidents)
      return NextResponse.json(liveIncidents)
    } catch (e) {
      console.error('[incidents] Alertmanager error, falling back:', e)
    }
  }

  const incidents = simulatedIncidents().map(i => ({ ...i, ...(overrides[i.id] ?? {}) }))
  return NextResponse.json(incidents)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  try {
    const { id, status, notes, assignTo, _title, _severity, _hostname } = await req.json() as {
      id: string; status?: string; notes?: string; assignTo?: string
      _title?: string; _severity?: string; _hostname?: string
    }
    if (!id || (status && !['acknowledged', 'resolved', 'open'].includes(status)) || (!status && assignTo === undefined)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const overrides = loadOverrides()
    const actor = typeof auth === 'object' && 'email' in auth ? (auth as { email: string }).email : undefined

    if (status) {
      overrides[id] = {
        ...overrides[id],
        status: status as Incident['status'],
        resolvedAt: status === 'resolved' ? new Date().toISOString() : (status === 'open' ? undefined : overrides[id]?.resolvedAt),
        // Explicit assignTo takes priority; fall back to auto-assigning the actor on ack/resolve
        assignedTo: assignTo !== undefined ? (assignTo || undefined) : (status !== 'open' ? actor : undefined),
        ...(notes !== undefined ? { notes } : {}),
      }
    } else {
      // Pure assignment — no status change
      overrides[id] = { ...overrides[id], assignedTo: assignTo || undefined }
    }

    saveOverrides(overrides)

    // Slack notification on assignment
    const effectiveAssignee = assignTo ?? (status && status !== 'open' ? actor : undefined)
    if (effectiveAssignee) {
      const sev = (_severity ?? 'incident').toUpperCase()
      const title = _title ?? id
      const host = _hostname ? ` — \`${_hostname}\`` : ''
      sendSlack(`🎯 *Incident Assigned*\n*[${sev}]* ${title}${host}\n→ Assigned to: \`${effectiveAssignee}\``).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
