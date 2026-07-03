import { NextRequest, NextResponse } from 'next/server'
import { findUserByEmail, verifyPassword, touchLastLogin, ensureAdminExists } from '@/lib/user-store'
import { createSession, sessionCookieName } from '@/lib/auth'

export async function POST(req: NextRequest) {
  ensureAdminExists()
  try {
    const { email, password } = await req.json() as { email: string; password: string }
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const user = findUserByEmail(email)
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const valid = verifyPassword(password, user.passwordHash, user.passwordSalt)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    touchLastLogin(user.id)
    const token = await createSession({ id: user.id, email: user.email, name: user.name, role: user.role })
    const res = NextResponse.json({ ok: true, role: user.role, name: user.name })
    res.cookies.set(sessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
