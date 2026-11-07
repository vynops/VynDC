import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getClientIp } from '@/lib/audit'
import { readNotificationJobs, retryNotification } from '@/lib/notification-queue'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  try {
    const jobs = readNotificationJobs()
    const counts = { pending: 0, processing: 0, delivered: 0, failed: 0, skipped: 0 }
    for (const job of jobs) counts[job.status]++
    return NextResponse.json({
      counts,
      jobs: jobs.slice(-100).reverse().map(job => ({
        id: job.id, incidentId: job.incidentId, episodeId: job.episodeId, event: job.event,
        channel: job.channel, status: job.status, attempts: job.attempts,
        createdAt: job.createdAt, nextAttemptAt: job.nextAttemptAt,
        completedAt: job.completedAt, lastError: job.lastError,
      })),
    })
  } catch { return NextResponse.json({ error: 'Notification history unavailable' }, { status: 503 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const id = body && typeof body === 'object' && 'id' in body ? body.id : undefined
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
  try {
    if (!retryNotification(id, auth.email, getClientIp(req))) return NextResponse.json({ error: 'Only failed channel deliveries can be retried' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Unable to schedule retry' }, { status: 503 }) }
}