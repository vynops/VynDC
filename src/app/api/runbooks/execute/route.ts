import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireRole, type SessionPayload } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import { getAutonomousConfig } from '@/lib/autonomous-ops'
import { loadRunbooks, loadRunbookExecutions, saveRunbookExecutions, type RunbookExecution } from '@/lib/runbook-store'

function shouldExecute(mode: string, risk: 'low' | 'medium' | 'high', runbookClass: string, lowRiskAutoClasses: string[]): { status: RunbookExecution['status']; reason: string } {
  if (mode === 'recommend-only') {
    return { status: 'recommended', reason: 'Autonomous mode is recommend-only.' }
  }

  if (mode === 'supervised-execute') {
    if (risk === 'low') return { status: 'executed', reason: 'Low-risk runbook executed in supervised mode.' }
    return { status: 'pending-approval', reason: 'Approval required for medium/high risk runbooks.' }
  }

  if (mode === 'autonomous-low-risk') {
    if (risk === 'low' && lowRiskAutoClasses.includes(runbookClass)) {
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
    const decision = shouldExecute(config.mode, runbook.risk, runbook.class, config.lowRiskAutoClasses)

    const execution: RunbookExecution = {
      id: randomUUID(),
      runbookId: runbook.id,
      incidentId: body.incidentId,
      requestedBy: session.email,
      mode: config.mode,
      status: decision.status,
      reason: decision.reason,
      createdAt: new Date().toISOString(),
      executedAt: decision.status === 'executed' ? new Date().toISOString() : undefined,
      actionLog: runbook.steps.map(step => ({
        ts: new Date().toISOString(),
        stepId: step.id,
        action: decision.status === 'executed' ? 'executed' : 'planned',
        detail: `${step.actionType}: ${step.name}`,
      })),
    }

    const executions = loadRunbookExecutions()
    executions.unshift(execution)
    saveRunbookExecutions(executions.slice(0, 1000))

    writeAudit({
      actor: session.email,
      action: 'runbook.execute.request',
      detail: `${runbook.name} (${runbook.risk}) -> ${execution.status}`,
      ip: getClientIp(req),
    })

    return NextResponse.json(execution)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
