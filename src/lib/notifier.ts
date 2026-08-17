/**
 * notifier.ts — webhook + SMTP email delivery
 * Uses settings from settings-store (Slack/Teams/custom webhooks, SMTP, etc.)
 */
import nodemailer from 'nodemailer'
import { getSettings } from './settings-store'

interface WebhookDispatchOptions {
  includeSlack?: boolean
  includeTeams?: boolean
  includeCustom?: boolean
}

async function postWebhook(url: string, payload: unknown, label: string): Promise<void> {
  if (!url) return
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) console.error(`[notifier] ${label} webhook failed:`, res.status, await res.text())
  } catch (e) {
    console.error(`[notifier] ${label} webhook error:`, e)
  }
}

export async function sendSlack(text: string): Promise<void> {
  const { slackWebhookUrl } = getSettings()
  await postWebhook(slackWebhookUrl, { text }, 'Slack')
}

export async function sendTeams(text: string): Promise<void> {
  const { teamsWebhookUrl } = getSettings()
  await postWebhook(teamsWebhookUrl, { text }, 'Teams')
}

export async function sendCustomWebhook(text: string): Promise<void> {
  const { customWebhookUrl, notificationTeam } = getSettings()
  await postWebhook(
    customWebhookUrl,
    {
      source: 'vyndc',
      team: notificationTeam || undefined,
      timestamp: new Date().toISOString(),
      text,
    },
    'Custom'
  )
}

export async function sendWebhookNotifications(text: string, options: WebhookDispatchOptions = {}): Promise<void> {
  const {
    includeSlack = true,
    includeTeams = true,
    includeCustom = true,
  } = options

  const jobs: Array<Promise<void>> = []
  if (includeSlack) jobs.push(sendSlack(text))
  if (includeTeams) jobs.push(sendTeams(text))
  if (includeCustom) jobs.push(sendCustomWebhook(text))

  await Promise.all(jobs)
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
