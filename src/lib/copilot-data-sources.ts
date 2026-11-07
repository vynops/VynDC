export type CopilotSourceState = 'live' | 'simulation'

export interface CopilotDataSources {
  infrastructure: CopilotSourceState
  incidents: CopilotSourceState
  predictions: CopilotSourceState
}

export function formatCopilotDataSources(sources: CopilotDataSources): string {
  return `Infrastructure: ${sources.infrastructure}; incidents: ${sources.incidents}; predictions: ${sources.predictions}`
}

export function copilotSourceForQuery(query: string, sources: CopilotDataSources): string {
  const lower = query.toLowerCase()
  if (lower.includes('incident') || lower.includes('alert') || lower.includes('issue')) {
    return `incidents from ${sources.incidents} data`
  }
  if (lower.includes('predict') || lower.includes('forecast') || lower.includes('failure')) {
    return `infrastructure from ${sources.infrastructure} data; predictions from ${sources.predictions} data`
  }
  if (lower.includes('risk') || lower.includes('server') || lower.includes('storage') || lower.includes('disk') || lower.includes('capacity')) {
    return `infrastructure from ${sources.infrastructure} data`
  }
  return formatCopilotDataSources(sources)
}

export interface MonitoredNodeStatus {
  hostname: string
  status: string
  cpuUsagePct: number
  memUsedPct: number
}

export interface FailureTelemetryCoverage {
  diskSmart: boolean
  memoryEcc: boolean
  thermal: boolean
  psu: boolean
}

export function isFailureRiskQuestion(query: string): boolean {
  return /\b(fail(?:ure|ures|ing)?|predict(?:ion|ions|ed)?|at risk|risk of|replace(?:ment)?|breakdown)\b/i.test(query)
}

export function buildFailureRiskNotice(nodes: MonitoredNodeStatus[], coverage: FailureTelemetryCoverage): string {
  const missing: string[] = []
  if (!coverage.diskSmart) missing.push('disk SMART')
  if (!coverage.memoryEcc) missing.push('memory ECC')
  if (!coverage.thermal) missing.push('temperature')
  if (!coverage.psu) missing.push('PSU health')
  const nodeSummary = nodes.length === 0
    ? 'No monitored node identities are available.'
    : `${nodes.length} monitored Kubernetes node${nodes.length === 1 ? '' : 's'}: ${nodes.map(node => `${node.hostname} (${node.status}, CPU ${node.cpuUsagePct}%, memory ${node.memUsedPct}%)`).join('; ')}.`

  return [
    'I cannot verify physical server failure risk: live failure predictions are not configured.',
    nodeSummary,
    `Live component telemetry missing: ${missing.length ? missing.join(', ') : 'none of the basic checks above constitutes a validated failure prediction model'}.`,
    'Any dc-a* component forecasts shown elsewhere are simulation data, not verified failures. Do not schedule hardware replacement based on those forecasts.',
  ].join('\n\n')
}

export function normalizeAlertSeverity(value: string | undefined): string {
  return value && ['critical', 'high', 'medium', 'low'].includes(value) ? value : 'unknown'
}