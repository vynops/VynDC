import { NextRequest, NextResponse } from 'next/server'
import { createSession, getSessionFromRequest, sessionCookieName } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import { findUserById, updateUser, verifyPassword } from '@/lib/user-store'

const MIN_PASSWORD_LENGTH = 12

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session?.mustChangePassword) {
    return NextResponse.json({ error: 'A required password change is not pending.' }, { status: 403 })
  }

  const user = findUserById(session.id)
  if (!user || user.active === false || user.mustChangePassword !== true) {
    return NextResponse.json({ error: 'Account is unavailable or password change is no longer required.' }, { status: 403 })
  }

  try {
    const body = await req.json() as { currentPassword?: string; newPassword?: string; confirmPassword?: string }
    const { currentPassword, newPassword, confirmPassword } = body
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: 'All password fields are required.' }, { status: 400 })
    }
    if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 })
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'New passwords do not match.' }, { status: 400 })
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: 'Choose a password different from the temporary password.' }, { status: 400 })
    }

    const updated = updateUser(user.id, { password: newPassword, mustChangePassword: false })
    const token = await createSession({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
    })
    writeAudit({ actor: updated.email, action: 'user.password_change', detail: 'Changed initial password', ip: getClientIp(req) })

    const response = NextResponse.json({ ok: true })
    response.cookies.set(sessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Unable to change password.' }, { status: 400 })
  }
}