'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Search, Server, Download, X, Thermometer, Cpu, MemoryStick, Zap } from 'lucide-react'
import type { Server as ServerType } from '@/lib/simulation'
import { exportCsv } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400 border border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  offline: 'bg-slate-700 text-slate-400 border border-slate-600',
}

function ServerModal({ server, onClose }: { server: ServerType; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-slate-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white">{server.hostname}</h2>
            <div className="text-xs text-slate-500 mt-0.5">{server.rack} · U{server.uPosition}-{server.uPosition + server.uHeight - 1} · {server.ipmi}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'CPU', value: `${server.cpuUsagePct.toFixed(1)}%`, color: server.cpuUsagePct > 80 ? 'text-red-400' : server.cpuUsagePct > 60 ? 'text-yellow-400' : 'text-green-400' },
            { label: 'Memory', value: `${((server.memoryUsedGiB / server.memoryGiB) * 100).toFixed(1)}%`, color: 'text-white' },
            { label: 'Temp', value: `${server.tempCelsius}°C`, color: server.tempCelsius > 80 ? 'text-red-400' : server.tempCelsius > 70 ? 'text-yellow-400' : 'text-green-400' },
            { label: 'Power', value: `${server.powerWatts}W`, color: 'text-orange-400' },
          ].map(m => (
            <div key={m.label} className="bg-slate-900/60 rounded-xl p-3 text-center">
              <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
              <div className="text-[10px] text-slate-500">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-slate-500">OS:</span> <span className="text-white">{server.os}</span></div>
            <div><span className="text-slate-500">CPU:</span> <span className="text-white">{server.cpuModel} ({server.cpuCores}c)</span></div>
            <div><span className="text-slate-500">RAM:</span> <span className="text-white">{server.memoryUsedGiB.toFixed(1)} / {server.memoryGiB} GiB</span></div>
            <div><span className="text-slate-500">Disks:</span> <span className="text-white">{server.diskCount} ({server.diskTotalTiB.toFixed(1)} TiB)</span></div>
          </div>

          <div>
            <div className="text-slate-400 font-medium mb-1">Network Interfaces</div>
            <div className="space-y-1">
              {server.networkInterfaces.map((nic, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-2">
                  <span className="text-slate-300">{nic.name} ({nic.speedGbps}G)</span>
                  <span className="text-slate-400">↓{nic.rxMbps.toFixed(0)} / ↑{nic.txMbps.toFixed(0)} Mbps</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ServersPage() {
  const { data: servers = [] } = useSWR<ServerType[]>('/api/servers', fetcher, { refreshInterval: 30000 })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterRack, setFilterRack] = useState('all')
  const [selected, setSelected] = useState<ServerType | null>(null)

  const racks = [...new Set(servers.map(s => s.rack))].sort()
  const filtered = servers.filter(s => {
    if (search && !s.hostname.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterRack !== 'all' && s.rack !== filterRack) return false
    return true
  })

  function doExport() {
    exportCsv(filtered.map(s => ({
      hostname: s.hostname, rack: s.rack, status: s.status,
      cpu_pct: s.cpuUsagePct.toFixed(1), memory_pct: ((s.memoryUsedGiB / s.memoryGiB) * 100).toFixed(1),
      temp_c: s.tempCelsius, power_w: s.powerWatts, uptime_s: s.uptime,
    })), 'vyndc-servers.csv')
  }

  const counts = { healthy: 0, warning: 0, critical: 0, offline: 0 }
  servers.forEach(s => counts[s.status]++)

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {selected && <ServerModal server={selected} onClose={() => setSelected(null)} />}

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(counts) as [string, number][]).map(([status, count]) => (
          <button key={status} onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${filterStatus === status ? STATUS_BADGE[status] : 'bg-slate-800/40 text-slate-400 border-slate-700 hover:border-slate-500'}`}>
            {count} {status}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hostname..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
        </div>
        <select value={filterRack} onChange={e => setFilterRack(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All racks</option>
          {racks.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={doExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left p-3 text-slate-400 font-medium">Hostname</th>
                <th className="text-left p-3 text-slate-400 font-medium">Rack</th>
                <th className="text-left p-3 text-slate-400 font-medium">Status</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden sm:table-cell"><Cpu size={11} className="inline mr-1" />CPU</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden sm:table-cell"><MemoryStick size={11} className="inline mr-1" />MEM</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden md:table-cell"><Thermometer size={11} className="inline mr-1" />Temp</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden md:table-cell"><Zap size={11} className="inline mr-1" />Power</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const memPct = (s.memoryUsedGiB / s.memoryGiB) * 100
                return (
                  <tr key={s.id} onClick={() => setSelected(s)}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Server size={12} className="text-slate-500 shrink-0" />
                        <span className="text-white font-medium">{s.hostname}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5 pl-5">{s.os}</div>
                    </td>
                    <td className="p-3 text-slate-400">{s.rack}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[s.status]}`}>{s.status}</span>
                    </td>
                    <td className="p-3 text-right hidden sm:table-cell">
                      <span className={s.cpuUsagePct > 80 ? 'text-red-400' : s.cpuUsagePct > 60 ? 'text-yellow-400' : 'text-green-400'}>
                        {s.cpuUsagePct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-right hidden sm:table-cell">
                      <span className={memPct > 85 ? 'text-red-400' : memPct > 70 ? 'text-yellow-400' : 'text-white'}>
                        {memPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-right hidden md:table-cell">
                      <span className={s.tempCelsius > 80 ? 'text-red-400' : s.tempCelsius > 70 ? 'text-yellow-400' : 'text-white'}>
                        {s.tempCelsius}°C
                      </span>
                    </td>
                    <td className="p-3 text-right hidden md:table-cell text-orange-300">{s.powerWatts}W</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-800 text-[11px] text-slate-600">
          Showing {filtered.length} of {servers.length} servers
        </div>
      </div>
    </div>
  )
}
