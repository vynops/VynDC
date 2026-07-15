import { NextRequest, NextResponse } from 'next/server'
import { sessionCookieName, verifySession } from '@/lib/auth'
import { writeAudit, getClientIp } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(sessionCookieName())?.value
  const session = token ? await verifySession(token) : null
  writeAudit({
    actor: session?.email ?? 'unknown',
    action: 'logout',
    detail: session ? `${session.name} signed out` : 'Session ended',
    ip: getClientIp(req),
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
