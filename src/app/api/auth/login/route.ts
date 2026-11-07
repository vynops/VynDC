import { NextRequest, NextResponse } from 'next/server'
import { findUserByEmail, verifyPassword, touchLastLogin, ensureAdminExists } from '@/lib/user-store'
import { createSession, sessionCookieName } from '@/lib/auth'
import { writeAudit, getClientIp } from '@/lib/audit'

// Repeated failures slow down gradually, without blocking valid sign-ins.
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURE_DELAY_MS = 2000
const attempts = new Map<string, { count: number; windowStart: number }>()

function recordFailure(ip: string) {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now - entry.windowStart > FAILURE_WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now })
  } else {
    entry.count++
  }
}

async function delayFailedResponse(ip: string) {
  const entry = attempts.get(ip)
  if (!entry) return
  if (Date.now() - entry.windowStart > FAILURE_WINDOW_MS) {
    attempts.delete(ip)
    return
  }
  const delayMs = Math.min(MAX_FAILURE_DELAY_MS, Math.max(0, entry.count - 1) * 250)
  if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
}

function clearAttempts(ip: string) {
  attempts.delete(ip)
}
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  ensureAdminExists()
  const ip = getClientIp(req)

  try {
    const { email, password } = await req.json() as { email: string; password: string }
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const user = findUserByEmail(email)
    if (!user) {
      recordFailure(ip)
      await delayFailedResponse(ip)
      writeAudit({ actor: email, action: 'login.fail', detail: 'User not found', ip })
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    if (!user.active) {
      recordFailure(ip)
      await delayFailedResponse(ip)
      writeAudit({ actor: email, action: 'login.fail', detail: 'Account deactivated', ip })
      return NextResponse.json({ error: 'This account has been deactivated' }, { status: 403 })
    }
    const valid = verifyPassword(password, user.passwordHash, user.passwordSalt)
    if (!valid) {
      recordFailure(ip)
      await delayFailedResponse(ip)
      writeAudit({ actor: email, action: 'login.fail', detail: 'Wrong password', ip })
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    clearAttempts(ip)
    touchLastLogin(user.id)
    const token = await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword === true,
    })
    writeAudit({ actor: user.email, action: 'login.success', detail: `Signed in as ${user.role}`, ip })
    const res = NextResponse.json({
      ok: true,
      role: user.role,
      name: user.name,
      mustChangePassword: user.mustChangePassword === true,
    })
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
