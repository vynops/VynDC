import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFailureRiskNotice, copilotSourceForQuery, formatCopilotDataSources, isFailureRiskQuestion, normalizeAlertSeverity } from '../src/lib/copilot-data-sources.ts'

const sources = { infrastructure: 'live' as const, incidents: 'live' as const, predictions: 'simulation' as const }

test('reports source status independently for each Copilot data domain', () => {
  assert.equal(formatCopilotDataSources(sources), 'Infrastructure: live; incidents: live; predictions: simulation')
})

test('failure forecast answers cannot be described as live infrastructure-only data', () => {
  assert.equal(copilotSourceForQuery('forecast of server failure', sources), 'infrastructure from live data; predictions from simulation data')
})

test('incident questions use incident source status', () => {
  assert.equal(copilotSourceForQuery('show active incidents', sources), 'incidents from live data')
})

test('recognizes failure-risk questions for the deterministic guardrail', () => {
  assert.equal(isFailureRiskQuestion('Which servers are at risk of failure?'), true)
  assert.equal(isFailureRiskQuestion('Summarize open alerts'), false)
})

test('failure notice separates monitored Kubernetes nodes from simulated hardware forecasts', () => {
  const notice = buildFailureRiskNotice([
    { hostname: 'k3d-mavops-server-0', status: 'healthy', cpuUsagePct: 23, memUsedPct: 51 },
  ], { diskSmart: false, memoryEcc: false, thermal: false, psu: false })
  assert.match(notice, /monitored Kubernetes node/)
  assert.match(notice, /disk SMART, memory ECC, temperature, PSU health/)
  assert.match(notice, /simulation data, not verified failures/)
  assert.doesNotMatch(notice, /replace .* immediately/i)
})

test('does not invent medium severity for alerts with missing or unknown severity', () => {
  assert.equal(normalizeAlertSeverity(undefined), 'unknown')
  assert.equal(normalizeAlertSeverity('none'), 'unknown')
  assert.equal(normalizeAlertSeverity('critical'), 'critical')
})