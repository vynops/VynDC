'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle, Clock, Download, Search, RotateCcw, X, User, FileText } from 'lucide-react'
import type { Incident } from '@/lib/simulation'
import { exportCsv } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-red-500/10 text-red-400',
  acknowledged: 'bg-yellow-500/10 text-yellow-400',
  resolved: 'bg-green-500/10 text-green-400',
}

// Extended type to include notes/assignedTo from overrides
type IncidentExt = Incident & { notes?: string; assignedTo?: string }

interface ActionModalProps {
  incident: IncidentExt
  nextStatus: 'acknowledged' | 'resolved'
  onClose: () => void
  onConfirm: (notes: string) => Promise<void>
}

function ActionModal({ incident, nextStatus, onClose, onConfirm }: ActionModalProps) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onConfirm(notes)
    setSaving(false)
  }

  const isAck = nextStatus === 'acknowledged'
  const accentClass = isAck ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-green-500/40 bg-green-500/5'
  const btnClass = isAck
    ? 'bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/30'
    : 'bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">
            {isAck ? 'Acknowledge' : 'Resolve'} Incident
          </h2>
          <button onClick={onClose}><X size={15} className="text-slate-500 hover:text-white" /></button>
        </div>

        {/* Incident summary */}
        <div className={`rounded-xl border px-3 py-2.5 mb-4 ${accentClass}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEV_BADGE[incident.severity]}`}>
              {incident.severity.toUpperCase()}
            </span>
            <span className="text-[10px] text-slate-500 uppercase">{incident.category}</span>
          </div>
          <div className="text-sm text-white font-medium">{incident.title}</div>
          {incident.hostname && <div className="text-xs text-slate-500 mt-0.5">{incident.hostname}</div>}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5 mb-1.5">
              <FileText size={10} /> Notes <span className="text-slate-600 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={isAck ? 'e.g. Investigating, paged on-call team…' : 'e.g. Root cause: disk full on node-0. Freed 20GB.'}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors ${btnClass}`}>
              {saving ? 'Saving…' : isAck ? 'Acknowledge' : 'Mark Resolved'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function IncidentsPage() {
  const { data: incidents = [], mutate } = useSWR<IncidentExt[]>('/api/incidents', fetcher, { refreshInterval: 30000 })
  const [search, setSearch] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCat, setFilterCat] = useState('all')
  const [actionTarget, setActionTarget] = useState<{ inc: IncidentExt; next: 'acknowledged' | 'resolved' } | null>(null)

  const filtered = incidents.filter(inc => {
    if (search && !inc.title.toLowerCase().includes(search.toLowerCase()) && !(inc.hostname ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (filterSeverity !== 'all' && inc.severity !== filterSeverity) return false
    if (filterStatus !== 'all' && inc.status !== filterStatus) return false
    if (filterCat !== 'all' && inc.category !== filterCat) return false
    return true
  })

  const categories = [...new Set(incidents.map(i => i.category))]
  const counts = { open: 0, acknowledged: 0, resolved: 0 }
  incidents.forEach(i => counts[i.status]++)

  async function applyStatus(id: string, status: string, notes?: string) {
    await fetch('/api/incidents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, notes }),
    })
    mutate()
  }

  function doExport() {
    exportCsv(filtered.map(i => ({
      id: i.id, severity: i.severity, category: i.category, hostname: i.hostname,
      rack: i.rack, title: i.title, status: i.status, created_at: i.createdAt,
      assigned_to: i.assignedTo ?? '', notes: i.notes ?? '',
    })), 'vyndc-incidents.csv')
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(counts) as [string, number][]).map(([st, c]) => (
          <button key={st} onClick={() => setFilterStatus(filterStatus === st ? 'all' : st)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${filterStatus === st ? STATUS_BADGE[st] + ' border-current' : 'bg-slate-800/40 text-slate-400 border-slate-700'}`}>
            {c} {st}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
        </div>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All severity</option>
          {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={doExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium">
          <Download size={13} /> Export
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-8 text-center text-slate-500 text-sm">No incidents found</div>}
        {filtered.map(inc => (
          <div key={inc.id} className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEV_BADGE[inc.severity]}`}>{inc.severity.toUpperCase()}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{inc.category}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[inc.status]}`}>{inc.status}</span>
              </div>
              <div className="text-sm text-white font-medium">{inc.title}</div>
              <div className="text-xs text-slate-400">{inc.hostname} · {inc.rack} · {inc.description}</div>
              <div className="text-[10px] text-slate-600 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock size={9} /> {new Date(inc.createdAt).toLocaleString()}
                </span>
                {inc.resolvedAt && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle size={9} /> Resolved: {new Date(inc.resolvedAt).toLocaleString()}
                  </span>
                )}
                {inc.assignedTo && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <User size={9} /> {inc.assignedTo}
                  </span>
                )}
              </div>
              {inc.notes && (
                <div className="text-[11px] text-slate-400 bg-slate-800/50 border border-slate-700/60 rounded-lg px-2.5 py-1.5 mt-1 flex items-start gap-1.5">
                  <FileText size={10} className="text-slate-500 mt-0.5 shrink-0" />
                  <span>{inc.notes}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {inc.status === 'open' && (
                <button onClick={() => setActionTarget({ inc, next: 'acknowledged' })}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-xs font-medium transition-colors">
                  <AlertTriangle size={11} /> Acknowledge
                </button>
              )}
              {inc.status !== 'resolved' && (
                <button onClick={() => setActionTarget({ inc, next: 'resolved' })}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium transition-colors">
                  <CheckCircle size={11} /> Resolve
                </button>
              )}
              {inc.status === 'resolved' && (
                <button onClick={() => applyStatus(inc.id, 'open')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-400 hover:text-white text-xs font-medium transition-colors">
                  <RotateCcw size={11} /> Re-open
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-600">Showing {filtered.length} of {incidents.length} incidents</div>

      {actionTarget && (
        <ActionModal
          incident={actionTarget.inc}
          nextStatus={actionTarget.next}
          onClose={() => setActionTarget(null)}
          onConfirm={async (notes) => {
            await applyStatus(actionTarget.inc.id, actionTarget.next, notes)
            setActionTarget(null)
          }}
        />
      )}
    </div>
  )
}
