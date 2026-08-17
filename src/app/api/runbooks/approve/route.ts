import { NextRequest, NextResponse } from 'next/server'
import { requireRole, type SessionPayload } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import { getAutonomousConfig } from '@/lib/autonomous-ops'
import { executeRunbookSteps } from '@/lib/runbook-executor'
import { loadRunbookExecutions, saveRunbookExecutions, loadRunbooks } from '@/lib/runbook-store'

function isOutsideBusinessHours(now = new Date()): boolean {
  const day = now.getDay()
  const hour = now.getHours()
  return day === 0 || day === 6 || hour < 9 || hour >= 18
}

function executedInLastHour(executions: ReturnType<typeof loadRunbookExecutions>): number {
  const cutoff = Date.now() - 60 * 60 * 1000
  return executions.filter(e => e.status === 'executed' && new Date(e.createdAt).getTime() >= cutoff).length
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const session = auth as SessionPayload

  try {
    const body = await req.json() as { executionId: string; approve: boolean }
    if (!body.executionId) {
      return NextResponse.json({ error: 'executionId required' }, { status: 400 })
    }

    const executions = loadRunbookExecutions()
    const idx = executions.findIndex(e => e.id === body.executionId)
    if (idx < 0) return NextResponse.json({ error: 'execution not found' }, { status: 404 })

    const current = executions[idx]
    if (current.status !== 'pending-approval') {
      return NextResponse.json({ error: 'execution is not pending approval' }, { status: 400 })
    }

    const runbook = loadRunbooks().find(r => r.id === current.runbookId)
    if (!runbook) {
      return NextResponse.json({ error: 'runbook not found' }, { status: 404 })
    }

    const cfg = getAutonomousConfig()
    if (body.approve) {
      if (cfg.safetyPolicies.requireRollbackPlan && !runbook.rollbackPlan.trim()) {
        return NextResponse.json({ error: 'Approval blocked: rollback plan is required by safety policy.' }, { status: 400 })
      }
      if (cfg.safetyPolicies.blockOutsideBusinessHours && isOutsideBusinessHours()) {
        return NextResponse.json({ error: 'Approval blocked outside business hours by safety policy.' }, { status: 400 })
      }
      if (executedInLastHour(executions) >= cfg.maxAutoActionsPerHour) {
        return NextResponse.json({ error: `Approval blocked: auto-action hourly limit reached (${cfg.maxAutoActionsPerHour}/hour).` }, { status: 400 })
      }
    }

    const stepOutcome = body.approve
      ? await executeRunbookSteps({
          runbookName: runbook.name,
          steps: runbook.steps,
          executionId: current.id,
          incidentId: current.incidentId,
          requestedBy: current.requestedBy,
        })
      : { actionLog: current.actionLog, failedCount: 0 }

    const now = new Date().toISOString()
    executions[idx] = {
      ...current,
      status: body.approve ? 'executed' : 'rejected',
      approvedBy: session.email,
      approvedAt: now,
      executedAt: body.approve ? now : current.executedAt,
      actionLog: [
        {
          ts: now,
          stepId: 'approval-gate',
          action: body.approve ? 'approved' : 'rejected',
          detail: `Decision by ${session.email}`,
        },
        ...(body.approve ? stepOutcome.actionLog : current.actionLog),
      ],
      reason: body.approve && stepOutcome.failedCount > 0
        ? `${current.reason} (${stepOutcome.failedCount} step(s) failed during approval execution)`
        : current.reason,
    }

    saveRunbookExecutions(executions)

    writeAudit({
      actor: session.email,
      action: body.approve ? 'runbook.execute.approve' : 'runbook.execute.reject',
      detail: `${current.runbookId} -> ${body.approve ? 'executed' : 'rejected'}`,
      ip: getClientIp(req),
    })

    if (body.approve) {
      writeAudit({
        actor: session.email,
        action: 'runbook.execute.perform',
        detail: `${current.runbookId}: ${stepOutcome.actionLog.filter(a => a.action === 'executed').length} executed, ${stepOutcome.actionLog.filter(a => a.action === 'failed').length} failed`,
        ip: getClientIp(req),
      })
    }

    return NextResponse.json(executions[idx])
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
