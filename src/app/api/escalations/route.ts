import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadEscalations, saveEscalations, type EscalationPolicy } from '@/lib/oncall-store'
import { randomUUID } from 'crypto'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadEscalations())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json() as Partial<EscalationPolicy>
    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const policies = loadEscalations()
    const policy: EscalationPolicy = {
      id: body.id ?? randomUUID(),
      name: body.name,
      steps: body.steps ?? [],
    }
    const idx = policies.findIndex(p => p.id === policy.id)
    if (idx >= 0) policies[idx] = policy
    else policies.push(policy)
    saveEscalations(policies)
    return NextResponse.json(policy)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  saveEscalations(loadEscalations().filter(p => p.id !== id))
  return NextResponse.json({ ok: true })
}
