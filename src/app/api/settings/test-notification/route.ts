import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

const TIMEOUT_MS = 10000

function buildPayload(channel: string, notificationTeam?: string) {
  const text = `[VynDC] ${channel} webhook test - configuration check`
  if (channel === 'customWebhookUrl') {
    return {
      source: 'vyndc',
      event: 'notification.test',
      team: notificationTeam || undefined,
      timestamp: new Date().toISOString(),
      text,
    }
  }
  return { text }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json() as { channel?: string; url?: string; notificationTeam?: string }
  const channel = body.channel?.trim() || ''
  const url = body.url?.trim() || ''

  if (!url) {
    return NextResponse.json({ ok: false, message: 'Webhook URL is empty.' }, { status: 400 })
  }

  if (!['slackWebhookUrl', 'teamsWebhookUrl', 'customWebhookUrl'].includes(channel)) {
    return NextResponse.json({ ok: false, message: 'Unsupported notification channel.' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(channel, body.notificationTeam?.trim())),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, message: `Webhook returned HTTP ${res.status}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true, message: 'Webhook test message sent successfully.' })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : 'Webhook test failed.' },
      { status: 502 }
    )
  }
}
