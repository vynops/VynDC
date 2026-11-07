import { isAlertmanagerConfigured, alertmanagerAlerts } from './prometheus'
import { simulatedIncidents } from './simulation'
import { applyOverrides, saveSnapshot, type StoredIncident } from './incident-store'

export class IncidentSourceUnavailable extends Error {
  constructor() { super('Incident source unavailable') }
}

export async function collectIncidents(): Promise<{ incidents: StoredIncident[]; live: boolean }> {
  if (!isAlertmanagerConfigured()) return { incidents: applyOverrides(simulatedIncidents(), true), live: false }
  let alerts
  try { alerts = await alertmanagerAlerts() } catch { throw new IncidentSourceUnavailable() }
  const incidents: StoredIncident[] = alerts.map(alert => ({
    id: alert.fingerprint,
    title: alert.annotations.summary ?? alert.labels.alertname ?? 'Alert',
    severity: (['critical', 'high', 'medium', 'low'].includes(alert.labels.severity) ? alert.labels.severity : 'medium') as StoredIncident['severity'],
    hostname: alert.labels.instance ?? alert.labels.node ?? undefined,
    category: 'hardware',
    description: alert.annotations.description ?? alert.annotations.message ?? '',
    status: 'open',
    sourceSuppressed: alert.status.state === 'suppressed',
    createdAt: alert.startsAt,
  }))
  saveSnapshot(incidents)
  return { incidents: applyOverrides(incidents), live: true }
}