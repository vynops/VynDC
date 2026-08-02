import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import type { SessionPayload } from '@/lib/auth'
import { getPromptHistory } from '@/lib/copilot-history'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const session = auth as SessionPayload
  return NextResponse.json({
    entries: getPromptHistory(session.id),
  })
}
