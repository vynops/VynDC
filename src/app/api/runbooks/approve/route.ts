import { NextRequest, NextResponse } from 'next/server'
import { requireRole, type SessionPayload } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import { loadRunbookExecutions, saveRunbookExecutions } from '@/lib/runbook-store'

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
        ...current.actionLog,
      ],
    }

    saveRunbookExecutions(executions)

    writeAudit({
      actor: session.email,
      action: body.approve ? 'runbook.execute.approve' : 'runbook.execute.reject',
      detail: `${current.runbookId} -> ${body.approve ? 'executed' : 'rejected'}`,
      ip: getClientIp(req),
    })

    return NextResponse.json(executions[idx])
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
