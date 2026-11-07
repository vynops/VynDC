import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import crypto from 'node:crypto'
import os from 'node:os'
import type { NotificationJob, NotificationOptions } from '../src/lib/notification-queue.ts'

function loadModule<Exports>(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): Exports {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, process: { cwd: () => '/verification', env: {}, pid: 1 }, Date, Set, AbortSignal, console: { error: () => {} },
    require: (name: string) => {
      if (name === 'node:crypto') return crypto
      const alias = name.startsWith('@/lib/') ? name.replace('@/lib/', './') : name.startsWith('./') ? name.replace('./', '@/lib/') : name
      if (name in dependencies || alias in dependencies) return dependencies[name] ?? dependencies[alias]
      const target = name.startsWith('@/') ? path.join('src', name.slice(2)) : name.startsWith('.') ? path.join(path.dirname(file), name) : ''
      assert.ok(target && fs.existsSync(`${target}.ts`), `Unmocked dependency: ${name}`)
      return loadModule(`${target}.ts`, dependencies, globals)
    },
    ...globals,
  }, { filename: file })
  return exports as Exports
}

function harness() {
  let clock = Date.now()
  class ClockDate extends Date {
    constructor(value?: string | number) { super(value ?? clock) }
    static now() { return clock }
  }
  const files = new Map<string, string>()
  const descriptors = new Map<number, string>()
  const fakeFs = {
    existsSync: (file: string) => files.has(file),
    mkdirSync: () => {},
    readFileSync: (file: string) => files.get(file),
    writeFileSync: (file: string | number, value: string) => { files.set(typeof file === 'number' ? descriptors.get(file)! : file, value) },
    appendFileSync: (file: string | number, value: string) => {
      const target = typeof file === 'number' ? descriptors.get(file)! : file
      files.set(target, (files.get(target) ?? '') + value)
    },
    renameSync: (source: string, target: string) => { files.set(target, files.get(source)!); files.delete(source) },
    unlinkSync: (file: string) => { files.delete(file) },
    openSync: (file: string, flags: string) => {
      if (flags === 'wx' && files.has(file)) throw Object.assign(new Error('Locked'), { code: 'EEXIST' })
      if (!files.has(file)) files.set(file, '')
      const descriptor = descriptors.size + 1
      descriptors.set(descriptor, file)
      return descriptor
    },
    closeSync: () => {},
    fsyncSync: () => {},
  }
  const notifications: string[] = []
  const emails: string[][] = []
  const audit: Record<string, unknown>[] = []
  let seen: Record<string, Record<string, unknown>> = {}
  let maintenance = false
  let paused = false
  let sourceFailed = false
  let configured = false
  let alerts: Record<string, unknown>[] = []
  let role = 'editor'
  const incident = {
    id: 'verification-incident', title: 'Verification incident', severity: 'critical',
    category: 'hardware', status: 'open', createdAt: new Date().toISOString(),
  }
  const notifier = {
    sendSlack: async (message: string) => { notifications.push(message) },
    sendWebhookNotifications: async (message: string) => { notifications.push(message) },
    sendEmail: async (recipients: string[]) => { emails.push(recipients) },
  }
  const queueMock = {
    enqueueNotification: (_incident: unknown, _event: string, message: string, options: { recipients?: string[] }) => {
      notifications.push(message)
      if (options.recipients?.length) emails.push(options.recipients)
    },
  }
  const routingMock = {
    matchRouting: () => ({ notifyEmails: ['route@example.test'], notifySlack: true, notifyOncall: true, escalationPolicyId: 'test' }),
    currentOnCallEmails: () => ['oncall@example.test'],
  }
  const dispatcher = loadModule<{ dispatchAlerts: (incidents: typeof incident[]) => void }>('src/lib/alert-dispatcher.ts', {
    fs: fakeFs, path, './notifier': notifier,
    './notification-queue': queueMock,
    './audit': { writeAuditSync: (entry: Record<string, unknown>) => audit.push(entry) },
    './settings-store': { getSettings: () => ({ alertRecipients: 'default@example.test' }) },
    './maintenance-store': { isUnderMaintenance: () => maintenance, isSlapaused: () => paused },
    './oncall-store': {
      loadSeenAlerts: () => seen, saveSeenAlerts: (value: typeof seen) => { seen = value },
      loadSla: () => ({ critical: { ackMinutes: 1, resolveMinutes: 2 } }),
      ...routingMock,
      findPolicy: () => ({ steps: [{ delayMin: 1, notifyEmails: [], notifyOncall: true, notifySlack: true }] }),
    },
  }, { Date: ClockDate })
  class Response {
    status: number
    body: unknown
    constructor(body: unknown, status = 200) { this.body = body; this.status = status }
    static json(body: unknown, options?: { status: number }) { return new Response(body, options?.status) }
  }
  const route = loadModule<{ GET: (req: unknown) => Promise<Response>; PATCH: (req: unknown) => Promise<Response> }>('src/app/api/incidents/route.ts', {
    fs: fakeFs, path, 'next/server': { NextResponse: Response },
    '@/lib/auth': {
      requireRole: async (_req: unknown, required: string) => role === 'none'
        ? Response.json({}, { status: 401 })
        : required === 'editor' && role === 'viewer'
          ? Response.json({}, { status: 403 }) : { email: 'operator@example.test' },
      hasRole: () => true,
    },
    '@/lib/simulation': { simulatedIncidents: () => [incident] },
    '@/lib/prometheus': {
      isAlertmanagerConfigured: () => configured,
      alertmanagerAlerts: async () => {
        if (sourceFailed) throw new Error('Verification source outage')
        return alerts
      },
    },
    '@/lib/alert-dispatcher': dispatcher,
    '@/lib/notification-queue': queueMock,
    '@/lib/oncall-store': routingMock,
    '@/lib/settings-store': { getSettings: () => ({ alertRecipients: 'default@example.test' }) },
    '@/lib/notifier': notifier,
    '@/lib/audit': { writeAudit: (entry: Record<string, unknown>) => audit.push(entry), writeAuditSync: (entry: Record<string, unknown>) => audit.push(entry), getClientIp: () => 'verification' },
  }, { Date: ClockDate })
  return {
    files, fakeFs, responseClass: Response, notifications, emails, audit, incident, dispatcher, route,
    advance: (milliseconds: number) => { clock += milliseconds },
    seen: () => seen,
    unlock: () => files.delete(path.join('/verification', 'data', 'dispatch-lock.json')),
    setMaintenance: (value: boolean) => { maintenance = value },
    setPaused: (value: boolean) => { paused = value },
    setRole: (value: string) => { role = value },
    setSourceFailed: (value: boolean) => { sourceFailed = value; configured = true },
    setAlerts: (value: typeof alerts) => { alerts = value; configured = true },
    patch: (body: unknown) => route.PATCH({ json: async () => body }),
  }
}

test('fresh incident routes notification and deduplicates recipients', async () => {
  const ctx = harness()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(ctx.notifications.length, 1)
  assert.deepEqual([...ctx.emails[0]], ['route@example.test', 'oncall@example.test', 'default@example.test'])
})

test('cooldown and seen state prevent duplicate initial notifications', () => {
  const ctx = harness()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  assert.equal(ctx.notifications.length, 1)
})

test('maintenance suppresses notifications', () => {
  const ctx = harness()
  ctx.setMaintenance(true)
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  assert.equal(ctx.notifications.length, 0)
})

test('SLA breaches fire once and escalation is capped', () => {
  const ctx = harness()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.advance(3 * 60_000)
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  assert.equal(ctx.notifications.length, 4)
  assert.equal(ctx.seen()[ctx.incident.id].escalationStep, 1)
})

test('acknowledgement suppresses ack breach and pause suppresses SLA breaches', () => {
  const ctx = harness()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.advance(3 * 60_000)
  ctx.setPaused(true)
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([{ ...ctx.incident, status: 'acknowledged' }])
  assert.equal(ctx.notifications.filter(message => message.includes('SLA')).length, 0)
})

test('previously seen resolved incident is archived and removed from seen state', () => {
  const ctx = harness()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([{ ...ctx.incident, status: 'resolved' }])
  const history = JSON.parse(ctx.files.get(path.join('/verification', 'data', 'incident-history.json'))!)
  assert.equal(history[0].id, ctx.incident.id)
  assert.equal(history[0].status, 'resolved')
  assert.ok(history[0].resolvedAt)
  assert.equal(ctx.seen()[ctx.incident.id], undefined)
})

test('incident mutation enforces editor access and rejects invalid status', async () => {
  const ctx = harness()
  ctx.setRole('none')
  assert.equal((await ctx.patch({ id: ctx.incident.id, status: 'resolved' })).status, 401)
  ctx.setRole('viewer')
  assert.equal((await ctx.patch({ id: ctx.incident.id, status: 'resolved' })).status, 403)
  assert.equal(ctx.files.size, 0)
  ctx.setRole('editor')
  assert.equal((await ctx.patch({ id: ctx.incident.id, status: 'invalid' })).status, 400)
})

test('acknowledge, assign, resolve and reopen persist state and request an audit entry', async () => {
  const ctx = harness()
  for (const body of [
    { status: 'acknowledged', notes: 'Investigating' },
    { assignTo: 'responder@example.test' },
    { status: 'resolved', notes: 'Recovered' },
    { status: 'open' },
  ]) assert.equal((await ctx.patch({ id: ctx.incident.id, ...body })).status, 200)
  assert.deepEqual(ctx.audit.filter(entry => entry.outcome === 'succeeded').map(entry => entry.action), ['incident.acknowledge', 'incident.assign', 'incident.resolve', 'incident.update'])
  assert.ok(ctx.audit.every(entry => entry.actor === 'operator@example.test'))
  const overrides = JSON.parse(ctx.files.get(path.join('/verification', 'data', 'incidents.json'))!)
  assert.equal(overrides[ctx.incident.id].status, 'open')
  assert.equal(overrides[ctx.incident.id].resolvedAt, undefined)
})

test('resolution is archived immediately without a later GET', async () => {
  const ctx = harness()
  await ctx.patch({ id: ctx.incident.id, status: 'resolved' })
  assert.ok(ctx.files.has(path.join('/verification', 'data', 'incident-history.json')))
})

test('incident absent from two successful reads is archived', () => {
  const ctx = harness()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([])
  assert.ok(ctx.seen()[ctx.incident.id])
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([])
  assert.equal(ctx.seen()[ctx.incident.id], undefined)
  assert.ok(ctx.files.has(path.join('/verification', 'data', 'incident-history.json')))
})

test('unknown incident mutation is rejected', async () => {
  const ctx = harness()
  assert.equal((await ctx.patch({ id: 'nonexistent', status: 'resolved' })).status, 404)
})

test('live GET preserves incident response fields and dispatches a fresh alert', async () => {
  const ctx = harness()
  ctx.setAlerts([{
    fingerprint: ctx.incident.id, startsAt: ctx.incident.createdAt,
    annotations: { summary: ctx.incident.title }, labels: { severity: 'critical' },
    status: { state: 'active' },
  }])
  const response = await ctx.route.GET({})
  assert.equal(response.status, 200)
  const incidents = response.body as Record<string, unknown>[]
  assert.equal(incidents[0].id, ctx.incident.id)
  assert.equal(incidents[0].status, 'open')
  assert.equal(incidents[0].severity, 'critical')
  assert.equal(ctx.notifications.length, 1)
})

test('source outage retains simulation fallback without dispatching simulated alerts', async () => {
  const ctx = harness()
  ctx.setSourceFailed(true)
  const response = await ctx.route.GET({})
  assert.equal(response.status, 200)
  assert.equal((response.body as Record<string, unknown>[])[0].id, ctx.incident.id)
  assert.equal(ctx.notifications.length, 0)
})

test('a new alert episode does not inherit a previous resolution', async () => {
  const ctx = harness()
  await ctx.patch({ id: ctx.incident.id, status: 'resolved' })
  ctx.setAlerts([{
    fingerprint: ctx.incident.id, startsAt: new Date(Date.now() + 60_000).toISOString(),
    annotations: { summary: ctx.incident.title }, labels: { severity: 'critical' },
    status: { state: 'active' },
  }])
  const response = await ctx.route.GET({})
  assert.equal((response.body as Record<string, unknown>[])[0].status, 'open')
})

test('webhook failure is observable to the dispatcher', async () => {
  const notifier = loadModule<{ sendSlack: (text: string) => Promise<void> }>('src/lib/notifier.ts', {
    nodemailer: {}, './settings-store': { getSettings: () => ({ slackWebhookUrl: 'https://example.test/mock' }) },
  }, { fetch: async () => ({ ok: false, status: 503, text: async () => 'Unavailable' }) })
  await assert.rejects(notifier.sendSlack('Verification'))
})

test('audit writer persists timestamped JSON after its deferred write', async () => {
  const ctx = harness()
  const audit = loadModule<{ writeAudit: (entry: Record<string, string>) => void; readAudit: () => Record<string, string>[] }>('src/lib/audit.ts', {
    fs: ctx.fakeFs,
    path, 'next/server': {},
  }, { setImmediate })
  audit.writeAudit({ actor: 'operator@example.test', action: 'incident.resolve', detail: 'Verification', ip: 'verification' })
  await new Promise<void>(resolve => setImmediate(resolve))
  const entries = audit.readAudit()
  assert.equal(entries[0].action, 'incident.resolve')
  assert.ok(Number.isFinite(Date.parse(entries[0].ts)))
})

function queueHarness(settings: Record<string, unknown> = {}) {
  const ctx = harness()
  const calls: string[] = []
  const outcomes: Record<string, unknown>[] = []
  let failing = false
  let hold: Promise<void> | undefined
  const queue = loadModule<{
    enqueueNotification: (incident: typeof ctx.incident, event: string, text: string, options?: NotificationOptions) => void
    readNotificationJobs: () => NotificationJob[]
    retryNotification: (id: string, actor: string, ip: string) => boolean
    processNotificationQueue: (decision?: (job: NotificationJob) => 'deliver' | 'skip' | 'defer', now?: number) => Promise<void>
  }>('src/lib/notification-queue.ts', {
    fs: ctx.fakeFs, path,
    './settings-store': { getSettings: () => ({ slackWebhookUrl: 'https://example.test/mock', ...settings }) },
    './audit': { writeAuditSync: (entry: Record<string, unknown>) => outcomes.push(entry) },
    './notifier': {
      sendSlack: async () => { calls.push('slack'); if (hold) await hold; if (failing) throw new Error('Unavailable') },
      sendTeams: async () => { calls.push('teams') },
      sendCustomWebhook: async () => { calls.push('custom') },
      sendEmail: async () => { calls.push('email') },
    },
  })
  return { ...ctx, queue, calls, outcomes, setFailing: (value: boolean) => { failing = value }, setHold: (value: Promise<void>) => { hold = value } }
}

test('notification queue persists jobs and deduplicates the same episode event', async () => {
  const ctx = queueHarness()
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  assert.equal(ctx.queue.readNotificationJobs().length, 1)
  assert.equal(ctx.calls.length, 0)
  await ctx.queue.processNotificationQueue()
  await ctx.queue.processNotificationQueue()
  assert.deepEqual(ctx.calls, ['slack'])
  assert.equal(ctx.queue.readNotificationJobs()[0].status, 'delivered')
  assert.ok(ctx.outcomes.some(entry => entry.action === 'notification.delivered'))
})

test('notification queue retries failures without repeating successful channels', async () => {
  const ctx = queueHarness({ teamsWebhookUrl: 'https://example.test/teams' })
  ctx.setFailing(true)
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  const now = Date.now()
  await ctx.queue.processNotificationQueue(undefined, now)
  const jobs = ctx.queue.readNotificationJobs()
  assert.equal(jobs.find(job => job.channel === 'teams')?.status, 'delivered')
  assert.equal(jobs.find(job => job.channel === 'slack')?.status, 'pending')
  assert.ok(jobs.find(job => job.channel === 'slack')!.nextAttemptAt > now)
  ctx.setFailing(false)
  await ctx.queue.processNotificationQueue(undefined, now + 60_000)
  assert.deepEqual(ctx.calls, ['slack', 'teams', 'slack'])
  assert.ok(ctx.queue.readNotificationJobs().every(job => job.status === 'delivered'))
})

test('notification queue stops after bounded retries and retains failure evidence', async () => {
  const ctx = queueHarness()
  ctx.setFailing(true)
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  for (let attempt = 0; attempt < 7; attempt++) await ctx.queue.processNotificationQueue(undefined, Date.now() + attempt * 20 * 60_000)
  const job = ctx.queue.readNotificationJobs()[0]
  assert.equal(job.status, 'failed')
  assert.equal(job.attempts, 6)
  assert.equal(ctx.calls.length, 6)
  assert.ok(job.lastError)
})

test('notification queue recovers expired leases after a worker interruption', async () => {
  const ctx = queueHarness()
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  const jobs = ctx.queue.readNotificationJobs()
  Object.assign(jobs[0], { status: 'processing', leaseUntil: Date.now() - 1, claimToken: 'previous-worker', attempts: 1 })
  ctx.files.set(path.join('/verification', 'data', 'notification-queue.json'), JSON.stringify(jobs))
  await ctx.queue.processNotificationQueue()
  assert.equal(ctx.queue.readNotificationJobs()[0].status, 'delivered')
  assert.equal(ctx.queue.readNotificationJobs()[0].attempts, 2)
})

test('notification queue prevents overlapping workers claiming the same job', async () => {
  const ctx = queueHarness()
  let release!: () => void
  ctx.setHold(new Promise<void>(resolve => { release = resolve }))
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  const first = ctx.queue.processNotificationQueue()
  await ctx.queue.processNotificationQueue()
  release()
  await first
  assert.deepEqual(ctx.calls, ['slack'])
})

test('notification queue records suppression and does not deliver simulated or stale alerts', async () => {
  const ctx = queueHarness()
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification', { simulation: true })
  ctx.queue.enqueueNotification(ctx.incident, 'ack-breach', 'Verification')
  await ctx.queue.processNotificationQueue(() => 'skip')
  assert.equal(ctx.calls.length, 0)
  assert.ok(ctx.queue.readNotificationJobs().every(job => job.status === 'skipped'))
})

test('notification queue defers a source outage without consuming delivery attempts', async () => {
  const ctx = queueHarness()
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  await ctx.queue.processNotificationQueue(() => 'defer')
  assert.equal(ctx.queue.readNotificationJobs()[0].status, 'pending')
  assert.equal(ctx.queue.readNotificationJobs()[0].attempts, 0)
  assert.equal(ctx.calls.length, 0)
})

test('SMTP delivery verifies certificates and uses bounded connection timeouts', async () => {
  let options: { tls: { rejectUnauthorized: boolean }; connectionTimeout: number } | undefined
  const notifier = loadModule<{ sendEmail: (recipients: string[], subject: string, body: string) => Promise<void> }>('src/lib/notifier.ts', {
    './settings-store': { getSettings: () => ({ alertEmailEnabled: true, smtpHost: 'example.test', smtpPort: 587 }) },
    nodemailer: { createTransport: (value: typeof options) => { options = value; return { sendMail: async () => {} } } },
  })
  await notifier.sendEmail(['recipient@example.test'], 'Verification', 'Verification')
  assert.equal(options?.tls.rejectUnauthorized, true)
  assert.equal(options?.connectionTimeout, 10_000)
})

test('worker processes live incidents without any browser request', async () => {
  const ctx = harness()
  let dispatched = 0
  const decisions: string[] = []
  const worker = loadModule<{ runIncidentCycle: () => Promise<void>; startIncidentWorker: () => boolean }>('src/lib/incident-worker.ts', {
    fs: ctx.fakeFs, path,
    './incident-source': { collectIncidents: async () => ({ incidents: [ctx.incident], live: true }) },
    './alert-dispatcher': { dispatchAlerts: () => { dispatched++ } },
    './maintenance-store': { isUnderMaintenance: () => false, isSlapaused: () => false },
    './notification-queue': { processNotificationQueue: async (decision: (job: Partial<NotificationJob>) => string) => {
      decisions.push(decision({ episodeId: `${ctx.incident.id}:${ctx.incident.createdAt}`, event: 'initial' }))
    } },
  })
  assert.equal(worker.startIncidentWorker(), false)
  await Promise.all([worker.runIncidentCycle(), worker.runIncidentCycle()])
  assert.equal(dispatched, 1)
  assert.deepEqual(decisions, ['deliver'])
  const status = JSON.parse(ctx.files.get(path.join('/verification', 'data', 'incident-worker.json'))!)
  assert.ok(status.lastSuccessAt)
})

test('worker defers lifecycle delivery during source outages but permits audited action notifications', async () => {
  const ctx = harness()
  const decisions: string[] = []
  const worker = loadModule<{ runIncidentCycle: () => Promise<void> }>('src/lib/incident-worker.ts', {
    fs: ctx.fakeFs, path,
    './incident-source': { collectIncidents: async () => { throw new Error('Unavailable') } },
    './alert-dispatcher': { dispatchAlerts: () => assert.fail('Must not reconcile an unavailable source') },
    './maintenance-store': {},
    './notification-queue': { processNotificationQueue: async (decision: (job: Partial<NotificationJob>) => string) => {
      decisions.push(decision({ event: 'initial' }), decision({ event: 'incident.resolve:verification' }))
    } },
  })
  await worker.runIncidentCycle()
  assert.deepEqual(decisions, ['defer', 'deliver'])
})

test('worker blocks maintenance, acknowledged breaches and paused SLA notifications', async () => {
  const ctx = harness()
  let maintenance = true
  const decisions: string[] = []
  const worker = loadModule<{ runIncidentCycle: () => Promise<void> }>('src/lib/incident-worker.ts', {
    fs: ctx.fakeFs, path,
    './incident-source': { collectIncidents: async () => ({ incidents: [{ ...ctx.incident, status: 'acknowledged' }], live: true }) },
    './alert-dispatcher': { dispatchAlerts: () => {} },
    './maintenance-store': { isUnderMaintenance: () => maintenance, isSlapaused: () => true },
    './notification-queue': { processNotificationQueue: async (decision: (job: Partial<NotificationJob>) => string) => {
      const job = { episodeId: `${ctx.incident.id}:${ctx.incident.createdAt}` }
      decisions.push(decision({ ...job, event: 'initial' }))
      maintenance = false
      decisions.push(decision({ ...job, event: 'ack-breach' }), decision({ ...job, event: 'resolve-breach' }))
    } },
  })
  await worker.runIncidentCycle()
  assert.deepEqual(decisions, ['skip', 'skip', 'defer'])
})

test('failed delivery can be retried explicitly with actor and audit evidence', async () => {
  const ctx = queueHarness()
  ctx.setFailing(true)
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification')
  for (let attempt = 0; attempt < 6; attempt++) await ctx.queue.processNotificationQueue(undefined, Date.now() + attempt * 20 * 60_000)
  const id = ctx.queue.readNotificationJobs()[0].id
  assert.equal(ctx.queue.retryNotification(id, 'operator@example.test', 'verification'), true)
  ctx.setFailing(false)
  await ctx.queue.processNotificationQueue()
  assert.equal(ctx.queue.readNotificationJobs()[0].status, 'delivered')
  assert.equal(ctx.queue.retryNotification(id, 'operator@example.test', 'verification'), false)
  assert.ok(ctx.outcomes.some(entry => entry.action === 'notification.retry' && entry.actor === 'operator@example.test'))
})

test('delivery inspection and retry enforce editor access and do not expose payloads', async () => {
  const ctx = queueHarness()
  let viewer = true
  ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Private notification text')
  const route = loadModule<{ GET: (req: unknown) => Promise<{ status: number; body: unknown }>; POST: (req: unknown) => Promise<{ status: number }> }>('src/app/api/incidents/notifications/route.ts', {
    'next/server': { NextResponse: ctx.responseClass },
    '@/lib/auth': { requireRole: async (_req: unknown, required: string) => {
      assert.equal(required, 'editor')
      return viewer ? ctx.responseClass.json({}, { status: 403 }) : { email: 'operator@example.test' }
    } },
    '@/lib/notification-queue': ctx.queue,
    '@/lib/audit': { getClientIp: () => 'verification' },
  })
  assert.equal((await route.GET({})).status, 403)
  assert.equal((await route.POST({ json: async () => ({ id: 'invalid' }) })).status, 403)
  viewer = false
  const response = await route.GET({})
  assert.equal(response.status, 200)
  assert.equal(JSON.stringify(response.body).includes('Private notification text'), false)
  assert.equal((await route.POST({ json: async () => ({ id: 'invalid' }) })).status, 400)
})

test('audit archive retains the existing log beyond the recent-entry cap', () => {
  const ctx = harness()
  const existing = Array.from({ length: 1000 }, (_, index) => ({ ts: new Date().toISOString(), actor: 'system', action: `seed.${index}`, detail: 'Verification', ip: 'verification' }))
  ctx.files.set(path.join('/verification', 'data', 'audit-log.json'), JSON.stringify(existing))
  const audit = loadModule<{ writeAuditSync: (entry: Record<string, string>) => void }>('src/lib/audit.ts', { fs: ctx.fakeFs, path })
  audit.writeAuditSync({ actor: 'operator@example.test', action: 'incident.resolve', detail: 'Verification', ip: 'verification' })
  const recent = JSON.parse(ctx.files.get(path.join('/verification', 'data', 'audit-log.json'))!)
  const archive = ctx.files.get(path.join('/verification', 'data', 'audit-history.jsonl'))!.trim().split('\n').map(line => JSON.parse(line))
  assert.equal(recent.length, 1000)
  assert.equal(archive.length, 1001)
  assert.equal(archive[archive.length - 1].action, 'incident.resolve')
})

test('stale episode actions and invalid transitions are rejected without mutation', async () => {
  const ctx = harness()
  assert.equal((await ctx.patch({ id: ctx.incident.id, createdAt: 'stale', status: 'resolved' })).status, 409)
  assert.equal(ctx.audit.length, 0)
  await ctx.patch({ id: ctx.incident.id, status: 'resolved' })
  assert.equal((await ctx.patch({ id: ctx.incident.id, status: 'acknowledged' })).status, 409)
})

test('integration: API actions, real queue and worker preserve lifecycle, delivery and history', async () => {
  const ctx = queueHarness()
  const audit: Record<string, unknown>[] = []
  const dependencies = {
    fs: ctx.fakeFs, path, 'next/server': { NextResponse: ctx.responseClass },
    './auth': { requireRole: async () => ({ email: 'operator@example.test' }) },
    './audit': { writeAuditSync: (entry: Record<string, unknown>) => audit.push(entry), getClientIp: () => 'verification' },
    './notification-queue': ctx.queue,
    './settings-store': { getSettings: () => ({ slackWebhookUrl: 'https://example.test/mock' }) },
    './maintenance-store': { isUnderMaintenance: () => false, isSlapaused: () => false },
    './prometheus': {
      isAlertmanagerConfigured: () => true,
      alertmanagerAlerts: async () => [{ fingerprint: ctx.incident.id, startsAt: ctx.incident.createdAt, annotations: { summary: ctx.incident.title }, labels: { severity: 'critical' }, status: { state: 'active' } }],
    },
    './simulation': { simulatedIncidents: () => [] },
  }
  const route = loadModule<{ GET: (req: unknown) => Promise<{ status: number }>; PATCH: (req: unknown) => Promise<{ status: number }> }>('src/app/api/incidents/route.ts', dependencies)
  const worker = loadModule<{ runIncidentCycle: () => Promise<void> }>('src/lib/incident-worker.ts', dependencies)
  assert.equal((await route.GET({})).status, 200)
  assert.equal(ctx.calls.length, 0)
  await worker.runIncidentCycle()
  for (const status of ['acknowledged', 'resolved']) {
    assert.equal((await route.PATCH({ json: async () => ({ id: ctx.incident.id, createdAt: ctx.incident.createdAt, status, notes: 'Verification notes' }) })).status, 200)
    await worker.runIncidentCycle()
  }
  assert.deepEqual(ctx.calls, ['slack', 'slack', 'slack'])
  assert.equal((await route.PATCH({ json: async () => ({ id: ctx.incident.id, createdAt: ctx.incident.createdAt, status: 'resolved', notes: 'Verification notes' }) })).status, 200)
  await worker.runIncidentCycle()
  assert.equal(ctx.calls.length, 3)
  assert.ok(ctx.queue.readNotificationJobs().every(job => job.status === 'delivered'))
  assert.ok(audit.some(entry => entry.action === 'incident.resolve' && entry.outcome === 'succeeded' && entry.notes === 'Verification notes'))
  const history = JSON.parse(ctx.files.get(path.join('/verification', 'data', 'incident-history.json'))!)
  assert.equal(history[0].notes, 'Verification notes')
  assert.equal(history[0].status, 'resolved')
})

test('cached live incidents remain actionable briefly during an outage, then fail closed', async () => {
  const ctx = harness()
  ctx.setAlerts([{ fingerprint: ctx.incident.id, startsAt: ctx.incident.createdAt, annotations: {}, labels: { severity: 'critical' }, status: { state: 'active' } }])
  await ctx.route.GET({})
  ctx.setSourceFailed(true)
  assert.equal((await ctx.patch({ id: ctx.incident.id, status: 'acknowledged' })).status, 200)
  ctx.advance(6 * 60_000)
  assert.equal((await ctx.patch({ id: ctx.incident.id, status: 'resolved' })).status, 503)
})

test('corrupt queue data fails closed rather than overwriting notification evidence', () => {
  const ctx = queueHarness()
  const file = path.join('/verification', 'data', 'notification-queue.json')
  ctx.files.set(file, 'corrupt verification data')
  assert.throws(() => ctx.queue.enqueueNotification(ctx.incident, 'initial', 'Verification'))
  assert.equal(ctx.files.get(file), 'corrupt verification data')
  assert.equal(ctx.calls.length, 0)
})

test('late source reconciliation does not overwrite a manual resolution and its notes', async () => {
  const ctx = harness()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  await ctx.patch({ id: ctx.incident.id, status: 'resolved', notes: 'Operator resolution' })
  for (let read = 0; read < 2; read++) { ctx.unlock(); ctx.dispatcher.dispatchAlerts([]) }
  const history = JSON.parse(ctx.files.get(path.join('/verification', 'data', 'incident-history.json'))!)
  assert.equal(history[0].notes, 'Operator resolution')
  assert.equal(history[0].resolutionReason, 'manual')
})

test('malformed JSON and non-string status values are rejected without changes', async () => {
  const ctx = harness()
  assert.equal((await ctx.route.PATCH({ json: async () => { throw new SyntaxError('Verification') } })).status, 400)
  assert.equal((await ctx.patch({ id: ctx.incident.id, status: ['open'] })).status, 400)
  assert.equal(ctx.audit.length, 0)
})

test('store locks recover empty files left by an interrupted process', () => {
  const ctx = harness()
  const file = path.join('/verification', 'data', 'verification-store.lock')
  ctx.files.set(file, '')
  const store = loadModule<{ withStoreLock: (name: string, operation: () => string) => string }>('src/lib/json-store.ts', {
    fs: { ...ctx.fakeFs, statSync: () => ({ mtimeMs: Date.now() - 120_000 }) }, path,
  })
  assert.equal(store.withStoreLock('verification-store', () => 'recovered'), 'recovered')
  assert.equal(ctx.files.has(file), false)
})

test('healthy live data does not silently switch to simulation when history is corrupt', async () => {
  const ctx = harness()
  ctx.setAlerts([{ fingerprint: ctx.incident.id, startsAt: ctx.incident.createdAt, annotations: {}, labels: { severity: 'critical' }, status: { state: 'active' } }])
  ctx.files.set(path.join('/verification', 'data', 'incident-history.json'), 'corrupt verification history')
  assert.equal((await ctx.route.GET({})).status, 503)
})

test('automatic source-clear messages are suppressed during maintenance', async () => {
  const ctx = harness()
  ctx.files.set(path.join('/verification', 'data', 'incident-history.json'), JSON.stringify([{ ...ctx.incident, status: 'resolved', resolutionReason: 'source-cleared' }]))
  const decisions: string[] = []
  const worker = loadModule<{ runIncidentCycle: () => Promise<void> }>('src/lib/incident-worker.ts', {
    fs: ctx.fakeFs, path,
    './incident-source': { collectIncidents: async () => ({ incidents: [], live: true }) },
    './alert-dispatcher': { dispatchAlerts: () => {} },
    './maintenance-store': { isUnderMaintenance: () => true, isSlapaused: () => false },
    './notification-queue': { processNotificationQueue: async (decision: (job: Partial<NotificationJob>) => string) => {
      decisions.push(decision({ event: 'incident.source-resolve', episodeId: `${ctx.incident.id}:${ctx.incident.createdAt}` }))
    } },
  })
  await worker.runIncidentCycle()
  assert.deepEqual(decisions, ['skip'])
})

test('atomic JSON writes survive transient Windows replacement errors', () => {
  const ctx = harness()
  let replacements = 0
  const store = loadModule<{ writeJson: (file: string, value: unknown) => void }>('src/lib/json-store.ts', {
    fs: { ...ctx.fakeFs, renameSync: (source: string, target: string) => {
      if (replacements++ === 0) throw Object.assign(new Error('Verification transient lock'), { code: 'EPERM' })
      ctx.fakeFs.renameSync(source, target)
    } }, path,
  })
  const file = path.join('/verification', 'data', 'atomic-verification.json')
  store.writeJson(file, { verified: true })
  assert.deepEqual(JSON.parse(ctx.files.get(file)!), { verified: true })
  assert.equal(replacements, 2)
})

test('atomic JSON writes work with real filesystem watchers and replacements', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vyndc-atomic-regression-'))
  const watcher = fs.watch(directory, () => {})
  const store = loadModule<{ writeJson: (file: string, value: unknown) => void }>('src/lib/json-store.ts', { fs, path })
  const file = path.join(directory, 'verification.json')
  try {
    for (let count = 0; count < 200; count++) store.writeJson(file, { count })
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).count, 199)
  } finally {
    watcher.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('SLA pauses exclude paused time and do not permanently suppress later breaches', () => {
  const ctx = harness()
  ctx.setPaused(true)
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.advance(3 * 60_000)
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  ctx.setPaused(false)
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  assert.equal(ctx.notifications.filter(message => message.includes('SLA')).length, 0)
  ctx.advance(3 * 60_000)
  ctx.unlock()
  ctx.dispatcher.dispatchAlerts([ctx.incident])
  assert.equal(ctx.notifications.filter(message => message.includes('SLA')).length, 2)
})