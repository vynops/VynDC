import path from 'path'
import { collectIncidents } from './incident-source'
import { dispatchAlerts } from './alert-dispatcher'
import { processNotificationQueue } from './notification-queue'
import { episodeId, loadHistory, type StoredIncident } from './incident-store'
import { isUnderMaintenance, isSlapaused } from './maintenance-store'
import { readJson, writeJson } from './json-store'

const state = globalThis as typeof globalThis & {
  vyndcIncidentWorker?: { timer?: ReturnType<typeof setInterval>; running?: Promise<void> }
}
const statusFile = path.join(process.cwd(), 'data', 'incident-worker.json')
interface WorkerStatus { lastRunAt?: string; lastSuccessAt?: string; lastError?: string; lastErrorCode?: string; lastErrorType?: string }

async function cycle(): Promise<void> {
  const previous = readJson<WorkerStatus>(statusFile, {})
  const lastRunAt = new Date().toISOString()
  writeJson(statusFile, { ...previous, lastRunAt })
  let incidents: StoredIncident[] = []
  let live = false
  let lastError: string | undefined
  try {
    try {
      const collected = await collectIncidents()
      incidents = collected.incidents
      live = collected.live
    } catch {
      lastError = 'Incident source unavailable; lifecycle notifications deferred'
    }
    if (live) dispatchAlerts(incidents)
    await processNotificationQueue(job => {
      if (/^incident\.(acknowledge|assign|resolve|update):/.test(job.event)) return 'deliver'
      if (!live) return 'defer'
      const sourceCleared = job.event === 'incident.source-resolve'
      const incident = sourceCleared
        ? loadHistory().find(entry => episodeId(entry) === job.episodeId)
        : incidents.find(entry => episodeId(entry) === job.episodeId)
      if (!incident || (!sourceCleared && incident.status === 'resolved') || incident.sourceSuppressed) return 'skip'
      const context = { hostname: incident.hostname, rack: incident.rack, category: incident.category }
      if (isUnderMaintenance(context)) return 'skip'
      if (job.event === 'ack-breach' && incident.status === 'acknowledged') return 'skip'
      if ((job.event === 'ack-breach' || job.event === 'resolve-breach') && isSlapaused(context)) return 'defer'
      return 'deliver'
    })
    if (!live && !lastError) lastError = 'No live source configured; simulation notifications suppressed'
    writeJson(statusFile, { lastRunAt, lastSuccessAt: live ? new Date().toISOString() : previous.lastSuccessAt, lastError })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN'
    writeJson(statusFile, { ...previous, lastRunAt, lastError: 'Incident processing or notification persistence failed', lastErrorCode: /^[A-Z0-9_]+$/.test(code) ? code : 'UNKNOWN', lastErrorType: error instanceof Error ? error.name : 'UnknownError' })
  }
}

export function runIncidentCycle(): Promise<void> {
  const worker = state.vyndcIncidentWorker ??= {}
  if (worker.running) return worker.running
  worker.running = cycle().finally(() => { worker.running = undefined })
  return worker.running
}

export function startIncidentWorker(): boolean {
  if (process.env.VYNDC_INCIDENT_WORKER_ENABLED !== 'true') return false
  const worker = state.vyndcIncidentWorker ??= {}
  if (worker.timer) return true
  worker.timer = setInterval(() => { void runIncidentCycle().catch(() => console.error('[incident-worker] persistence unavailable')) }, 60_000)
  worker.timer.unref()
  void runIncidentCycle().catch(() => console.error('[incident-worker] persistence unavailable'))
  return true
}