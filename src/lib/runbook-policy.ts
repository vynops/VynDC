export type RunbookPolicyMode = 'recommend-only' | 'supervised-execute' | 'autonomous-low-risk'
export type RunbookPolicyStatus = 'recommended' | 'pending-approval' | 'executed'

export interface RunbookPolicyConfig {
  mode: RunbookPolicyMode
  executionEnabled: boolean
  lowRiskAutoClasses: string[]
  maxAutoActionsPerHour: number
  safetyPolicies: {
    requireRollbackPlan: boolean
    blockOutsideBusinessHours: boolean
  }
}

export interface RunbookPolicyDefinition {
  risk: 'low' | 'medium' | 'high'
  class: string
  rollbackPlan: string
  steps: Array<{ actionType: string }>
}

const ACTION_TYPES = new Set(['notify', 'incident-note', 'assign-owner', 'tag'])
const RISKS = new Set(['low', 'medium', 'high'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateRunbookDefinition(value: unknown): string[] {
  if (!isRecord(value)) return ['Runbook must be an object.']

  const errors: string[] = []
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('ID is required.')
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('Name is required.')
  if (typeof value.class !== 'string' || !value.class.trim()) errors.push('Class is required.')
  if (typeof value.description !== 'string') errors.push('Description must be text.')
  if (typeof value.risk !== 'string' || !RISKS.has(value.risk)) errors.push('Risk must be low, medium, or high.')
  if (typeof value.rollbackPlan !== 'string') errors.push('Rollback plan must be text.')
  if (typeof value.enabled !== 'boolean') errors.push('Enabled must be a boolean.')
  if (!Array.isArray(value.steps) || value.steps.length > 50) {
    errors.push('Steps must be an array with no more than 50 entries.')
  } else {
    const ids = new Set<string>()
    for (const [index, step] of value.steps.entries()) {
      if (!isRecord(step)) {
        errors.push(`Step ${index + 1} must be an object.`)
        continue
      }
      if (typeof step.id !== 'string' || !step.id.trim() || ids.has(step.id)) {
        errors.push(`Step ${index + 1} must have a unique ID.`)
      } else {
        ids.add(step.id)
      }
      if (typeof step.name !== 'string' || !step.name.trim()) errors.push(`Step ${index + 1} needs a name.`)
      if (typeof step.actionType !== 'string' || !ACTION_TYPES.has(step.actionType)) {
        errors.push(`Step ${index + 1} has an unsupported action.`)
      }
      if (!isRecord(step.payload) || Object.values(step.payload).some(item => typeof item !== 'string')) {
        errors.push(`Step ${index + 1} payload must contain only text values.`)
      } else if (step.actionType === 'tag' && (typeof step.payload.tag !== 'string' || !step.payload.tag.trim())) {
        errors.push(`Step ${index + 1} tag is required.`)
      }
    }
  }
  return errors
}

export function evaluateRunbookPolicy(params: {
  config: RunbookPolicyConfig
  runbook: RunbookPolicyDefinition
  executedInLastHour: number
  outsideBusinessHours: boolean
}): { status: RunbookPolicyStatus; reason: string } {
  const { config, runbook, executedInLastHour, outsideBusinessHours } = params

  if (!config.executionEnabled) {
    return { status: 'recommended', reason: 'Runbook execution is disabled by the administrator.' }
  }
  if (config.safetyPolicies.requireRollbackPlan && !runbook.rollbackPlan.trim()) {
    return { status: 'pending-approval', reason: 'Rollback plan required by safety policy.' }
  }
  if (config.safetyPolicies.blockOutsideBusinessHours && outsideBusinessHours) {
    return { status: 'pending-approval', reason: 'Execution blocked outside business hours by safety policy.' }
  }
  if (config.mode === 'recommend-only') {
    return { status: 'pending-approval', reason: 'Recommend-only mode requires operator approval before execution.' }
  }
  if (config.mode === 'supervised-execute') {
    return { status: 'pending-approval', reason: 'Human approval is required in supervised mode.' }
  }
  const notificationOnly = runbook.steps.length > 0 && runbook.steps.every(step => step.actionType === 'notify')
  if (config.mode === 'autonomous-low-risk' && runbook.risk === 'low' && config.lowRiskAutoClasses.includes(runbook.class) && notificationOnly) {
    if (executedInLastHour >= config.maxAutoActionsPerHour) {
      return { status: 'pending-approval', reason: `Auto-action hourly limit reached (${config.maxAutoActionsPerHour}/hour).` }
    }
    return { status: 'executed', reason: 'Low-risk runbook executed autonomously.' }
  }
  if (config.mode === 'autonomous-low-risk' && !notificationOnly && runbook.risk === 'low' && config.lowRiskAutoClasses.includes(runbook.class)) {
    return { status: 'pending-approval', reason: 'Automatic execution is limited to notification-only runbooks.' }
  }
  return { status: 'pending-approval', reason: 'Runbook outside autonomous low-risk policy scope.' }
}