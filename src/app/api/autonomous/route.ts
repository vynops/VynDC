import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getAutonomousConfig, saveAutonomousConfig } from '@/lib/autonomous-ops'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(getAutonomousConfig())
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    return NextResponse.json(saveAutonomousConfig(body))
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
