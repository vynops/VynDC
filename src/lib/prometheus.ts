/**
 * Thin Prometheus HTTP API client.
 * Reads prometheusUrl + alertmanagerUrl from saved settings at call time.
 * Falls back gracefully — callers check `isConfigured()` before using real data.
 */
import { getSettings } from './settings-store'

export type PromVector = {
  metric: Record<string, string>
  value: [number, string] // [timestamp, value]
}

export type PromMatrix = {
  metric: Record<string, string>
  values: [number, string][]
}

// ─── Low-level helpers ────────────────────────────────────────────────────────

export function prometheusBase(): string {
  return getSettings().prometheusUrl.replace(/\/$/, '')
}

export function alertmanagerBase(): string {
  return getSettings().alertmanagerUrl.replace(/\/$/, '')
}

export function isPrometheusConfigured(): boolean {
  return !!getSettings().prometheusUrl
}

export function isAlertmanagerConfigured(): boolean {
  return !!getSettings().alertmanagerUrl
}

async function promFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Prometheus HTTP ${res.status}: ${url}`)
  const json = await res.json() as { status: string; data: T }
  if (json.status !== 'success') throw new Error(`Prometheus returned status="${json.status}"`)
  return json.data
}

// ─── Instant vector query ─────────────────────────────────────────────────────

export async function promQuery(query: string): Promise<PromVector[]> {
  const base = prometheusBase()
  const url = `${base}/api/v1/query?query=${encodeURIComponent(query)}`
  const data = await promFetch<{ resultType: string; result: PromVector[] }>(url)
  return data.result
}

// ─── Range query ──────────────────────────────────────────────────────────────

export async function promQueryRange(
  query: string,
  start: number,
  end: number,
  step: string,
): Promise<PromMatrix[]> {
  const base = prometheusBase()
  const url = `${base}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`
  const data = await promFetch<{ resultType: string; result: PromMatrix[] }>(url)
  return data.result
}

// ─── Alertmanager ─────────────────────────────────────────────────────────────

export async function alertmanagerAlerts(): Promise<AlertmanagerAlert[]> {
  const base = alertmanagerBase()
  const res = await fetch(`${base}/api/v2/alerts`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Alertmanager HTTP ${res.status}`)
  return res.json() as Promise<AlertmanagerAlert[]>
}

export interface AlertmanagerAlert {
  fingerprint: string
  status: { state: 'active' | 'suppressed'; inhibitedBy: string[]; silencedBy: string[] }
  labels: Record<string, string>
  annotations: Record<string, string>
  startsAt: string
  endsAt: string
  generatorURL: string
}

// ─── Convenience: scalar value from a single-series result ───────────────────

export function scalarVal(result: PromVector[], defaultVal = 0): number {
  if (!result.length) return defaultVal
  return parseFloat(result[0].value[1]) || defaultVal
}

// ─── Get all unique instance labels from a metric ─────────────────────────────

export function instances(result: PromVector[]): string[] {
  return [...new Set(result.map(r => r.metric.instance ?? r.metric.node ?? ''))]
    .filter(Boolean)
}
