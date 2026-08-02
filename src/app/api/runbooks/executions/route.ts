import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadRunbookExecutions } from '@/lib/runbook-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const limitRaw = new URL(req.url).searchParams.get('limit')
  const limit = Math.max(1, Math.min(200, Number(limitRaw ?? 50) || 50))
  return NextResponse.json(loadRunbookExecutions().slice(0, limit))
}
