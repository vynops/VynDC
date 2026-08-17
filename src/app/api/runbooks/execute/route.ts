import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireRole, type SessionPayload } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import { getAutonomousConfig, type AutonomousConfig } from '@/lib/autonomous-ops'
import { loadRunbooks, loadRunbookExecutions, saveRunbookExecutions, type RunbookExecution, type Runbook } from '@/lib/runbook-store'
import { executeRunbookSteps } from '@/lib/runbook-executor'

function isOutsideBusinessHours(now = new Date()): boolean {
  const day = now.getDay() // 0 = Sunday
  const hour = now.getHours()
  const isWeekend = day === 0 || day === 6
  return isWeekend || hour < 9 || hour >= 18
}

function executedInLastHour(executions: RunbookExecution[]): number {
  const cutoff = Date.now() - 60 * 60 * 1000
  return executions.filter(e => e.status === 'executed' && new Date(e.createdAt).getTime() >= cutoff).length
}

function shouldExecute(
  config: AutonomousConfig,
  runbook: Runbook,
  recentExecutions: RunbookExecution[]
): { status: RunbookExecution['status']; reason: string } {
  const mode = config.mode
  const risk = runbook.risk
  const runbookClass = runbook.class

  if (config.safetyPolicies.requireRollbackPlan && !runbook.rollbackPlan.trim()) {
    return { status: 'pending-approval', reason: 'Rollback plan required by safety policy.' }
  }

  if (config.safetyPolicies.blockOutsideBusinessHours && isOutsideBusinessHours()) {
    return { status: 'pending-approval', reason: 'Execution blocked outside business hours by safety policy.' }
  }

  if (mode === 'recommend-only') {
    return { status: 'recommended', reason: 'Autonomous mode is recommend-only.' }
  }

  const recentAutoActions = executedInLastHour(recentExecutions)
  const autoLimitReached = recentAutoActions >= config.maxAutoActionsPerHour

  if (mode === 'supervised-execute') {
    if (risk === 'low') {
      if (autoLimitReached) {
        return { status: 'pending-approval', reason: `Auto-action hourly limit reached (${config.maxAutoActionsPerHour}/hour).` }
      }
      return { status: 'executed', reason: 'Low-risk runbook executed in supervised mode.' }
    }
    return { status: 'pending-approval', reason: 'Approval required for medium/high risk runbooks.' }
  }

  if (mode === 'autonomous-low-risk') {
    if (risk === 'low' && config.lowRiskAutoClasses.includes(runbookClass)) {
      if (autoLimitReached) {
        return { status: 'pending-approval', reason: `Auto-action hourly limit reached (${config.maxAutoActionsPerHour}/hour).` }
      }
      return { status: 'executed', reason: 'Low-risk runbook executed autonomously.' }
    }
    return { status: 'pending-approval', reason: 'Runbook outside autonomous low-risk policy scope.' }
  }

  return { status: 'pending-approval', reason: 'Unknown mode; defaulting to approval.' }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const session = auth as SessionPayload

  try {
    const body = await req.json() as { runbookId: string; incidentId?: string }
    if (!body.runbookId) {
      return NextResponse.json({ error: 'runbookId required' }, { status: 400 })
    }

    const runbook = loadRunbooks().find(r => r.id === body.runbookId && r.enabled)
    if (!runbook) return NextResponse.json({ error: 'runbook not found' }, { status: 404 })

    const config = getAutonomousConfig()
    const executions = loadRunbookExecutions()
    const decision = shouldExecute(config, runbook, executions)
    const executionId = randomUUID()

    const stepOutcome = decision.status === 'executed'
      ? await executeRunbookSteps({
          runbookName: runbook.name,
          steps: runbook.steps,
          executionId,
          incidentId: body.incidentId,
          requestedBy: session.email,
        })
      : {
          actionLog: runbook.steps.map(step => ({
            ts: new Date().toISOString(),
            stepId: step.id,
            action: 'planned',
            detail: `${step.actionType}: ${step.name}`,
          })),
          failedCount: 0,
        }

    const execution: RunbookExecution = {
      id: executionId,
      runbookId: runbook.id,
      incidentId: body.incidentId,
      requestedBy: session.email,
      mode: config.mode,
      status: decision.status,
      reason: stepOutcome.failedCount > 0
        ? `${decision.reason} (${stepOutcome.failedCount} step(s) failed)`
        : decision.reason,
      createdAt: new Date().toISOString(),
      executedAt: decision.status === 'executed' ? new Date().toISOString() : undefined,
      actionLog: stepOutcome.actionLog,
    }

    executions.unshift(execution)
    saveRunbookExecutions(executions.slice(0, 1000))

    writeAudit({
      actor: session.email,
      action: 'runbook.execute.request',
      detail: `${runbook.name} (${runbook.risk}) -> ${execution.status}`,
      ip: getClientIp(req),
    })

    if (execution.status === 'executed') {
      writeAudit({
        actor: session.email,
        action: 'runbook.execute.perform',
        detail: `${runbook.name}: ${execution.actionLog.filter(l => l.action === 'executed').length} executed, ${execution.actionLog.filter(l => l.action === 'failed').length} failed`,
        ip: getClientIp(req),
      })
    }

    return NextResponse.json(execution)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
