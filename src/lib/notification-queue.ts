import path from 'path'
import { createHash, randomUUID } from 'node:crypto'
import { getSettings } from './settings-store'
import { sendSlack, sendTeams, sendCustomWebhook, sendEmail } from './notifier'
import { writeAuditSync } from './audit'
import { readJson, writeJson, withStoreLock } from './json-store'
import { episodeId, type StoredIncident } from './incident-store'

type Channel = 'slack' | 'teams' | 'custom' | 'email' | 'none'
export interface NotificationJob {
  id: string
  incidentId: string
  episodeId: string
  event: string
  channel: Channel
  text: string
  subject: string
  recipients: string[]
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'skipped'
  attempts: number
  createdAt: string
  nextAttemptAt: number
  leaseUntil?: number
  claimToken?: string
  completedAt?: string
  lastError?: string
}
export interface NotificationOptions {
  includeSlack?: boolean
  recipients?: string[]
  subject?: string
  simulation?: boolean
}
const queueFile = path.join(process.cwd(), 'data', 'notification-queue.json')
const MAX_ATTEMPTS = 6

export function readNotificationJobs(): NotificationJob[] {
  return readJson(queueFile, [])
}

export function enqueueNotification(incident: StoredIncident, event: string, text: string, options: NotificationOptions = {}): void {
  const settings = getSettings()
  const channels: Channel[] = []
  if (options.includeSlack !== false) channels.push('slack')
  if (settings.teamsWebhookUrl) channels.push('teams')
  if (settings.customWebhookUrl) channels.push('custom')
  if (settings.alertEmailEnabled) channels.push('email')
  if (!channels.length) channels.push('none')
  const recipients = [...new Set((options.recipients ?? []).map(email => email.trim().toLowerCase()).filter(Boolean))].sort()
  withStoreLock('notification-queue', () => {
    const jobs = readNotificationJobs()
    for (const channel of channels) {
      const identity = JSON.stringify([episodeId(incident), event, channel, channel === 'email' ? recipients : []])
      const id = createHash('sha256').update(identity).digest('hex')
      if (jobs.some(job => job.id === id)) continue
      jobs.push({
        id, incidentId: incident.id, episodeId: episodeId(incident), event, channel, text,
        subject: options.subject ?? `[VynDC] ${incident.title}`, recipients,
        status: options.simulation ? 'skipped' : channel === 'none' ? 'failed' : 'pending',
        attempts: 0, createdAt: new Date().toISOString(), nextAttemptAt: Date.now(),
        lastError: options.simulation ? 'Simulation notification suppressed' : channel === 'none' ? 'No notification channel enabled' : undefined,
      })
    }
    writeJson(queueFile, jobs)
  })
}

async function deliver(job: NotificationJob): Promise<void> {
  const settings = getSettings()
  if (job.channel === 'slack' && settings.slackWebhookUrl) return sendSlack(job.text)
  if (job.channel === 'teams' && settings.teamsWebhookUrl) return sendTeams(job.text)
  if (job.channel === 'custom' && settings.customWebhookUrl) return sendCustomWebhook(job.text)
  if (job.channel === 'email' && settings.alertEmailEnabled && settings.smtpHost) {
    const recipients = job.recipients.length ? job.recipients : (settings.alertRecipients ?? '').split(',').map(value => value.trim()).filter(Boolean)
    if (recipients.length) return sendEmail(recipients, job.subject, job.text.replace(/[*`]/g, ''))
  }
  throw new Error(`${job.channel} channel is not configured for delivery`)
}

export async function processNotificationQueue(
  decision: (job: NotificationJob) => 'deliver' | 'skip' | 'defer' = () => 'deliver',
  now = Date.now(),
): Promise<void> {
  const processOne = async (): Promise<boolean> => {
    const claimed = withStoreLock('notification-queue', () => {
      const jobs = readNotificationJobs()
      const job = jobs.find(entry => (entry.status === 'pending' && entry.nextAttemptAt <= now)
        || (entry.status === 'processing' && (entry.leaseUntil ?? 0) <= now))
      if (!job) return undefined
      const action = decision(job)
      if (action === 'defer') {
        job.status = 'pending'
        job.nextAttemptAt = now + 30_000
      } else if (action === 'skip' || job.attempts >= MAX_ATTEMPTS) {
        job.status = action === 'skip' ? 'skipped' : 'failed'
        job.completedAt = new Date(now).toISOString()
        job.lastError = action === 'skip' ? 'Incident no longer eligible for notification' : 'Delivery attempts exhausted'
        writeAuditSync({ actor: 'system', action: 'notification.' + job.status, detail: `${job.channel}: ${job.event}`, ip: 'system', incidentId: job.incidentId, episodeId: job.episodeId, outcome: job.status === 'skipped' ? 'skipped' : 'failed', after: { jobId: job.id, attempts: job.attempts } })
      } else {
        job.status = 'processing'
        job.attempts++
        job.leaseUntil = Math.max(now, Date.now()) + 60_000
        job.claimToken = randomUUID()
      }
      writeJson(queueFile, jobs)
      return action === 'deliver' && job.status === 'processing' ? { ...job } : null
    })
    if (claimed === undefined) return false
    if (claimed === null) return true
    let error: string | undefined
    writeAuditSync({ actor: 'system', action: 'notification.attempt', detail: `${claimed.channel}: ${claimed.event}`, ip: 'system', incidentId: claimed.incidentId, episodeId: claimed.episodeId, outcome: 'requested', after: { jobId: claimed.id, attempts: claimed.attempts } })
    try { await deliver(claimed) } catch { error = `${claimed.channel} delivery attempt failed` }
    withStoreLock('notification-queue', () => {
      const jobs = readNotificationJobs()
      const job = jobs.find(entry => entry.id === claimed.id)
      if (!job || job.claimToken !== claimed.claimToken || job.status !== 'processing') return
      const succeeded = error === undefined
      writeAuditSync({ actor: 'system', action: succeeded ? 'notification.delivered' : 'notification.failed', detail: `${job.channel}: ${job.event}`, ip: 'system', incidentId: job.incidentId, episodeId: job.episodeId, outcome: succeeded ? 'succeeded' : 'failed', after: { jobId: job.id, attempts: job.attempts } })
      job.status = succeeded ? 'delivered' : job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
      job.lastError = error
      job.nextAttemptAt = now + Math.min(15 * 60_000, 30_000 * 2 ** (job.attempts - 1))
      job.completedAt = job.status === 'pending' ? undefined : new Date().toISOString()
      delete job.claimToken
      delete job.leaseUntil
      writeJson(queueFile, jobs)
    })
    return true
  }
  for (let batch = 0; batch < 5; batch++) {
    const results = await Promise.all(Array.from({ length: 4 }, () => processOne()))
    if (results.every(result => !result)) break
  }
}

export function retryNotification(id: string, actor: string, ip: string): boolean {
  return withStoreLock('notification-queue', () => {
    const jobs = readNotificationJobs()
    const job = jobs.find(entry => entry.id === id)
    if (!job || job.status !== 'failed' || job.channel === 'none') return false
    const audit = { actor, ip, action: 'notification.retry', detail: `${job.channel}: ${job.event}`, incidentId: job.incidentId, episodeId: job.episodeId, before: { jobId: id, status: job.status, attempts: job.attempts }, after: { status: 'pending', attempts: 0 } }
    writeAuditSync({ ...audit, outcome: 'requested' })
    job.status = 'pending'
    job.attempts = 0
    job.nextAttemptAt = Date.now()
    delete job.lastError
    delete job.completedAt
    delete job.claimToken
    delete job.leaseUntil
    writeJson(queueFile, jobs)
    writeAuditSync({ ...audit, outcome: 'succeeded' })
    return true
  })
}