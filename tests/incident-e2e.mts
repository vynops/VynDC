import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { once, EventEmitter } from 'node:events'
import { SMTPServer } from 'smtp-server'
import { jwtVerify } from 'jose'
import type { Incident } from '../src/lib/simulation/index.ts'
import type { NotificationJob } from '../src/lib/notification-queue.ts'

const workspace = process.cwd()
const reportFile = path.join(workspace, '.incident-e2e-results.json')
assert.ok(fs.existsSync(path.join(workspace, '.next', 'BUILD_ID')), 'Run npm run build before runtime verification')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vyndc-incident-e2e-'))
const data = path.join(root, 'data')
fs.mkdirSync(data)
for (const directory of ['.next', 'node_modules']) fs.symlinkSync(path.join(workspace, directory), path.join(root, directory), 'junction')
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'vyndc-verification', private: true }))
const secret = crypto.randomBytes(32).toString('hex')
const bus = new EventEmitter()
const watcher = fs.watch(data, () => bus.emit('change'))
const checks: string[] = []
fs.writeFileSync(reportFile, JSON.stringify({ verification: 'running' }))
const messages: { channel: string; accepted: boolean; text: string }[] = []
const mail: string[] = []
const passwords = new Map<string, string>()
const sessions = new Map<string, string>()
const users = ['admin', 'editor', 'viewer'].map(role => {
  const password = crypto.randomBytes(24).toString('hex')
  const salt = crypto.randomBytes(16).toString('hex')
  passwords.set(role, password)
  return { id: `fixture-${role}`, email: `${role}@example.test`, name: `Verification ${role}`, role, active: true,
    passwordSalt: salt, passwordHash: crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex'), createdAt: new Date().toISOString() }
})
const write = (file: string, value: unknown) => fs.writeFileSync(path.join(data, file), JSON.stringify(value, null, 2))
const read = <Value,>(file: string): Value => JSON.parse(fs.readFileSync(path.join(data, file), 'utf8')) as Value
write('users.json', users)
write('sla.json', { critical: { ackMinutes: 15, resolveMinutes: 60 } })
write('escalation-policies.json', [{ id: 'default', name: 'Verification', steps: [] }])
write('maintenance-windows.json', [])
let sourceOnline = true
let rejectedSlack = 1
let alerts = [makeAlert('runtime-verification')]
let child: ChildProcess | undefined
let stopping = false
let completed = false
let failure: string | undefined
let appLogs = ''

function makeAlert(id: string) {
  return { fingerprint: id, startsAt: new Date().toISOString(), annotations: { summary: `Verification ${id}`, description: 'Isolated runtime verification' }, labels: { severity: 'critical' }, status: { state: 'active' } }
}

function waitFor(predicate: () => boolean, label: string, timeout = 85_000, failOnWorkerError = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (failOnWorkerError && fs.existsSync(path.join(data, 'incident-worker.json'))) {
        const status = read<{ lastError?: string; lastErrorCode?: string }>('incident-worker.json')
        if (status.lastError) {
          clearTimeout(timer)
          bus.off('change', finish)
          reject(new Error(`Worker processing failed: ${status.lastErrorCode ?? 'UNKNOWN'}`))
          return
        }
      }
      try { if (!predicate()) return } catch { return }
      clearTimeout(timer)
      bus.off('change', finish)
      resolve()
    }
    const timer = setTimeout(() => { bus.off('change', finish); reject(new Error(`Timed out: ${label}`)) }, timeout)
    bus.on('change', finish)
    finish()
  })
}

const backend = http.createServer(async (req, res) => {
  if (req.url === '/api/v2/alerts') {
    res.writeHead(sourceOnline ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(sourceOnline ? alerts : { error: 'Verification outage' }))
    return
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { text?: string }
  const channel = req.url?.slice(1) ?? ''
  const accepted = channel !== 'slack' || rejectedSlack-- <= 0
  messages.push({ channel, accepted, text: payload.text ?? '' })
  res.writeHead(accepted ? 200 : 503)
  res.end(accepted ? 'ok' : 'Verification rejection')
  bus.emit('change')
})
backend.listen(0, '127.0.0.1')
await once(backend, 'listening')
const backendPort = (backend.address() as { port: number }).port
const backendUrl = `http://127.0.0.1:${backendPort}`
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'], logger: false,
  onData(stream, _session, callback) {
    const chunks: Buffer[] = []
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => { mail.push(Buffer.concat(chunks).toString()); callback(); bus.emit('change') })
  },
})
await new Promise<void>((resolve, reject) => { smtp.once('error', reject); smtp.listen(0, '127.0.0.1', resolve) })
const smtpPort = (smtp.server.address() as { port: number }).port
write('settings.json', { alertmanagerUrl: backendUrl, slackWebhookUrl: `${backendUrl}/slack`, teamsWebhookUrl: `${backendUrl}/teams`, customWebhookUrl: `${backendUrl}/custom`, alertEmailEnabled: true, smtpHost: '127.0.0.1', smtpPort, smtpFrom: 'verification@example.test', alertRecipients: 'recipient@example.test' })
const reservation = http.createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const appPort = (reservation.address() as { port: number }).port
await new Promise<void>(resolve => reservation.close(() => resolve()))
const appUrl = `http://127.0.0.1:${appPort}`

async function stopApp(): Promise<void> {
  if (!child || child.exitCode !== null) return
  const exited = once(child, 'exit')
  child.kill()
  await exited
}

async function startApp(enabled: boolean): Promise<void> {
  await stopApp()
  child = spawn(process.execPath, [path.join(workspace, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(appPort)], {
    cwd: root, env: { ...process.env, NODE_ENV: 'production', VYNDC_SECRET: secret, VYNDC_INCIDENT_WORKER_ENABLED: String(enabled), NEXT_PHASE: 'phase-production-server', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const started = child
  await new Promise<void>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('Application readiness timed out')), 30_000)
    started.stdout!.on('data', chunk => {
      output += String(chunk)
      if (output.includes('Ready in')) { clearTimeout(timer); resolve() }
    })
    started.stderr!.on('data', chunk => { appLogs = (appLogs + String(chunk)).slice(-20_000) })
    started.once('error', () => { clearTimeout(timer); reject(new Error('Application startup failed')) })
    started.once('exit', () => { clearTimeout(timer); reject(new Error('Application exited before readiness')) })
  })
}

async function login(role: string): Promise<string> {
  if (sessions.has(role)) return sessions.get(role)!
  const response = await fetch(`${appUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@example.test`, password: passwords.get(role) }) })
  assert.equal(response.status, 200, 'Fixture login must use isolated user storage')
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie && cookie.startsWith('vyndc_session='), 'Fixture session cookie required')
  await jwtVerify(cookie.slice('vyndc_session='.length), new TextEncoder().encode(secret))
  sessions.set(role, cookie)
  return cookie
}

async function request(route: string, role = 'editor', body?: unknown, method = body === undefined ? 'GET' : 'PATCH'): Promise<Response> {
  return fetch(appUrl + route, { redirect: 'manual', method, headers: { Cookie: await login(role), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function runtimeChecks(): Promise<void> {
  await startApp(false)
  const settingsResponse = await request('/api/settings', 'admin')
  assert.equal(settingsResponse.status, 200)
  const settings = await settingsResponse.json() as { alertmanagerUrl: string }
  assert.equal(settings.alertmanagerUrl, backendUrl, 'Provider settings must be isolated before enabling delivery')
  assert.equal(fs.existsSync(path.join(data, 'notification-queue.json')), false)
  checks.push('Isolated settings and generated login sessions')
  await startApp(true)
  await waitFor(() => fs.existsSync(path.join(data, 'incident-worker.json')), 'worker startup heartbeat', 15_000)
  await waitFor(() => read<NotificationJob[]>('notification-queue.json').length === 4 && read<NotificationJob[]>('notification-queue.json').every(job => job.status === 'delivered'), 'automatic worker retry and all four transports', 85_000, true)
  const initialJobs = read<NotificationJob[]>('notification-queue.json')
  assert.equal(initialJobs.find(job => job.channel === 'slack')?.attempts, 2)
  assert.ok(initialJobs.filter(job => job.channel !== 'slack').every(job => job.attempts === 1))
  assert.equal(mail.length, 1)
  checks.push('Automatic worker, persisted retry, channel independence, Slack/Teams/custom HTTP and SMTP receipt')
  const unauthenticated = await fetch(`${appUrl}/api/incidents`, { redirect: 'manual' })
  assert.equal(unauthenticated.status, 307)
  assert.equal((await request('/api/incidents', 'viewer')).status, 200)
  const incident = (await (await request('/api/incidents')).json() as Incident[]).find(item => item.id === alerts[0].fingerprint)!
  assert.ok(incident)
  assert.equal((await request('/api/incidents', 'viewer', { id: incident.id, status: 'resolved' })).status, 403)
  assert.equal((await request('/api/incidents/notifications', 'viewer')).status, 403)
  assert.equal((await request('/api/incidents', 'editor', { id: 'unknown-verification', status: 'resolved' })).status, 404)
  assert.equal((await request('/api/incidents', 'editor', { id: incident.id, createdAt: 'stale', status: 'resolved' })).status, 409)
  checks.push('Actual middleware authentication, viewer/editor enforcement and stale/unknown action rejection')
  for (const action of [{ status: 'acknowledged', notes: 'Investigating verification' }, { assignTo: 'responder@example.test' }, { status: 'resolved', notes: 'Recovered verification' }]) {
    assert.equal((await request('/api/incidents', 'editor', { id: incident.id, createdAt: incident.createdAt, ...action })).status, 200)
  }
  const history = read<(Incident & { notes?: string })[]>('incident-history.json')
  assert.equal(history[0].notes, 'Recovered verification')
  assert.equal(history[0].status, 'resolved')
  const audit = read<{ action: string; outcome: string; actor: string; before?: unknown; after?: unknown }[]>('audit-log.json')
  assert.ok(audit.some(entry => entry.action === 'incident.resolve' && entry.outcome === 'succeeded' && entry.actor === 'editor@example.test' && entry.before && entry.after))
  assert.ok(fs.readFileSync(path.join(data, 'audit-history.jsonl'), 'utf8').includes('incident.resolve'))
  const queued = read<NotificationJob[]>('notification-queue.json').length
  await startApp(true)
  await waitFor(() => read<NotificationJob[]>('notification-queue.json').every(job => job.status === 'delivered'), 'restart recovery of pending actions', 30_000)
  assert.equal((await request('/api/incidents', 'editor', { id: incident.id, createdAt: incident.createdAt, status: 'resolved', notes: 'Recovered verification' })).status, 200)
  assert.equal(read<NotificationJob[]>('notification-queue.json').length, queued)
  checks.push('Acknowledge, assignment, immediate resolution history, audit journal, restart recovery and idempotency')
  assert.equal((await request('/api/incidents', 'editor', { id: incident.id, createdAt: incident.createdAt, status: 'open' })).status, 200)
  alerts = [makeAlert(incident.id)]
  const nextEpisode = (await (await request('/api/incidents')).json() as Incident[]).find(item => item.id === incident.id && item.createdAt === alerts[0].startsAt)!
  assert.equal(nextEpisode.status, 'open')
  assert.equal((await request('/api/incidents', 'editor', { id: incident.id, createdAt: incident.createdAt, status: 'resolved' })).status, 409)
  sourceOnline = false
  assert.equal((await request('/api/incidents')).status, 200)
  sourceOnline = true
  const historyBackup = fs.readFileSync(path.join(data, 'incident-history.json'), 'utf8')
  fs.writeFileSync(path.join(data, 'incident-history.json'), 'Invalid verification history')
  assert.equal((await request('/api/incidents')).status, 503)
  fs.writeFileSync(path.join(data, 'incident-history.json'), historyBackup)
  checks.push('Reopen, recurrence isolation, outage fallback and explicit corrupted-history failure')
  alerts.push(makeAlert('maintenance-verification'))
  write('maintenance-windows.json', [{ id: 'verification-window', title: 'Verification maintenance', scope: 'all', scopeValues: [], startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 600_000).toISOString(), suppressAlerts: true, pauseSla: true }])
  write('dispatch-lock.json', { lastRun: 0 })
  await request('/api/incidents')
  assert.equal(read<NotificationJob[]>('notification-queue.json').some(job => job.incidentId === 'maintenance-verification'), false)
  write('maintenance-windows.json', [])
  checks.push('Real maintenance persistence suppresses new lifecycle notifications')
  const deliveredId = initialJobs.find(job => job.channel === 'slack')!.id
  assert.equal((await request('/api/incidents/notifications', 'viewer', { id: deliveredId }, 'POST')).status, 403)
  assert.equal((await request('/api/incidents/notifications', 'editor', { id: deliveredId }, 'POST')).status, 409)
  const retryId = crypto.createHash('sha256').update('fixture-explicit-retry').digest('hex')
  const seededFailure: NotificationJob = { ...initialJobs[0], id: retryId, event: 'incident.update:fixture-explicit-retry', text: 'Explicit fixture retry', status: 'failed', attempts: 6, lastError: 'Seeded exhausted fixture delivery' }
  write('notification-queue.json', [...read<NotificationJob[]>('notification-queue.json'), seededFailure])
  const inspection = await (await request('/api/incidents/notifications')).json()
  assert.equal(JSON.stringify(inspection).includes('Explicit fixture retry'), false)
  assert.equal((await request('/api/incidents/notifications', 'editor', { id: retryId }, 'POST')).status, 200)
  await startApp(true)
  await waitFor(() => read<NotificationJob[]>('notification-queue.json').find(job => job.id === retryId)?.status === 'delivered', 'explicit retry through the real API', 30_000, true)
  assert.ok(read<{ action: string; actor: string; outcome: string }[]>('audit-log.json').some(entry => entry.action === 'notification.retry' && entry.actor === 'editor@example.test' && entry.outcome === 'succeeded'))
  checks.push('Editor-only explicit retry of a seeded failed job, delivered-job rejection, result redaction and actor audit')
  for (const alert of alerts) assert.equal((await request('/api/incidents', 'editor', { id: alert.fingerprint, createdAt: alert.startsAt, status: 'resolved' })).status, 200)
  await startApp(true)
  await waitFor(() => read<NotificationJob[]>('notification-queue.json').every(job => job.status === 'delivered'), 'fixture lifecycle drainage', 30_000, true)
  alerts = [makeAlert('sla-verification')]
  write('sla.json', { critical: { ackMinutes: 0.2, resolveMinutes: 0.4 } })
  write('escalation-policies.json', [{ id: 'default', name: 'Runtime verification', steps: [{ delayMin: 0.15, notifyEmails: [], notifySlack: true, notifyOncall: false }] }])
  write('dispatch-lock.json', { lastRun: 0 })
  await request('/api/incidents')
  await waitFor(() => {
    const jobs = read<NotificationJob[]>('notification-queue.json').filter(job => job.incidentId === 'sla-verification')
    return new Set(jobs.map(job => job.event)).size === 4 && jobs.every(job => job.status === 'delivered')
  }, 'scheduled SLA breaches and escalation delivery', 85_000, true)
  const slaJobs = read<NotificationJob[]>('notification-queue.json').filter(job => job.incidentId === 'sla-verification')
  assert.deepEqual([...new Set(slaJobs.map(job => job.event))].sort(), ['ack-breach', 'escalation-1', 'initial', 'resolve-breach'])
  await request('/api/incidents')
  await request('/api/incidents')
  assert.equal(read<NotificationJob[]>('notification-queue.json').filter(job => job.incidentId === 'sla-verification').length, slaJobs.length)
  checks.push('Actual scheduled ack/resolve SLA breaches, escalation delivery, cooldown and event deduplication')
  alerts = []
  for (let snapshot = 0; snapshot < 2; snapshot++) { write('dispatch-lock.json', { lastRun: 0 }); await request('/api/incidents') }
  assert.ok(read<{ id: string; resolutionReason: string }[]>('incident-history.json').some(entry => entry.id === 'sla-verification' && entry.resolutionReason === 'source-cleared'))
  await startApp(true)
  await waitFor(() => read<NotificationJob[]>('notification-queue.json').every(job => job.status === 'delivered'), 'source-clear delivery', 30_000, true)
  checks.push('Two successful real source reads archive disappearance and deliver a guarded source-clear notification')
  write('sla.json', { critical: { ackMinutes: 15, resolveMinutes: 60 } })
  alerts = [makeAlert('browser-verification')]
  completed = true
  const result = { verification: 'passed', checks }
  fs.writeFileSync(reportFile, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
}

const control = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (req.url?.startsWith('/browser-session')) {
    try {
      const role = new URL(req.url, 'http://localhost').searchParams.get('role') ?? 'editor'
      assert.ok(['editor', 'viewer', 'admin'].includes(role))
      res.writeHead(302, { 'Set-Cookie': `${await login(role)}; Path=/; HttpOnly; SameSite=Lax`, Location: `${appUrl}/incidents` })
      res.end()
    } catch { res.writeHead(500); res.end(JSON.stringify({ error: 'Fixture session unavailable' })) }
  } else if (req.url?.startsWith('/session')) {
    try {
      const role = new URL(req.url, 'http://localhost').searchParams.get('role') ?? 'editor'
      assert.ok(['editor', 'viewer', 'admin'].includes(role))
      res.end(JSON.stringify({ cookie: await login(role) }))
    } catch { res.writeHead(500); res.end(JSON.stringify({ error: 'Fixture session unavailable' })) }
  } else if (req.url === '/results') {
    res.end(JSON.stringify({ completed, failure, checks, appUrl }))
  } else if (req.url === '/shutdown' && req.method === 'POST') {
    res.end(JSON.stringify({ stopped: true }))
    void cleanup()
  } else { res.writeHead(404); res.end('{}') }
})

async function cleanup(): Promise<void> {
  if (stopping) return
  stopping = true
  await stopApp()
  watcher.close()
  backend.closeAllConnections()
  control.closeAllConnections()
  await Promise.all([new Promise<void>(resolve => backend.close(() => resolve())), new Promise<void>(resolve => control.close(() => resolve())), new Promise<void>(resolve => smtp.close(resolve))])
  for (const directory of ['.next', 'node_modules']) fs.unlinkSync(path.join(root, directory))
  fs.rmSync(root, { recursive: true, force: true })
  console.log('Isolated verification servers stopped and temporary state removed')
}

control.listen(0, '127.0.0.1')
await once(control, 'listening')
const controlUrl = `http://127.0.0.1:${(control.address() as { port: number }).port}`
console.log(JSON.stringify({ appUrl, controlUrl, mode: process.argv.includes('--serve') ? 'browser-fixture' : 'runtime-check' }))
process.once('SIGINT', () => { void cleanup() })
process.once('SIGTERM', () => { void cleanup() })
try {
  await runtimeChecks()
  if (!process.argv.includes('--serve')) await cleanup()
} catch (error) {
  failure = error instanceof Error ? error.message : 'Runtime verification failed'
  const diagnostics = {
    worker: fs.existsSync(path.join(data, 'incident-worker.json')) ? read<unknown>('incident-worker.json') : null,
    jobs: fs.existsSync(path.join(data, 'notification-queue.json')) ? read<NotificationJob[]>('notification-queue.json').map(job => ({ channel: job.channel, status: job.status, attempts: job.attempts, error: job.lastError })) : [],
    receiverCounts: { http: messages.length, smtp: mail.length },
    applicationFlags: { instrumentationError: /instrumentation/i.test(appLogs), moduleError: /Cannot find module|Module not found/i.test(appLogs), workerPersistenceError: /\[incident-worker\]/.test(appLogs) },
  }
  const result = { verification: 'failed', failure, checks, diagnostics }
  fs.writeFileSync(reportFile, JSON.stringify(result, null, 2))
  console.error(JSON.stringify(result))
  process.exitCode = 1
  await cleanup()
}