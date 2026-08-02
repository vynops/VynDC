import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireRole, type SessionPayload } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import {
  loadMaintenanceWindows,
  saveMaintenanceWindows,
  activeMaintenanceWindows,
  type MaintenanceWindow,
} from '@/lib/maintenance-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const activeOnly = url.searchParams.get('active') === '1'
  const windows = activeOnly ? activeMaintenanceWindows() : loadMaintenanceWindows()
  return NextResponse.json(windows)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const session = auth as SessionPayload

  try {
    const body = await req.json() as Partial<MaintenanceWindow>

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title required' }, { status: 400 })
    }
    if (!body.startsAt || !body.endsAt) {
      return NextResponse.json({ error: 'startsAt and endsAt required' }, { status: 400 })
    }
    if (new Date(body.endsAt) <= new Date(body.startsAt)) {
      return NextResponse.json({ error: 'endsAt must be after startsAt' }, { status: 400 })
    }

    const windows = loadMaintenanceWindows()
    const win: MaintenanceWindow = {
      id: body.id ?? randomUUID(),
      title: body.title.trim(),
      description: body.description ?? '',
      scope: body.scope ?? 'all',
      scopeValues: body.scopeValues ?? [],
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      suppressAlerts: body.suppressAlerts ?? true,
      pauseSla: body.pauseSla ?? true,
      createdBy: session.email,
      createdAt: new Date().toISOString(),
    }

    const idx = windows.findIndex(w => w.id === win.id)
    if (idx >= 0) windows[idx] = win
    else windows.push(win)

    saveMaintenanceWindows(windows)

    writeAudit({
      actor: session.email,
      action: 'maintenance.create',
      detail: `${win.title} (${win.scope}) ${win.startsAt} → ${win.endsAt}`,
      ip: getClientIp(req),
    })

    return NextResponse.json(win)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const session = auth as SessionPayload

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const windows = loadMaintenanceWindows()
  const win = windows.find(w => w.id === id)
  if (!win) return NextResponse.json({ error: 'not found' }, { status: 404 })

  saveMaintenanceWindows(windows.filter(w => w.id !== id))

  writeAudit({
    actor: session.email,
    action: 'maintenance.delete',
    detail: win.title,
    ip: getClientIp(req),
  })

  return NextResponse.json({ ok: true })
}
