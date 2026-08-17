import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireRole } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import { loadRunbooks, saveRunbooks, type Runbook } from '@/lib/runbook-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadRunbooks())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json() as Partial<Runbook>
    if (!body.name || !body.class || !body.risk) {
      return NextResponse.json({ error: 'name, class, risk required' }, { status: 400 })
    }

    const runbooks = loadRunbooks()
    const runbook: Runbook = {
      id: body.id ?? randomUUID(),
      name: body.name,
      description: body.description ?? '',
      class: body.class,
      risk: body.risk,
      rollbackPlan: body.rollbackPlan ?? 'No rollback plan provided.',
      enabled: body.enabled ?? true,
      steps: body.steps ?? [],
    }

    const idx = runbooks.findIndex(r => r.id === runbook.id)
    if (idx >= 0) runbooks[idx] = runbook
    else runbooks.push(runbook)

    saveRunbooks(runbooks)
    writeAudit({
      actor: auth.email,
      action: idx >= 0 ? 'runbook.update' : 'runbook.create',
      detail: `${runbook.name} (${runbook.id})`,
      ip: getClientIp(req),
    })
    return NextResponse.json(runbook)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const next = loadRunbooks().filter(r => r.id !== id)
  saveRunbooks(next)
    writeAudit({
      actor: auth.email,
      action: 'runbook.delete',
      detail: id,
      ip: getClientIp(req),
    })
  return NextResponse.json({ ok: true })
}
