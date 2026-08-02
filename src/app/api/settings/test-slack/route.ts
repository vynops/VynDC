import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json() as { webhookUrl?: string; text?: string }
  const webhookUrl = body.webhookUrl?.trim()

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Slack Webhook URL is empty.' }, { status: 400 })
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: body.text?.trim() || '[VynDC] Slack webhook test — configuration check',
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Slack webhook returned HTTP ${res.status}` }, { status: 502 })
    }

    return NextResponse.json({ message: 'Slack webhook test message sent successfully.' })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Slack webhook test failed.' }, { status: 502 })
  }
}

