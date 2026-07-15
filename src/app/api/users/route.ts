import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { listUsers, createUser } from '@/lib/user-store'
import type { UserRole } from '@/lib/user-store'
import { writeAudit, getClientIp } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const users = listUsers().map(u => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
    createdAt: u.createdAt, lastLogin: u.lastLogin,
  }))
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  try {
    const { email, name, role, password } = await req.json() as {
      email: string; name: string; role: UserRole; password: string
    }
    if (!email || !name || !role || !password) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }
    const user = createUser({ email, name, role, password })
    const actor = typeof auth === 'object' && 'email' in auth ? (auth as { email: string }).email : 'unknown'
    writeAudit({ actor, action: 'user.create', detail: `Created user ${email} (${role})`, ip: getClientIp(req) })
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
