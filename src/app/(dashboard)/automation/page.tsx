'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PlayCircle, ShieldCheck, RefreshCw, AlertTriangle, Clock3,
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, HourglassIcon, Search, Filter, X,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────── */

interface RunbookStep {
  id: string
  name: string
  actionType: 'notify' | 'incident-note' | 'assign-owner' | 'tag'
  payload: Record<string, string>
}

interface Runbook {
  id: string
  name: string
  description: string
  class: string
  risk: 'low' | 'medium' | 'high'
  rollbackPlan: string
  enabled: boolean
  steps: RunbookStep[]
}

interface RunbookExecution {
  id: string
  runbookId: string
  incidentId?: string
  requestedBy: string
  mode: string
  status: 'recommended' | 'pending-approval' | 'executed' | 'rejected'
  reason: string
  createdAt: string
  approvedBy?: string
  approvedAt?: string
  executedAt?: string
  actionLog: Array<{ ts: string; stepId: string; action: string; detail: string }>
}

/* ─── Helpers ────────────────────────────────────────────────── */

const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const STATUS_META: Record<string, { label: string; style: string; icon: React.ReactNode }> = {
  executed:         { label: 'Executed',        style: 'text-emerald-300', icon: <CheckCircle2 size={13} className="text-emerald-400" /> },
  recommended:      { label: 'Recommended',     style: 'text-blue-300',    icon: <CheckCircle2 size={13} className="text-blue-400" /> },
  'pending-approval': { label: 'Pending approval', style: 'text-amber-300', icon: <HourglassIcon size={13} className="text-amber-400" /> },
  rejected:         { label: 'Rejected',        style: 'text-rose-300',    icon: <XCircle size={13} className="text-rose-400" /> },
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

const BLANK: Omit<Runbook, 'id'> = {
  name: '', description: '', class: '', risk: 'low',
  rollbackPlan: '', enabled: true, steps: [],
}

/* ─── Execution accordion card ───────────────────────────────── */

function ExecutionCard({
  execution, runbooks, onApprove, onReject,
}: {
  execution: RunbookExecution
  runbooks: Runbook[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rb = runbooks.find(r => r.id === execution.runbookId)
  const s = STATUS_META[execution.status] ?? STATUS_META.recommended

  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-900/50">
      <button onClick={() => setOpen(v => !v)} className="flex w-full items-start gap-3 px-3 py-3 text-left">
        <div className="mt-0.5 shrink-0">{s.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white">{rb?.name ?? execution.runbookId}</span>
            <span className={`text-[10px] uppercase tracking-[0.15em] ${s.style}`}>{s.label}</span>
            {execution.incidentId && <span className="text-[10px] text-slate-500">incident: {execution.incidentId}</span>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{execution.reason}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-600">
            <span>by {execution.requestedBy}</span>
            <span>{fmtTime(execution.createdAt)}</span>
            {execution.approvedBy && <span>approved by {execution.approvedBy}</span>}
          </div>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-500 mt-1 shrink-0" /> : <ChevronDown size={14} className="text-slate-500 mt-1 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-800/70 px-3 py-3 space-y-3">
          {execution.status === 'pending-approval' && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <HourglassIcon size={13} className="text-amber-400 shrink-0" />
              <span className="flex-1 text-xs text-amber-200">Awaiting admin approval before execution.</span>
              <button onClick={() => onApprove(execution.id)} className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-400">Approve</button>
              <button onClick={() => onReject(execution.id)} className="rounded-md bg-rose-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-400">Reject</button>
            </div>
          )}
          {execution.actionLog.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Action log</div>
              <ul className="space-y-1.5">
                {execution.actionLog.map((entry, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-400/70 shrink-0" />
                    <span className="text-slate-500 shrink-0">{fmtTime(entry.ts)}</span>
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-slate-400">— {entry.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {execution.executedAt && (
            <div className="text-[10px] text-slate-600">Executed at: {fmtTime(execution.executedAt)}</div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Runbook form modal ──────────────────────────────────────── */

function RunbookModal({ initial, onSave, onClose }: {
  initial: Partial<Runbook>
  onSave: (r: Partial<Runbook>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<Omit<Runbook, 'id'>>({ ...BLANK, ...initial })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function field<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }
  function addStep() {
    field('steps', [...form.steps, { id: `step-${Date.now()}`, name: '', actionType: 'notify', payload: {} }])
  }
  function removeStep(idx: number) { field('steps', form.steps.filter((_, i) => i !== idx)) }
  function stepField(idx: number, key: keyof RunbookStep, val: string) {
    field('steps', form.steps.map((s, i) => i === idx ? { ...s, [key]: val } : s))
  }

  async function submit() {
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!form.class.trim()) { setErr('Class is required'); return }
    setSaving(true); setErr('')
    try { await onSave({ ...form, id: (initial as Runbook).id }) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h3 className="text-sm font-semibold text-white">{(initial as Runbook).id ? 'Edit runbook' : 'New runbook'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {err && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div>}
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Name *</span>
            <input value={form.name} onChange={e => field('name', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Description</span>
            <textarea value={form.description} onChange={e => field('description', e.target.value)} rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white resize-none" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Class *</span>
              <input value={form.class} onChange={e => field('class', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Risk</span>
              <select value={form.risk} onChange={e => field('risk', e.target.value as Runbook['risk'])}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Rollback plan</span>
            <input value={form.rollbackPlan} onChange={e => field('rollbackPlan', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={e => field('enabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
            <span>Enabled</span>
          </label>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Steps</span>
              <button onClick={addStep} className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300">
                <Plus size={12} /> Add step
              </button>
            </div>
            <div className="space-y-2">
              {form.steps.map((step, idx) => (
                <div key={step.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 flex gap-2">
                  <input value={step.name} onChange={e => stepField(idx, 'name', e.target.value)}
                    placeholder="Step name"
                    className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
                  <select value={step.actionType} onChange={e => stepField(idx, 'actionType', e.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white">
                    <option value="notify">notify</option>
                    <option value="incident-note">incident-note</option>
                    <option value="assign-owner">assign-owner</option>
                    <option value="tag">tag</option>
                  </select>
                  <button onClick={() => removeStep(idx)} className="text-rose-400 hover:text-rose-300 shrink-0"><X size={14} /></button>
                </div>
              ))}
              {form.steps.length === 0 && <div className="text-xs text-slate-600 py-1">No steps yet.</div>}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white">Cancel</button>
          <button onClick={() => void submit()} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-60">
            {saving && <RefreshCw size={13} className="animate-spin" />}
            Save runbook
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────────── */

export default function AutomationPage() {
  const [runbooks, setRunbooks]     = useState<Runbook[]>([])
  const [executions, setExecutions] = useState<RunbookExecution[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [busyId, setBusyId]         = useState<string | null>(null)
  const [feedback, setFeedback]     = useState('')
  const [feedbackOk, setFeedbackOk] = useState(true)

  // filters
  const [filterRisk, setFilterRisk]       = useState<'all'|'low'|'medium'|'high'>('all')
  const [filterClass, setFilterClass]     = useState('')
  const [filterEnabled, setFilterEnabled] = useState<'all'|'yes'|'no'>('all')
  const [execSearch, setExecSearch]       = useState('')

  // expanded steps
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  // modal
  const [showModal, setShowModal]         = useState(false)
  const [editingRb, setEditingRb]         = useState<Partial<Runbook> | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [rbRes, exRes] = await Promise.all([
        fetch('/api/runbooks', { cache: 'no-store' }),
        fetch('/api/runbooks/executions?limit=50', { cache: 'no-store' }),
      ])
      if (!rbRes.ok || !exRes.ok) throw new Error('Server returned an error')
      const [rb, ex] = await Promise.all([rbRes.json(), exRes.json()])
      setRunbooks(Array.isArray(rb) ? rb : [])
      setExecutions(Array.isArray(ex) ? ex : [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
    timer.current = setInterval(() => { void loadData() }, 30_000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [loadData])

  function flash(msg: string, ok = true) {
    setFeedback(msg); setFeedbackOk(ok)
    setTimeout(() => setFeedback(''), 5000)
  }

  async function executeRunbook(runbookId: string) {
    setBusyId(runbookId)
    try {
      const res  = await fetch('/api/runbooks/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runbookId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Execution failed')
      flash(`${data.status}: ${data.reason}`)
      await loadData()
    } catch (e) { flash(e instanceof Error ? e.message : 'Execution failed', false) }
    finally { setBusyId(null) }
  }

  async function approveExecution(executionId: string, approve: boolean) {
    try {
      const res  = await fetch('/api/runbooks/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ executionId, approve }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      flash(approve ? 'Execution approved.' : 'Execution rejected.')
      await loadData()
    } catch (e) { flash(e instanceof Error ? e.message : 'Action failed', false) }
  }

  async function saveRunbook(r: Partial<Runbook>) {
    const res  = await fetch('/api/runbooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Save failed')
    flash(`Runbook "${data.name}" saved.`)
    setShowModal(false); setEditingRb(null)
    await loadData()
  }

  async function deleteRunbook(id: string) {
    try {
      const res = await fetch(`/api/runbooks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      flash('Runbook deleted.')
      setConfirmDelete(null)
      await loadData()
    } catch (e) { flash(e instanceof Error ? e.message : 'Delete failed', false) }
  }

  function toggleSteps(id: string) {
    setExpandedSteps(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filteredRunbooks = runbooks.filter(r => {
    if (filterRisk !== 'all' && r.risk !== filterRisk) return false
    if (filterClass && !r.class.toLowerCase().includes(filterClass.toLowerCase())) return false
    if (filterEnabled === 'yes' && !r.enabled) return false
    if (filterEnabled === 'no' && r.enabled) return false
    return true
  })

  const filteredExecutions = executions.filter(e => {
    if (!execSearch) return true
    const rb = runbooks.find(r => r.id === e.runbookId)
    return `${rb?.name ?? e.runbookId} ${e.status} ${e.requestedBy} ${e.incidentId ?? ''}`.toLowerCase().includes(execSearch.toLowerCase())
  })

  const pendingCount = executions.filter(e => e.status === 'pending-approval').length

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-orange-400">
              <PlayCircle size={16} />
              <h2 className="text-lg font-semibold text-white">Automation & Runbook Framework</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">Manage reusable runbooks and trigger execution workflows.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {pendingCount > 0 && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                {pendingCount} pending approval
              </span>
            )}
            <span className="rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-400">
              <span className="text-emerald-400">●</span> {runbooks.filter(r => r.enabled).length} active
            </span>
            <button onClick={() => void loadData()} title="Refresh"
              className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-white">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setEditingRb({}); setShowModal(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-400">
              <Plus size={14} /> New runbook
            </button>
          </div>
        </div>
      </div>

      {/* Feedback / error */}
      {feedback && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${feedbackOk ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => void loadData()} className="underline text-rose-400 hover:text-rose-200 shrink-0">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/70 p-10 text-center text-sm text-slate-500">Loading runbooks…</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          {/* Runbooks */}
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2.5 flex flex-wrap gap-2 items-center">
              <Filter size={13} className="text-slate-500 shrink-0" />
              <select value={filterRisk} onChange={e => setFilterRisk(e.target.value as typeof filterRisk)}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                <option value="all">All risk</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input value={filterClass} onChange={e => setFilterClass(e.target.value)}
                placeholder="Filter by class…"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 w-36" />
              <select value={filterEnabled} onChange={e => setFilterEnabled(e.target.value as typeof filterEnabled)}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                <option value="all">All state</option>
                <option value="yes">Enabled</option>
                <option value="no">Disabled</option>
              </select>
              {(filterRisk !== 'all' || filterClass || filterEnabled !== 'all') && (
                <button onClick={() => { setFilterRisk('all'); setFilterClass(''); setFilterEnabled('all') }}
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                  <X size={12} /> Clear
                </button>
              )}
              <span className="ml-auto text-xs text-slate-600">{filteredRunbooks.length} / {runbooks.length}</span>
            </div>

            {filteredRunbooks.length === 0 && !loading && (
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/70 p-8 text-center text-sm text-slate-500">
                {runbooks.length === 0 ? 'No runbooks yet. Create your first one.' : 'No runbooks match the current filters.'}
              </div>
            )}

            {filteredRunbooks.map(runbook => {
              const stepsOpen = expandedSteps.has(runbook.id)
              return (
                <div key={runbook.id} className={`rounded-2xl border bg-slate-950/70 p-4 transition-opacity ${runbook.enabled ? 'border-slate-800/70' : 'border-slate-800/40 opacity-60'}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white">{runbook.name}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${RISK_STYLES[runbook.risk]}`}>
                          {runbook.risk}
                        </span>
                        {!runbook.enabled && (
                          <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-500 uppercase tracking-[0.18em]">disabled</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{runbook.description}</p>
                      <p className="mt-1 text-[10px] text-slate-600">class: {runbook.class}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setEditingRb(runbook); setShowModal(true) }} title="Edit"
                        className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-white">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setConfirmDelete(runbook.id)} title="Delete"
                        className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-rose-400">
                        <Trash2 size={13} />
                      </button>
                      <button onClick={() => void executeRunbook(runbook.id)} disabled={busyId === runbook.id || !runbook.enabled}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed">
                        {busyId === runbook.id ? <RefreshCw size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                        Execute
                      </button>
                    </div>
                  </div>

                  {/* Steps accordion */}
                  <button onClick={() => toggleSteps(runbook.id)}
                    className="mt-3 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300">
                    <ShieldCheck size={12} />
                    {runbook.steps.length} step{runbook.steps.length !== 1 ? 's' : ''}
                    {stepsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {stepsOpen && (
                    <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
                      {runbook.steps.length === 0 ? (
                        <p className="text-xs text-slate-600">No steps defined.</p>
                      ) : (
                        <ul className="space-y-2">
                          {runbook.steps.map((step, i) => (
                            <li key={step.id} className="flex items-center gap-2 text-xs text-slate-300">
                              <span className="rounded-full bg-orange-500/25 text-orange-300 px-1.5 py-0.5 text-[10px] font-bold shrink-0">{i + 1}</span>
                              <span className="font-medium">{step.name}</span>
                              <span className="text-slate-500 ml-auto shrink-0">({step.actionType})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {runbook.rollbackPlan && (
                        <div className="mt-3 border-t border-slate-800/60 pt-2 text-xs text-slate-500">
                          ↩ Rollback: {runbook.rollbackPlan}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Executions sidebar */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                <Clock3 size={15} className="text-orange-400" />
                Execution history
              </div>
              <div className="relative mb-3">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={execSearch} onChange={e => setExecSearch(e.target.value)}
                  placeholder="Search executions…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white" />
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {filteredExecutions.length === 0 ? (
                  <div className="text-xs text-slate-500 py-3 text-center">No executions yet.</div>
                ) : filteredExecutions.map(execution => (
                  <ExecutionCard key={execution.id} execution={execution} runbooks={runbooks}
                    onApprove={id => void approveExecution(id, true)}
                    onReject={id => void approveExecution(id, false)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
                <AlertTriangle size={15} className="text-amber-400" />
                Execution guidance
              </div>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0">●</span>Low-risk runbooks execute directly in supervised mode.</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 shrink-0">●</span>Medium/high-risk runbooks require admin approval.</li>
                <li className="flex items-start gap-2"><span className="text-blue-400 shrink-0">●</span>In recommend-only mode, execution is advisory only.</li>
                <li className="flex items-start gap-2"><span className="text-purple-400 shrink-0">●</span>Autonomous policy is set on the Autonomous Ops page.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <Trash2 size={18} className="text-rose-400" />
              <h3 className="text-sm font-semibold text-white">Delete runbook?</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">This is permanent and cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white">Cancel</button>
              <button onClick={() => void deleteRunbook(confirmDelete)} className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-medium text-white hover:bg-rose-400">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Runbook form modal */}
      {showModal && editingRb !== null && (
        <RunbookModal initial={editingRb} onSave={saveRunbook}
          onClose={() => { setShowModal(false); setEditingRb(null) }} />
      )}
    </div>
  )
}
