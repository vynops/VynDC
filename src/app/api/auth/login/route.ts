import { NextRequest, NextResponse } from 'next/server'
import { findUserByEmail, verifyPassword, touchLastLogin, ensureAdminExists } from '@/lib/user-store'
import { createSession, sessionCookieName } from '@/lib/auth'
import { writeAudit, getClientIp } from '@/lib/audit'

// ── Rate limiting: 5 failures per 15 min per IP ───────────────────────────────
const RATE_LIMIT   = 5
const WINDOW_MS    = 15 * 60 * 1000
const attempts     = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(ip: string): { limited: boolean; retryAfterSec: number } {
  const now   = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 0, windowStart: now })
    return { limited: false, retryAfterSec: 0 }
  }
  if (entry.count >= RATE_LIMIT) {
    const retryAfterSec = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)
    return { limited: true, retryAfterSec }
  }
  return { limited: false, retryAfterSec: 0 }
}

function recordFailure(ip: string) {
  const entry = attempts.get(ip)
  if (entry) entry.count++
}

function clearAttempts(ip: string) {
  attempts.delete(ip)
}
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  ensureAdminExists()
  const ip = getClientIp(req)

  const { limited, retryAfterSec } = checkRateLimit(ip)
  if (limited) {
    writeAudit({ actor: 'anonymous', action: 'login.rate_limited', detail: 'Too many failed attempts', ip })
    const res = NextResponse.json(
      { error: `Too many login attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).` },
      { status: 429 }
    )
    res.headers.set('Retry-After', String(retryAfterSec))
    return res
  }

  try {
    const { email, password } = await req.json() as { email: string; password: string }
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const user = findUserByEmail(email)
    if (!user) {
      recordFailure(ip)
      writeAudit({ actor: email, action: 'login.fail', detail: 'User not found', ip })
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    if (!user.active) {
      recordFailure(ip)
      writeAudit({ actor: email, action: 'login.fail', detail: 'Account deactivated', ip })
      return NextResponse.json({ error: 'This account has been deactivated' }, { status: 403 })
    }
    const valid = verifyPassword(password, user.passwordHash, user.passwordSalt)
    if (!valid) {
      recordFailure(ip)
      writeAudit({ actor: email, action: 'login.fail', detail: 'Wrong password', ip })
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    clearAttempts(ip)
    touchLastLogin(user.id)
    const token = await createSession({ id: user.id, email: user.email, name: user.name, role: user.role })
    writeAudit({ actor: user.email, action: 'login.success', detail: `Signed in as ${user.role}`, ip })
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
