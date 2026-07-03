'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Phone, Plus, Trash2, X, Clock, User, Calendar, Edit2 } from 'lucide-react'
import type { Shift } from '@/lib/oncall-store'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface OncallData { shifts: Shift[] }

function shiftStatus(s: Shift): 'active' | 'upcoming' | 'past' {
  const now = new Date()
  if (new Date(s.startTime) <= now && new Date(s.endTime) > now) return 'active'
  if (new Date(s.startTime) > now) return 'upcoming'
  return 'past'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_STYLE = {
  active:   'bg-green-500/15 text-green-400 border border-green-500/30',
  upcoming: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  past:     'bg-slate-700/50 text-slate-500 border border-slate-700',
}

function AddShiftModal({ onClose, onDone, editShift }: { onClose: () => void; onDone: () => void; editShift?: Shift }) {
  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 86400_000)
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  const [form, setForm] = useState(editShift ? {
    name: editShift.name,
    userEmail: editShift.userEmail,
    userName: editShift.userName,
    startTime: toLocal(new Date(editShift.startTime)),
    endTime: toLocal(new Date(editShift.endTime)),
    timezone: editShift.timezone,
  } : {
    name: 'Primary On-Call',
    userEmail: '',
    userName: '',
    startTime: toLocal(now),
    endTime: toLocal(nextWeek),
    timezone: 'UTC',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await fetch('/api/oncall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        id: editShift?.id,
        startTime: new Date(form.startTime).toISOString(),
        endTime:   new Date(form.endTime).toISOString(),
      }),
    })
    setSaving(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Failed'); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">{editShift ? 'Edit Shift' : 'Add On-Call Shift'}</h2>
          <button onClick={onClose}><X size={15} className="text-slate-500 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

          {[
            { label: 'Shift Name', key: 'name', type: 'text', placeholder: 'Primary On-Call' },
            { label: 'Engineer Email', key: 'userEmail', type: 'email', placeholder: 'eng@example.com' },
            { label: 'Display Name', key: 'userName', type: 'text', placeholder: 'Jane Smith' },
            { label: 'Start', key: 'startTime', type: 'datetime-local', placeholder: '' },
            { label: 'End', key: 'endTime', type: 'datetime-local', placeholder: '' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] text-slate-500 uppercase font-bold">{f.label}</label>
              <input required type={f.type} value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
            </div>
          ))}

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold">Timezone</label>
            <select value={form.timezone} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
              {['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Berlin','Asia/Kolkata','Asia/Tokyo','Australia/Sydney'].map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Saving…' : editShift ? 'Save Changes' : 'Add Shift'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function OnCallPage() {
  const { data, mutate } = useSWR<OncallData>('/api/oncall', fetcher, { refreshInterval: 30000 })
  const [showAdd, setShowAdd] = useState(false)
  const [editShift, setEditShift] = useState<Shift | undefined>()

  const shifts = data?.shifts ?? []
  const activeNow = shifts.filter(s => shiftStatus(s) === 'active')
  const sorted = [...shifts].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

  async function removeShift(id: string) {
    await fetch(`/api/oncall?id=${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Phone size={18} className="text-orange-400" /> On-Call Schedule
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage who is on-call and when</p>
        </div>
        <button onClick={() => { setEditShift(undefined); setShowAdd(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium">
          <Plus size={14} /> Add Shift
        </button>
      </div>

      {/* Currently on-call */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
        <div className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1.5">
          <User size={12} className="text-green-400" /> Currently On-Call
        </div>
        {activeNow.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No one currently on-call — add a shift above.</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {activeNow.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm">
                  {s.userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{s.userName}</div>
                  <div className="text-[11px] text-slate-500">{s.userEmail}</div>
                  <div className="text-[10px] text-green-400 mt-0.5">Until {fmtDate(s.endTime)} ({s.timezone})</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shift table */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-800">
          <Calendar size={14} className="text-orange-400" />
          <span className="text-sm font-bold text-white">All Shifts</span>
          <span className="ml-auto text-xs text-slate-500">{shifts.length} total</span>
        </div>
        {shifts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No shifts configured yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800">
                <tr className="text-[11px] text-slate-500 uppercase">
                  {['Status','Name','Engineer','Start','End','Timezone',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sorted.map(s => {
                  const st = shiftStatus(s)
                  return (
                    <tr key={s.id} className={`hover:bg-slate-800/30 transition-colors ${st === 'past' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${STATUS_STYLE[st]}`}>{st}</span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                      <td className="px-4 py-3">
                        <div className="text-white text-xs">{s.userName}</div>
                        <div className="text-slate-500 text-[10px]">{s.userEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        <Clock size={10} className="inline mr-1" />{fmtDate(s.startTime)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(s.endTime)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{s.timezone}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setEditShift(s); setShowAdd(true) }}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-slate-700 transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => removeShift(s.id)}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddShiftModal editShift={editShift} onClose={() => { setShowAdd(false); setEditShift(undefined) }} onDone={() => { setShowAdd(false); setEditShift(undefined); mutate() }} />}
    </div>
  )
}
