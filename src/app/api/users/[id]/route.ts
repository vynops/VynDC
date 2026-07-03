import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { updateUser, deleteUser } from '@/lib/user-store'
import type { UserRole } from '@/lib/user-store'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  try {
    const body = await req.json() as { name?: string; role?: UserRole; password?: string }
    const user = updateUser(id, body)
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role })
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
    deleteUser(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
