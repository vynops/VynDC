import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getClientIp, writeAudit } from '@/lib/audit'
import { getAutonomousConfig, saveAutonomousConfig } from '@/lib/autonomous-ops'

const MODES = ['recommend-only', 'supervised-execute', 'autonomous-low-risk'] as const

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(getAutonomousConfig())
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json() as Record<string, unknown>
    const current = getAutonomousConfig()
    const mode = body.mode ?? current.mode
    const classes = body.lowRiskAutoClasses ?? current.lowRiskAutoClasses
    const maxActions = body.maxAutoActionsPerHour ?? current.maxAutoActionsPerHour
    const policies = body.safetyPolicies && typeof body.safetyPolicies === 'object'
      ? body.safetyPolicies as Record<string, unknown>
      : current.safetyPolicies
    const requireRollbackPlan = policies.requireRollbackPlan ?? current.safetyPolicies.requireRollbackPlan
    const blockOutsideBusinessHours = policies.blockOutsideBusinessHours ?? current.safetyPolicies.blockOutsideBusinessHours

    if (!MODES.includes(mode as typeof MODES[number])) {
      return NextResponse.json({ error: 'Invalid autonomous mode' }, { status: 400 })
    }
    if (!Array.isArray(classes) || classes.some(value => typeof value !== 'string')) {
      return NextResponse.json({ error: 'lowRiskAutoClasses must be an array of strings' }, { status: 400 })
    }
    if (!Number.isInteger(maxActions) || Number(maxActions) < 1 || Number(maxActions) > 10000) {
      return NextResponse.json({ error: 'maxAutoActionsPerHour must be an integer between 1 and 10000' }, { status: 400 })
    }
    if (typeof requireRollbackPlan !== 'boolean' || typeof blockOutsideBusinessHours !== 'boolean') {
      return NextResponse.json({ error: 'Invalid safety policy values' }, { status: 400 })
    }

    const next = saveAutonomousConfig({
      mode: mode as typeof current.mode,
      lowRiskAutoClasses: classes.map(value => value.trim()).filter(Boolean),
      maxAutoActionsPerHour: Number(maxActions),
      safetyPolicies: {
        requireRollbackPlan,
        blockOutsideBusinessHours,
      },
    })
    writeAudit({
      actor: auth.email,
      action: 'autonomous.policy.update',
      detail: `${next.mode}; ${next.maxAutoActionsPerHour}/hour; ${next.lowRiskAutoClasses.length} allowed class(es)`,
      ip: getClientIp(req),
    })
    return NextResponse.json(next)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
