import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadRouting, saveRouting, type RoutingRule } from '@/lib/oncall-store'
import { randomUUID } from 'crypto'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadRouting())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json() as Partial<RoutingRule>
    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const rules = loadRouting()
    const rule: RoutingRule = {
      id: body.id ?? randomUUID(),
      name: body.name,
      severity: body.severity ?? '*',
      category: body.category ?? '*',
      notifyEmails: body.notifyEmails ?? [],
      notifySlack: body.notifySlack ?? true,
      notifyOncall: body.notifyOncall ?? true,
      escalationPolicyId: body.escalationPolicyId ?? 'default',
    }
    const idx = rules.findIndex(r => r.id === rule.id)
    if (idx >= 0) rules[idx] = rule
    else rules.push(rule)
    saveRouting(rules)
    return NextResponse.json(rule)
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
  const rules = loadRouting().filter(r => r.id !== id)
  saveRouting(rules)
  return NextResponse.json({ ok: true })
}
