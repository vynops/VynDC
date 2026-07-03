import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadSla, saveSla } from '@/lib/oncall-store'
import { loadSeenAlerts } from '@/lib/oncall-store'
import { isAlertmanagerConfigured, alertmanagerAlerts } from '@/lib/prometheus'
import { simulatedIncidents } from '@/lib/simulation'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const sla = loadSla()
  const seen = loadSeenAlerts()

  // Build per-incident SLA status
  let incidents: { id: string; title: string; severity: string; createdAt: string; status: string }[] = []
  if (isAlertmanagerConfigured()) {
    try {
      const raw = await alertmanagerAlerts()
      incidents = raw.map(a => ({
        id: a.fingerprint,
        title: a.annotations.summary ?? a.labels.alertname ?? 'Alert',
        severity: a.labels.severity ?? 'medium',
        createdAt: a.startsAt,
        status: a.status.state === 'suppressed' ? 'acknowledged' : 'open',
      }))
    } catch { /* fall through to simulated */ }
  }
  if (!incidents.length) {
    incidents = simulatedIncidents().map(i => ({
      id: i.id, title: i.title, severity: i.severity, createdAt: i.createdAt, status: i.status,
    }))
  }

  const now = Date.now()
  const rows = incidents
    .filter(i => i.status !== 'resolved')
    .map(i => {
      const tier = sla[i.severity] ?? sla.medium ?? { ackMinutes: 120, resolveMinutes: 480 }
      const ageMin = (now - new Date(i.createdAt).getTime()) / 60_000
      const s = seen[i.id]
      return {
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        createdAt: i.createdAt,
        ageMin: Math.round(ageMin),
        ackSlaMin: tier.ackMinutes,
        resolveSlaMin: tier.resolveMinutes,
        ackBreached: s?.acknowledged ? false : ageMin > tier.ackMinutes,
        resolveBreached: ageMin > tier.resolveMinutes,
        acknowledged: s?.acknowledged ?? i.status === 'acknowledged',
        escalationStep: s?.escalationStep ?? 0,
      }
    })

  return NextResponse.json({ sla, rows })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json()
    saveSla(body)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
