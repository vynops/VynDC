'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock, Plus, Trash2, RefreshCw, AlertTriangle,
  BellOff, Clock3, ShieldOff, CheckCircle2, X,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────── */

type MaintenanceScope = 'all' | 'host' | 'rack' | 'category'

interface MaintenanceWindow {
  id: string
  title: string
  description: string
  scope: MaintenanceScope
  scopeValues: string[]
  startsAt: string
  endsAt: string
  suppressAlerts: boolean
  pauseSla: boolean
  createdBy: string
  createdAt: string
}

/* ─── Helpers ────────────────────────────────────────────────── */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function windowStatus(w: MaintenanceWindow): 'active' | 'upcoming' | 'expired' {
  const now = new Date()
  if (new Date(w.endsAt) <= now) return 'expired'
  if (new Date(w.startsAt) <= now) return 'active'
  return 'upcoming'
}

const STATUS_STYLE = {
  active:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  upcoming: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  expired:  'bg-slate-800/60 text-slate-500 border-slate-700/40',
}

const SCOPE_LABELS: Record<MaintenanceScope, string> = {
  all: 'Entire datacenter',
  host: 'Specific hosts',
  rack: 'Specific racks',
  category: 'Alert categories',
}

const CATEGORY_OPTIONS = ['hardware', 'thermal', 'power', 'network', 'storage', 'prediction']

/* ─── Window form modal ──────────────────────────────────────── */

function toLocalDatetimeValue(iso?: string): string {
  if (!iso) return ''
  // Convert ISO to local datetime-local input value
  const d = new Date(iso)
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

function fromLocalDatetimeValue(val: string): string {
  // Convert datetime-local value to ISO string
  return new Date(val).toISOString()
}

interface FormState {
  title: string
  description: string
  scope: MaintenanceScope
  scopeValues: string
  startsAt: string
  endsAt: string
  suppressAlerts: boolean
  pauseSla: boolean
}

const BLANK_FORM: FormState = {
  title: '',
  description: '',
  scope: 'all',
  scopeValues: '',
  startsAt: toLocalDatetimeValue(new Date(Date.now() + 5 * 60000).toISOString()),
  endsAt: toLocalDatetimeValue(new Date(Date.now() + 2 * 3600000).toISOString()),
  suppressAlerts: true,
  pauseSla: true,
}

function CreateModal({ onSave, onClose }: {
  onSave: (f: FormState) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<FormState>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!form.title.trim()) { setErr('Title is required'); return }
    if (!form.startsAt || !form.endsAt) { setErr('Start and end time are required'); return }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) { setErr('End time must be after start time'); return }
    setSaving(true); setErr('')
    try { await onSave(form) } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const showScopeValues = form.scope !== 'all'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-orange-400">
            <CalendarClock size={15} />
            <h3 className="text-sm font-semibold text-white">New maintenance window</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {err && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Title *</span>
            <input value={form.title} onChange={e => field('title', e.target.value)}
              placeholder="e.g. Rack-04 hardware swap"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Description</span>
            <textarea value={form.description} onChange={e => field('description', e.target.value)}
              placeholder="What work is being done…" rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white resize-none" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Start time *</span>
              <input type="datetime-local" value={form.startsAt} onChange={e => field('startsAt', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">End time *</span>
              <input type="datetime-local" value={form.endsAt} onChange={e => field('endsAt', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Scope</span>
            <select value={form.scope} onChange={e => field('scope', e.target.value as MaintenanceScope)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="all">Entire datacenter</option>
              <option value="host">Specific hosts</option>
              <option value="rack">Specific racks</option>
              <option value="category">Alert categories</option>
            </select>
          </label>

          {showScopeValues && (
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                {form.scope === 'host' && 'Hostnames (comma-separated)'}
                {form.scope === 'rack' && 'Rack IDs (comma-separated)'}
                {form.scope === 'category' && 'Categories'}
              </span>
              {form.scope === 'category' ? (
                <div className="flex flex-wrap gap-2 mt-1">
                  {CATEGORY_OPTIONS.map(cat => {
                    const active = form.scopeValues.split(',').map(v => v.trim()).includes(cat)
                    return (
                      <button key={cat} type="button"
                        onClick={() => {
                          const current = form.scopeValues.split(',').map(v => v.trim()).filter(Boolean)
                          const next = active ? current.filter(c => c !== cat) : [...current, cat]
                          field('scopeValues', next.join(', '))
                        }}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? 'border-orange-500/50 bg-orange-500/15 text-orange-300' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-300'}`}>
                        {cat}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <input value={form.scopeValues} onChange={e => field('scopeValues', e.target.value)}
                  placeholder={form.scope === 'host' ? 'server-01, server-02' : 'rack-01, rack-02'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              )}
            </label>
          )}

          <div className="space-y-2">
            <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-colors ${form.suppressAlerts ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-800/70 bg-slate-900/40'}`}>
              <input type="checkbox" checked={form.suppressAlerts} onChange={e => field('suppressAlerts', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <BellOff size={13} className="text-orange-400" /> Suppress alerts
                </div>
                <div className="text-xs text-slate-500 mt-0.5">No Slack/email notifications will be sent for incidents in scope during this window.</div>
              </div>
            </label>
            <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-colors ${form.pauseSla ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-800/70 bg-slate-900/40'}`}>
              <input type="checkbox" checked={form.pauseSla} onChange={e => field('pauseSla', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <ShieldOff size={13} className="text-orange-400" /> Pause SLA clock
                </div>
                <div className="text-xs text-slate-500 mt-0.5">SLA ack/resolve breach counters will not fire for incidents in scope during this window.</div>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white">Cancel</button>
          <button onClick={() => void submit()} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-60">
            {saving && <RefreshCw size={13} className="animate-spin" />}
            Schedule window
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Window card ────────────────────────────────────────────── */

function WindowCard({ win, onDelete }: { win: MaintenanceWindow; onDelete: (id: string) => void }) {
  const status = windowStatus(win)
  return (
    <div className={`rounded-2xl border bg-slate-950/70 p-4 transition-opacity ${status === 'expired' ? 'opacity-50' : ''}`}
      style={{ borderColor: status === 'active' ? 'rgba(16,185,129,0.3)' : status === 'upcoming' ? 'rgba(59,130,246,0.3)' : 'rgba(51,65,85,0.5)' }}>

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{win.title}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${STATUS_STYLE[status]}`}>
              {status}
            </span>
          </div>
          {win.description && <p className="mt-1 text-xs text-slate-400">{win.description}</p>}
        </div>
        {status !== 'expired' && (
          <button onClick={() => onDelete(win.id)}
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-rose-400 shrink-0">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Clock3 size={12} className="text-slate-500 shrink-0" />
          <div>
            <div>{fmtTime(win.startsAt)}</div>
            <div>→ {fmtTime(win.endsAt)}</div>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-600">Scope</div>
          <div>{SCOPE_LABELS[win.scope]}</div>
          {win.scopeValues.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {win.scopeValues.map(v => (
                <span key={v} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{v}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs">
        <span className={`flex items-center gap-1 ${win.suppressAlerts ? 'text-orange-300' : 'text-slate-600'}`}>
          <BellOff size={11} /> {win.suppressAlerts ? 'Alerts suppressed' : 'Alerts active'}
        </span>
        <span className={`flex items-center gap-1 ${win.pauseSla ? 'text-orange-300' : 'text-slate-600'}`}>
          <ShieldOff size={11} /> {win.pauseSla ? 'SLA paused' : 'SLA running'}
        </span>
        <span className="ml-auto text-slate-600">by {win.createdBy}</span>
      </div>
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────────── */

export default function MaintenancePage() {
  const [windows, setWindows]       = useState<MaintenanceWindow[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [feedback, setFeedback]     = useState('')
  const [feedbackOk, setFeedbackOk] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/maintenance', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load maintenance windows')
      const data = await res.json()
      setWindows(Array.isArray(data) ? data.sort((a: MaintenanceWindow, b: MaintenanceWindow) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()) : [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  function flash(msg: string, ok = true) {
    setFeedback(msg); setFeedbackOk(ok)
    setTimeout(() => setFeedback(''), 5000)
  }

  async function createWindow(form: FormState) {
    const res  = await fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        scope: form.scope,
        scopeValues: form.scopeValues.split(',').map(v => v.trim()).filter(Boolean),
        startsAt: fromLocalDatetimeValue(form.startsAt),
        endsAt: fromLocalDatetimeValue(form.endsAt),
        suppressAlerts: form.suppressAlerts,
        pauseSla: form.pauseSla,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to create window')
    flash(`"${data.title}" scheduled.`)
    setShowModal(false)
    await loadData()
  }

  async function deleteWindow(id: string) {
    try {
      const res = await fetch(`/api/maintenance?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      flash('Maintenance window removed.')
      setConfirmDel(null)
      await loadData()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Delete failed', false)
    }
  }

  const active   = windows.filter(w => windowStatus(w) === 'active')
  const upcoming = windows.filter(w => windowStatus(w) === 'upcoming')
  const expired  = windows.filter(w => windowStatus(w) === 'expired')

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-orange-400">
              <CalendarClock size={16} />
              <h2 className="text-lg font-semibold text-white">Maintenance Windows</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Schedule planned downtime to suppress alerts and pause SLA clocks during maintenance work.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {active.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                <CheckCircle2 size={11} /> {active.length} active now
              </span>
            )}
            <button onClick={() => void loadData()} title="Refresh"
              className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-white">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-400">
              <Plus size={14} /> Schedule window
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
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/70 p-10 text-center text-sm text-slate-500">
          Loading maintenance windows…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active */}
          {active.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-emerald-500 mb-3 px-1">
                <CheckCircle2 size={12} /> Active now
              </div>
              <div className="space-y-3">
                {active.map(w => (
                  <WindowCard key={w.id} win={w} onDelete={setConfirmDel} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-blue-400 mb-3 px-1">
                <Clock3 size={12} /> Upcoming
              </div>
              <div className="space-y-3">
                {upcoming.map(w => (
                  <WindowCard key={w.id} win={w} onDelete={setConfirmDel} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {active.length === 0 && upcoming.length === 0 && (
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/70 p-10 text-center">
              <CalendarClock size={28} className="text-slate-700 mx-auto mb-3" />
              <div className="text-sm text-slate-500">No active or upcoming maintenance windows.</div>
              <div className="text-xs text-slate-600 mt-1">Schedule one before planned work to silence alerts and pause SLA clocks.</div>
            </div>
          )}

          {/* Past */}
          {expired.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-600 mb-3 px-1">
                <Clock3 size={12} /> Past windows
              </div>
              <div className="space-y-3">
                {expired.slice(0, 10).map(w => (
                  <WindowCard key={w.id} win={w} onDelete={setConfirmDel} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <Trash2 size={18} className="text-rose-400" />
              <h3 className="text-sm font-semibold text-white">Remove maintenance window?</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              If this window is currently active, alert suppression and SLA pausing will resume immediately.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDel(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white">Cancel</button>
              <button onClick={() => void deleteWindow(confirmDel)} className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-medium text-white hover:bg-rose-400">Remove</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <CreateModal
          onSave={createWindow}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
