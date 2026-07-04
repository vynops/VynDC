import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSettings } from '@/lib/settings-store'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const s = getSettings()
  const { to, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom } =
    await req.json() as {
      to?: string
      smtpHost?: string; smtpPort?: number; smtpUser?: string
      smtpPassword?: string; smtpFrom?: string
    }

  // Use values from the request body (current form) first, fall back to saved settings
  const host     = smtpHost?.trim()     || s.smtpHost
  const port     = smtpPort             ?? s.smtpPort  ?? 587
  const user     = smtpUser?.trim()     || s.smtpUser
  const password = smtpPassword?.trim() || s.smtpPassword
  const from     = smtpFrom?.trim()     || s.smtpFrom  || user

  if (!host) {
    return NextResponse.json({ error: 'SMTP host is not configured. Fill in the SMTP section and save first.' }, { status: 400 })
  }

  const recipient = to?.trim() || s.alertRecipients?.split(',')[0]?.trim() || user
  if (!recipient) {
    return NextResponse.json({ error: 'No recipient address. Enter one below or set Default Recipients in Alerting.' }, { status: 400 })
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: password } : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    })

    // Verify SMTP connection first
    await transporter.verify()

    await transporter.sendMail({
      from: from,
      to: recipient,
      subject: '[VynDC] Test Email — SMTP configuration check',
      text: [
        'This is a test email from VynDC.',
        '',
        'Your SMTP configuration is working correctly.',
        '',
        `Sent from: ${from}`,
        `SMTP Host: ${host}:${port}`,
      ].join('\n'),
      html: `
        <div style="font-family:sans-serif;max-width:480px;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
          <h2 style="color:#f97316;margin:0 0 12px">VynDC — Test Email ✅</h2>
          <p style="margin:0 0 8px">Your SMTP configuration is working correctly.</p>
          <hr style="border:none;border-top:1px solid #334155;margin:16px 0"/>
          <div style="font-size:12px;color:#94a3b8">
            <div>From: <code>${from}</code></div>
            <div>SMTP: <code>${host}:${port}</code></div>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ ok: true, to: recipient })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
