import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '200', 10))
  return NextResponse.json(readAudit(limit))
}
