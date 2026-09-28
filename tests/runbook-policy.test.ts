import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateRunbookPolicy, validateRunbookDefinition, type RunbookPolicyConfig } from '../src/lib/runbook-policy.ts'

const baseConfig: RunbookPolicyConfig = {
  mode: 'recommend-only',
  executionEnabled: true,
  lowRiskAutoClasses: ['notify-only'],
  maxAutoActionsPerHour: 2,
  safetyPolicies: { requireRollbackPlan: true, blockOutsideBusinessHours: true },
}

const runbook = { id: 'runbook-1', name: 'Notify', description: '', class: 'notify-only', risk: 'low' as const, rollbackPlan: 'No infrastructure change.', enabled: true,
  steps: [{ id: 'step-1', name: 'Notify', actionType: 'notify', payload: { message: 'Done' } }] }

test('validates supported runbook definitions and rejects unknown actions', () => {
  assert.deepEqual(validateRunbookDefinition(runbook), [])
  assert.ok(validateRunbookDefinition({ ...runbook, risk: 'unknown' }).some(error => error.includes('Risk')))
  assert.ok(validateRunbookDefinition({ ...runbook, steps: [{ ...runbook.steps[0], actionType: 'restart-host' }] })
    .some(error => error.includes('unsupported action')))
})

test('recommend-only queues a runbook for explicit human approval', () => {
  assert.equal(evaluateRunbookPolicy({ config: baseConfig, runbook, executedInLastHour: 0, outsideBusinessHours: false }).status, 'pending-approval')
})

test('execution kill switch blocks work in every mode', () => {
  const config = { ...baseConfig, mode: 'autonomous-low-risk' as const, executionEnabled: false }
  const decision = evaluateRunbookPolicy({ config, runbook, executedInLastHour: 0, outsideBusinessHours: false })
  assert.equal(decision.status, 'recommended')
  assert.match(decision.reason, /disabled/)
})

test('supervised mode requires human approval even for low-risk work', () => {
  const result = evaluateRunbookPolicy({ config: { ...baseConfig, mode: 'supervised-execute' }, runbook, executedInLastHour: 0, outsideBusinessHours: false })
  assert.equal(result.status, 'pending-approval')
})

test('autonomous mode runs only allowed low-risk classes under the hourly limit', () => {
  const config = { ...baseConfig, mode: 'autonomous-low-risk' as const }
  assert.equal(evaluateRunbookPolicy({ config, runbook, executedInLastHour: 1, outsideBusinessHours: false }).status, 'executed')
  assert.equal(evaluateRunbookPolicy({ config, runbook: { ...runbook, class: 'other' }, executedInLastHour: 0, outsideBusinessHours: false }).status, 'pending-approval')
  assert.equal(evaluateRunbookPolicy({ config, runbook, executedInLastHour: 2, outsideBusinessHours: false }).status, 'pending-approval')
  assert.equal(evaluateRunbookPolicy({ config, runbook: { ...runbook, risk: 'high' as const }, executedInLastHour: 0, outsideBusinessHours: false }).status, 'pending-approval')
  assert.equal(evaluateRunbookPolicy({ config, runbook: { ...runbook, steps: [{ actionType: 'tag' }] }, executedInLastHour: 0, outsideBusinessHours: false }).status, 'pending-approval')
})

test('rollback and business-hour safety gates block automatic execution', () => {
  const config = { ...baseConfig, mode: 'autonomous-low-risk' as const }
  assert.equal(evaluateRunbookPolicy({ config, runbook: { ...runbook, rollbackPlan: '' }, executedInLastHour: 0, outsideBusinessHours: false }).status, 'pending-approval')
  assert.equal(evaluateRunbookPolicy({ config, runbook, executedInLastHour: 0, outsideBusinessHours: true }).status, 'pending-approval')
})