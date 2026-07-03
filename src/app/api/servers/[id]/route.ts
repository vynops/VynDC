import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedServers } from '@/lib/simulation'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const server = simulatedServers().find(s => s.id === id)
  if (!server) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(server)
}
