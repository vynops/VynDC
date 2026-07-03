import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getUsageToday, getUsageLast7Days } from '@/lib/copilot-usage'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({
    today: getUsageToday(),
    last7Days: getUsageLast7Days(),
  })
}
