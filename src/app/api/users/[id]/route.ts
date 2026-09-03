import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { updateUser, deleteUser, listUsers } from '@/lib/user-store'
import type { UserRole } from '@/lib/user-store'
import { writeAudit, getClientIp } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  try {
    const body = await req.json() as { name?: string; role?: UserRole; password?: string; active?: boolean }
    const user = updateUser(id, body)
    const actor = typeof auth === 'object' && 'email' in auth ? (auth as { email: string }).email : 'unknown'
    const changes = Object.keys(body).filter(k => k !== 'password').join(', ') || 'password'
    writeAudit({ actor, action: 'user.update', detail: `Updated ${user.email}: ${changes}`, ip: getClientIp(req) })
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role, active: user.active !== false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  try {
    const target = listUsers().find(u => u.id === id)
    deleteUser(id)
    const actor = typeof auth === 'object' && 'email' in auth ? (auth as { email: string }).email : 'unknown'
    writeAudit({ actor, action: 'user.delete', detail: `Deleted user ${target?.email ?? id}`, ip: getClientIp(req) })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
