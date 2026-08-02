'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bot, ShieldCheck, Gauge, Save, RefreshCw,
  AlertTriangle, History, Eye, Lock, Info,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────── */

interface AutonomousConfig {
  mode: 'recommend-only' | 'supervised-execute' | 'autonomous-low-risk'
  lowRiskAutoClasses: string[]
  maxAutoActionsPerHour: number
  safetyPolicies: {
    requireRollbackPlan: boolean
    blockOutsideBusinessHours: boolean
  }
}

interface AuditEntry {
  ts: string
  actor: string
  action: string
  detail: string
  ip: string
}

/* ─── Mode explainers ────────────────────────────────────────── */

const MODE_INFO: Record<AutonomousConfig['mode'], { label: string; color: string; description: string; impact: string }> = {
  'recommend-only': {
    label: 'Recommend only',
    color: 'text-blue-300',
    description: 'The platform suggests actions but never executes them. Every decision goes to an operator.',
    impact: 'Safest. Zero automated execution. Best for regulated environments or initial rollout.',
  },
  'supervised-execute': {
    label: 'Supervised execute',
    color: 'text-amber-300',
    description: 'Low-risk runbooks are executed automatically. Medium and high-risk runbooks require admin approval.',
    impact: 'Balanced. Automates safe work while keeping humans in the loop for risky operations.',
  },
  'autonomous-low-risk': {
    label: 'Autonomous low-risk',
    color: 'text-emerald-300',
    description: 'Runbooks with a low-risk classification that belong to an allowed class are executed without human review.',
    impact: 'Most efficient. Reduces operator toil on routine remediation. Requires accurate risk tagging.',
  },
}

/* ─── Validation ─────────────────────────────────────────────── */

function validate(config: AutonomousConfig): string[] {
  const warnings: string[] = []
  if (config.mode === 'autonomous-low-risk' && config.lowRiskAutoClasses.length === 0) {
    warnings.push('Autonomous low-risk mode is active but no low-risk classes are defined — no runbooks will auto-execute.')
  }
  if (config.maxAutoActionsPerHour < 1) {
    warnings.push('Max auto actions per hour must be at least 1.')
  }
  if (config.mode === 'autonomous-low-risk' && !config.safetyPolicies.requireRollbackPlan) {
    warnings.push('Autonomous mode without a required rollback plan increases recovery risk on failure.')
  }
  return warnings
}

/* ─── Preview panel ──────────────────────────────────────────── */

function PolicyPreview({ config }: { config: AutonomousConfig }) {
  const mode = config.mode
  const scenarios = [
    { label: 'Low-risk runbook in allowed class', result: mode === 'recommend-only' ? 'Recommended' : 'Executed automatically' },
    { label: 'Low-risk runbook NOT in allowed class', result: mode === 'autonomous-low-risk' ? 'Pending approval' : mode === 'recommend-only' ? 'Recommended' : 'Executed automatically' },
    { label: 'Medium-risk runbook', result: mode === 'recommend-only' ? 'Recommended' : 'Pending approval' },
    { label: 'High-risk runbook', result: mode === 'recommend-only' ? 'Recommended' : 'Pending approval' },
  ]
  const resultColor = (r: string) =>
    r === 'Executed automatically' ? 'text-emerald-300' :
    r === 'Pending approval' ? 'text-amber-300' : 'text-blue-300'

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
        <Eye size={15} className="text-orange-400" />
        Policy preview
        <span className="ml-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">what would happen now</span>
      </div>
      <div className="space-y-2">
        {scenarios.map(s => (
          <div key={s.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-900/50 px-3 py-2">
            <span className="text-xs text-slate-300">{s.label}</span>
            <span className={`shrink-0 text-xs font-medium ${resultColor(s.result)}`}>{s.result}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────────── */

export default function AutonomousOpsPage() {
  const [config, setConfig]       = useState<AutonomousConfig | null>(null)
  const [savedConfig, setSaved]   = useState<AutonomousConfig | null>(null)   // for rollback
  const [loading, setLoading]     = useState(true)
  const [loadErr, setLoadErr]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [feedback, setFeedback]   = useState('')
  const [feedbackOk, setFeedbackOk] = useState(true)
  const [auditLog, setAuditLog]   = useState<AuditEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [me, setMe]               = useState<{ role?: string } | null>(null)

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }

  function flash(msg: string, ok = true) {
    setFeedback(msg); setFeedbackOk(ok)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setFeedback(''), 6000)
  }

  async function loadData() {
    setLoadErr('')
    try {
      const [cfgRes, meRes] = await Promise.all([
        fetch('/api/autonomous', { cache: 'no-store' }),
        fetch('/api/auth/me', { cache: 'no-store' }),
      ])
      if (!cfgRes.ok) throw new Error('Failed to load autonomous config')
      const cfg  = await cfgRes.json()
      const user = meRes.ok ? await meRes.json() : null
      setConfig(cfg)
      setSaved(cfg)
      setMe(user)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function loadAudit() {
    setLoadingAudit(true)
    try {
      const res = await fetch('/api/audit?limit=50', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const entries: AuditEntry[] = await res.json()
      setAuditLog(entries.filter(e => e.action.startsWith('autonomous') || e.action.startsWith('runbook')))
    } catch {
      setAuditLog([])
    } finally {
      setLoadingAudit(false)
    }
  }

  useEffect(() => {
    void loadData()
    void loadAudit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveConfig() {
    if (!config) return
    const warnings = validate(config)
    if (warnings.length > 0) {
      // Still allow saving, but show them — validation is advisory
    }
    setSaving(true)
    const prev = savedConfig
    try {
      const res  = await fetch('/api/autonomous', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unable to save settings')
      setSaved(data)
      setConfig(data)
      flash('Policy saved. Runbook execution behaviour updated immediately.')
      void loadAudit()
    } catch (e) {
      // Rollback UI state
      if (prev) setConfig(prev)
      flash(e instanceof Error ? e.message : 'Save failed — changes reverted.', false)
    } finally {
      setSaving(false)
    }
  }

  const isAdmin    = me?.role === 'admin'
  const warnings   = config ? validate(config) : []
  const modeInfo   = config ? MODE_INFO[config.mode] : null

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/70 p-10 text-center text-sm text-slate-500">
          Loading autonomous settings…
        </div>
      </div>
    )
  }

  if (loadErr || !config) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-4 flex items-center gap-3 text-sm text-rose-300">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="flex-1">{loadErr || 'Unable to load autonomous configuration.'}</span>
          <button onClick={() => { setLoading(true); void loadData() }} className="underline text-rose-400 hover:text-rose-200 shrink-0">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-orange-400">
              <Bot size={16} />
              <h2 className="text-lg font-semibold text-white">Autonomous Ops</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">Control how the platform recommends, approves, and executes runbooks.</p>
          </div>
          <div className="flex items-center gap-2">
            {!isAdmin && (
              <span className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-400">
                <Lock size={11} /> Admin only
              </span>
            )}
            <button onClick={() => void saveConfig()} disabled={saving || !isAdmin}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-60 disabled:cursor-not-allowed">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Save policy
            </button>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${feedbackOk ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
          {feedback}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-200">
              <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Execution mode */}
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
              <Gauge size={15} className="text-orange-400" />
              Execution mode
            </div>

            {/* Mode selector cards */}
            <div className="space-y-2 mb-4">
              {(Object.keys(MODE_INFO) as AutonomousConfig['mode'][]).map(mode => {
                const info = MODE_INFO[mode]
                const active = config.mode === mode
                return (
                  <button key={mode} disabled={!isAdmin}
                    onClick={() => setConfig({ ...config, mode })}
                    className={`w-full rounded-xl border text-left px-4 py-3 transition-colors disabled:cursor-not-allowed ${active ? 'border-orange-500/50 bg-orange-500/10' : 'border-slate-800/70 bg-slate-900/40 hover:border-slate-700'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>{info.label}</span>
                      {active && <span className="rounded-full bg-orange-500/30 px-1.5 py-0.5 text-[10px] text-orange-300 uppercase tracking-[0.15em]">active</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{info.description}</p>
                    <p className={`mt-1 text-xs ${info.color}`}>{info.impact}</p>
                  </button>
                )
              })}
            </div>

            {/* Mode explainer callout */}
            {modeInfo && (
              <div className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-3 py-2 flex items-start gap-2 text-xs text-slate-400">
                <Info size={13} className="text-orange-400 mt-0.5 shrink-0" />
                <span>{modeInfo.impact}</span>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">
                  Low-risk auto classes
                  <span className="ml-2 text-slate-600">comma-separated class identifiers that are eligible for autonomous execution</span>
                </span>
                <input disabled={!isAdmin}
                  value={config.lowRiskAutoClasses.join(', ')}
                  onChange={e => setConfig({ ...config, lowRiskAutoClasses: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">
                  Max auto actions per hour
                  <span className="ml-2 text-slate-600">rate limiter for autonomous execution</span>
                </span>
                <input disabled={!isAdmin} type="number" min={1}
                  value={config.maxAutoActionsPerHour}
                  onChange={e => setConfig({ ...config, maxAutoActionsPerHour: Math.max(1, Number(e.target.value)) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                />
              </label>
            </div>
          </div>

          {/* Safety policy */}
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
              <ShieldCheck size={15} className="text-orange-400" />
              Safety policy
            </div>
            <div className="space-y-3">
              <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${config.safetyPolicies.requireRollbackPlan ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-800/70 bg-slate-900/40'}`}>
                <input type="checkbox" disabled={!isAdmin}
                  checked={config.safetyPolicies.requireRollbackPlan}
                  onChange={e => setConfig({ ...config, safetyPolicies: { ...config.safetyPolicies, requireRollbackPlan: e.target.checked } })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 shrink-0"
                />
                <div>
                  <div className="text-sm font-medium text-slate-200">Require rollback plan</div>
                  <div className="text-xs text-slate-500 mt-0.5">Runbooks without a defined rollback plan will be blocked from autonomous execution.</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${config.safetyPolicies.blockOutsideBusinessHours ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-800/70 bg-slate-900/40'}`}>
                <input type="checkbox" disabled={!isAdmin}
                  checked={config.safetyPolicies.blockOutsideBusinessHours}
                  onChange={e => setConfig({ ...config, safetyPolicies: { ...config.safetyPolicies, blockOutsideBusinessHours: e.target.checked } })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 shrink-0"
                />
                <div>
                  <div className="text-sm font-medium text-slate-200">Block outside business hours</div>
                  <div className="text-xs text-slate-500 mt-0.5">Autonomous execution is suspended outside of standard business hours (09:00–18:00 local time).</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Policy preview */}
          <PolicyPreview config={config} />

          {/* Audit / policy change history */}
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <History size={15} className="text-orange-400" />
                Policy & execution audit
              </div>
              <button onClick={() => void loadAudit()} disabled={loadingAudit}
                className="rounded-lg border border-slate-700 p-1 text-slate-400 hover:text-white disabled:opacity-50">
                <RefreshCw size={12} className={loadingAudit ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {auditLog.length === 0 ? (
                <div className="text-xs text-slate-500 py-3 text-center">
                  {loadingAudit ? 'Loading…' : 'No policy or execution audit entries yet.'}
                </div>
              ) : auditLog.map((entry, i) => (
                <div key={i} className="rounded-lg border border-slate-800/70 bg-slate-900/50 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-medium text-orange-400 uppercase tracking-[0.15em] shrink-0">{entry.action}</span>
                    <span className="text-[10px] text-slate-600 shrink-0">{fmtTime(entry.ts)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-300">{entry.detail}</p>
                  <p className="text-[10px] text-slate-600">{entry.actor} · {entry.ip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
