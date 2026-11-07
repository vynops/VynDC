import path from 'path'
import type { Incident } from './simulation'
import { readJson, writeJson, withStoreLock } from './json-store'

export type StoredIncident = Incident & { notes?: string; resolutionReason?: string; sourceSuppressed?: boolean }
export type IncidentOverride = Partial<StoredIncident> & { episodeCreatedAt?: string }
const overridesFile = path.join(process.cwd(), 'data', 'incidents.json')
const historyFile = path.join(process.cwd(), 'data', 'incident-history.json')
const snapshotFile = path.join(process.cwd(), 'data', 'incident-snapshot.json')

export function episodeId(incident: Pick<Incident, 'id' | 'createdAt'>): string {
  return `${incident.id}:${incident.createdAt}`
}

export function loadOverrides(): Record<string, IncidentOverride> {
  return readJson(overridesFile, {})
}

export function saveOverrides(overrides: Record<string, IncidentOverride>): void {
  writeJson(overridesFile, overrides)
}

export function loadHistory(): StoredIncident[] {
  return readJson(historyFile, [])
}

export function archiveIncident(incident: StoredIncident, reason = 'manual'): boolean {
  return withStoreLock('incident-history', () => {
    const history = loadHistory()
    const resolved = { ...incident, status: 'resolved' as const, resolvedAt: incident.resolvedAt ?? new Date().toISOString(), resolutionReason: reason }
    const index = history.findIndex(entry => episodeId(entry) === episodeId(incident))
    if (index >= 0 && history[index].resolutionReason === 'manual' && reason !== 'manual') return false
    if (index >= 0) history[index] = resolved
    else history.unshift(resolved)
    writeJson(historyFile, history)
    return true
  })
}

export function applyOverrides(incidents: Incident[], simulation = false): StoredIncident[] {
  const overrides = loadOverrides()
  const simulationFile = path.join(process.cwd(), 'data', 'incident-simulation.json')
  const dates = simulation ? readJson<Record<string, string>>(simulationFile, {}) : {}
  let datesChanged = false
  if (simulation) incidents = incidents.map(incident => {
    if (!dates[incident.id]) { dates[incident.id] = overrides[incident.id]?.episodeCreatedAt ?? incident.createdAt; datesChanged = true }
    return { ...incident, createdAt: dates[incident.id] }
  })
  if (datesChanged) writeJson(simulationFile, dates)
  return incidents.map(incident => {
    const override = overrides[incident.id]
    if (!override) return incident
    const legacySeen = override.episodeCreatedAt === undefined
      ? readJson<Record<string, { firstSeenAt: string }>>(path.join(process.cwd(), 'data', 'seen-alerts.json'), {})[incident.id]?.firstSeenAt
      : undefined
    if (!simulation && (override.episodeCreatedAt ?? legacySeen) !== incident.createdAt) return incident
    return {
      ...incident, status: override.status ?? incident.status,
      resolvedAt: override.resolvedAt, assignedTo: override.assignedTo, notes: override.notes,
    }
  })
}

export function saveSnapshot(incidents: Incident[]): void {
  writeJson(snapshotFile, { fetchedAt: Date.now(), incidents })
}

export function loadSnapshot(): Incident[] {
  const snapshot = readJson<{ fetchedAt: number; incidents: Incident[] }>(snapshotFile, { fetchedAt: 0, incidents: [] })
  return Date.now() - snapshot.fetchedAt <= 5 * 60_000 ? snapshot.incidents : []
}