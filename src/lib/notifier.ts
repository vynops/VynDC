/**
 * notifier.ts — Slack webhook + SMTP email delivery
 * Uses settings from settings-store (slackWebhookUrl, smtpHost, etc.)
 */
import nodemailer from 'nodemailer'
import { getSettings } from './settings-store'

export async function sendSlack(text: string): Promise<void> {
  const { slackWebhookUrl } = getSettings()
  if (!slackWebhookUrl) return
  try {
    const res = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) console.error('[notifier] Slack webhook failed:', res.status, await res.text())
  } catch (e) {
    console.error('[notifier] Slack error:', e)
  }
}

export async function sendEmail(to: string[], subject: string, body: string): Promise<void> {
  const s = getSettings()
  if (!s.alertEmailEnabled || !s.smtpHost || to.length === 0) return
  try {
    const transporter = nodemailer.createTransport({
      host: s.smtpHost,
      port: s.smtpPort || 587,
      secure: s.smtpPort === 465,
      auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPassword } : undefined,
      tls: { rejectUnauthorized: false }, // allow self-signed for internal SMTP
    })
    await transporter.sendMail({
      from: s.smtpFrom || s.smtpUser,
      to: to.join(', '),
      subject,
      text: body,
      html: `<pre style="font-family:monospace;font-size:13px">${body.replace(/</g, '&lt;')}</pre>`,
    })
  } catch (e) {
    console.error('[notifier] Email error:', e)
  }
}
