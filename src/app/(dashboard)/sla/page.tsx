'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Timer, CheckCircle, AlertTriangle, XCircle, Save } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface SlaRow {
  id: string; title: string; severity: string; status: string; createdAt: string
  ageMin: number; ackSlaMin: number; resolveSlaMin: number
  ackBreached: boolean; resolveBreached: boolean; acknowledged: boolean; escalationStep: number
}
interface SlaData {
  sla: Record<string, { ackMinutes: number; resolveMinutes: number }>
  rows: SlaRow[]
}

const SEV_COLOR: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-blue-400',
}

function pct(age: number, limit: number) { return Math.min(100, Math.round((age / limit) * 100)) }

function SlaBar({ age, limit, breached }: { age: number; limit: number; breached: boolean }) {
  const p = pct(age, limit)
  const color = breached ? 'bg-red-500' : p > 80 ? 'bg-orange-500' : p > 50 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${breached ? 'text-red-400' : 'text-slate-500'}`}>
        {age}m / {limit}m
      </span>
    </div>
  )
}

function SlaConfigEditor({ sla, onSaved }: { sla: Record<string, { ackMinutes: number; resolveMinutes: number }>; onSaved: () => void }) {
  const [form, setForm] = useState(sla)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch('/api/sla', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Timer size={14} className="text-orange-400" />
        <span className="text-sm font-bold text-white">SLA Thresholds</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 uppercase text-[10px] border-b border-slate-800">
              <th className="px-3 py-2 text-left">Severity</th>
              <th className="px-3 py-2 text-left">Ack within (min)</th>
              <th className="px-3 py-2 text-left">Resolve within (min)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {['critical','high','medium','low'].map(sev => (
              <tr key={sev}>
                <td className="px-3 py-2 font-bold" style={{ color: ({ critical:'#f87171',high:'#fb923c',medium:'#facc15',low:'#60a5fa' } as Record<string,string>)[sev] }}>{sev}</td>
                <td className="px-3 py-2">
                  <input type="number" min={1} max={1440}
                    value={form[sev]?.ackMinutes ?? 120}
                    onChange={e => setForm(f => ({ ...f, [sev]: { ...f[sev], ackMinutes: +e.target.value } }))}
                    className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-orange-500/60" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={1} max={10080}
                    value={form[sev]?.resolveMinutes ?? 480}
                    onChange={e => setForm(f => ({ ...f, [sev]: { ...f[sev], resolveMinutes: +e.target.value } }))}
                    className="w-24 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-orange-500/60" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={save} disabled={saving}
        className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-xs font-medium">
        <Save size={12} /> {saving ? 'Saving…' : 'Save SLA Config'}
      </button>
    </div>
  )
}

export default function SlaPage() {
  const { data, mutate } = useSWR<SlaData>('/api/sla', fetcher, { refreshInterval: 30000 })

  const rows = data?.rows ?? []
  const breached = rows.filter(r => r.ackBreached || r.resolveBreached).length
  const ok = rows.filter(r => !r.ackBreached && !r.resolveBreached).length

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Timer size={18} className="text-orange-400" /> SLA Tracker
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">Monitor acknowledgment and resolution SLAs per incident</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active Incidents', value: rows.length, icon: AlertTriangle, color: 'text-slate-400' },
          { label: 'Within SLA', value: ok, icon: CheckCircle, color: 'text-green-400' },
          { label: 'SLA Breached', value: breached, icon: XCircle, color: 'text-red-400' },
        ].map(card => (
          <div key={card.label} className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4 flex items-center gap-3">
            <card.icon size={20} className={card.color} />
            <div>
              <div className="text-xl font-bold text-white">{card.value}</div>
              <div className="text-[10px] text-slate-500">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SLA Table */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-800">
          <Timer size={14} className="text-orange-400" />
          <span className="text-sm font-bold text-white">Active Incidents — SLA Status</span>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No active incidents.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-800">
                <tr className="text-[10px] text-slate-500 uppercase">
                  {['Severity','Title','Age','Ack SLA','Resolve SLA','Step','Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {rows.map(r => (
                  <tr key={r.id} className={`hover:bg-slate-800/30 transition-colors ${(r.ackBreached || r.resolveBreached) ? 'bg-red-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`font-bold uppercase text-[10px] ${SEV_COLOR[r.severity] ?? 'text-slate-400'}`}>{r.severity}</span>
                    </td>
                    <td className="px-4 py-3 text-white max-w-xs truncate">{r.title}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono">{r.ageMin}m</td>
                    <td className="px-4 py-3 min-w-[160px]">
                      <SlaBar age={r.ageMin} limit={r.ackSlaMin} breached={r.ackBreached} />
                    </td>
                    <td className="px-4 py-3 min-w-[160px]">
                      <SlaBar age={r.ageMin} limit={r.resolveSlaMin} breached={r.resolveBreached} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.escalationStep > 0 ? `Step ${r.escalationStep}` : '—'}</td>
                    <td className="px-4 py-3">
                      {r.ackBreached || r.resolveBreached
                        ? <span className="text-red-400 font-bold">Breached</span>
                        : <span className="text-green-400">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SLA config editor */}
      {data?.sla && <SlaConfigEditor sla={data.sla} onSaved={() => mutate()} />}
    </div>
  )
}
