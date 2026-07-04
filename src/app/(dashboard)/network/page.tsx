'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Network, Search, Download, AlertTriangle, X, ArrowDown, ArrowUp, Activity, Cpu } from 'lucide-react'
import type { NetworkInterface } from '@/lib/simulation'
import { exportCsv } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_BADGE: Record<string, string> = {
  up: 'bg-green-500/20 text-green-400 border border-green-500/30',
  degraded: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  down: 'bg-red-500/20 text-red-400 border border-red-500/30',
}

function InfoRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className={`text-[11px] text-right truncate ${mono ? 'font-mono' : ''} ${color ?? 'text-slate-300'}`}>{value}</span>
    </div>
  )
}

export default function NetworkPage() {
  const { data: interfaces = [] } = useSWR<NetworkInterface[]>('/api/network', fetcher, { refreshInterval: 30000 })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selected, setSelected] = useState<NetworkInterface | null>(null)

  const filtered = interfaces.filter(n => {
    if (search && !n.hostname.toLowerCase().includes(search.toLowerCase()) && !n.interface.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStatus !== 'all' && n.status !== filterStatus) return false
    return true
  })

  const totalRx = interfaces.reduce((a, n) => a + n.rxMbps, 0)
  const totalTx = interfaces.reduce((a, n) => a + n.txMbps, 0)
  const degraded = interfaces.filter(n => n.status !== 'up').length

  const topBandwidth = [...interfaces].sort((a, b) => (b.rxMbps + b.txMbps) - (a.rxMbps + a.txMbps)).slice(0, 5)

  function doExport() {
    exportCsv(filtered.map(n => ({
      hostname: n.hostname, interface: n.interface, speed_gbps: n.speedGbps, status: n.status,
      rx_mbps: n.rxMbps.toFixed(1), tx_mbps: n.txMbps.toFixed(1), rx_errors: n.rxErrors, tx_errors: n.txErrors,
    })), 'vyndc-network.csv')
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <Network size={14} className="text-orange-400 mb-2" />
          <div className="text-xl font-bold text-white">{interfaces.length}</div>
          <div className="text-xs text-slate-400">Total Interfaces</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className={`text-xl font-bold ${degraded > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{degraded}</div>
          <div className="text-xs text-slate-400">Degraded / Down</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="text-xl font-bold text-white">{totalRx.toFixed(0)} Mbps</div>
          <div className="text-xs text-slate-400">Total RX</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="text-xl font-bold text-white">{totalTx.toFixed(0)} Mbps</div>
          <div className="text-xs text-slate-400">Total TX</div>
        </div>
      </div>

      {/* Top bandwidth */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
        <h3 className="text-xs font-bold text-white mb-3">Top Bandwidth Consumers</h3>
        <div className="space-y-2">
          {topBandwidth.map(n => {
            const utilPct = Math.min(100, ((n.rxMbps + n.txMbps) / (n.speedGbps * 1000 * 2)) * 100)
            return (
              <div key={n.id} className="flex items-center gap-3">
                <div className="w-32 text-xs text-slate-400 shrink-0">{n.hostname}</div>
                <div className="flex-1 h-2 bg-slate-800 rounded-full">
                  <div className={`h-2 rounded-full ${utilPct > 80 ? 'bg-red-500' : utilPct > 60 ? 'bg-yellow-400' : 'bg-orange-500'}`} style={{ width: `${utilPct}%` }} />
                </div>
                <div className="w-28 text-right text-[10px] text-slate-500 shrink-0">↓{n.rxMbps.toFixed(0)} / ↑{n.txMbps.toFixed(0)} Mbps</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hostname or interface..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All status</option>
          <option value="up">Up</option>
          <option value="degraded">Degraded</option>
          <option value="down">Down</option>
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
                <th className="text-left p-3 text-slate-400 font-medium">Host</th>
                <th className="text-left p-3 text-slate-400 font-medium hidden sm:table-cell">Interface</th>
                <th className="text-left p-3 text-slate-400 font-medium">Status</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden sm:table-cell">Speed</th>
                <th className="text-right p-3 text-slate-400 font-medium">RX Mbps</th>
                <th className="text-right p-3 text-slate-400 font-medium">TX Mbps</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden md:table-cell">Errors</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden md:table-cell">Drops</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => (
                <tr key={n.id}
                  onClick={() => setSelected(n)}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {n.status !== 'up' && <AlertTriangle size={11} className={n.status === 'down' ? 'text-red-400' : 'text-yellow-400'} />}
                      <span className="text-white">{n.hostname}</span>
                    </div>
                  </td>
                  <td className="p-3 text-slate-400 hidden sm:table-cell">{n.interface}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[n.status]}`}>{n.status}</span>
                  </td>
                  <td className="p-3 text-right hidden sm:table-cell text-slate-400">{n.speedGbps}G</td>
                  <td className="p-3 text-right text-blue-400">{n.rxMbps.toFixed(1)}</td>
                  <td className="p-3 text-right text-green-400">{n.txMbps.toFixed(1)}</td>
                  <td className="p-3 text-right hidden md:table-cell">
                    <span className={n.rxErrors > 100 ? 'text-red-400' : 'text-slate-400'}>{n.rxErrors}</span>
                  </td>
                  <td className="p-3 text-right hidden md:table-cell">
                    <span className={n.rxDrops > 50 ? 'text-yellow-400' : 'text-slate-400'}>{n.rxDrops}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-800 text-[11px] text-slate-600">
          Showing {filtered.length} of {interfaces.length} interfaces · Click a row for details
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (() => {
        const linkMbps = selected.speedGbps * 1000
        const rxPct = Math.min(100, (selected.rxMbps / linkMbps) * 100)
        const txPct = Math.min(100, (selected.txMbps / linkMbps) * 100)
        const totalErrors = selected.rxErrors + selected.txErrors
        const totalDrops = selected.rxDrops + selected.txDrops
        const utilPct = Math.min(100, ((selected.rxMbps + selected.txMbps) / (linkMbps * 2)) * 100)
        return (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
            <div
              className="w-full max-w-xs bg-[#0d1117] border-l border-slate-800 h-full overflow-y-auto shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between p-5 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Network size={15} className="text-orange-400" />
                    <span className="text-white font-bold text-sm">{selected.hostname}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs font-mono">{selected.interface}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGE[selected.status] || ''}`}>{selected.status}</span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white p-1">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4 flex-1">
                {/* Throughput */}
                <div className="bg-slate-900 rounded-xl p-4 space-y-3">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Throughput</div>
                  {/* Overall utilisation */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-slate-500">Link utilisation</span>
                      <span className={utilPct > 80 ? 'text-red-400' : utilPct > 60 ? 'text-yellow-400' : 'text-slate-300'}>{utilPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${utilPct > 80 ? 'bg-red-500' : utilPct > 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                        style={{ width: `${utilPct}%` }} />
                    </div>
                  </div>
                  {/* RX */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="flex items-center gap-1 text-blue-400"><ArrowDown size={10} /> RX</span>
                      <span className="text-slate-300">{selected.rxMbps.toFixed(1)} Mbps <span className="text-slate-600">({rxPct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${rxPct}%` }} />
                    </div>
                  </div>
                  {/* TX */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="flex items-center gap-1 text-green-400"><ArrowUp size={10} /> TX</span>
                      <span className="text-slate-300">{selected.txMbps.toFixed(1)} Mbps <span className="text-slate-600">({txPct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${txPct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Errors & Drops */}
                <div className="bg-slate-900 rounded-xl p-4 space-y-3">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={10} /> Errors &amp; Drops
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/60 rounded-lg p-3">
                      <div className={`text-base font-bold ${selected.rxErrors > 100 ? 'text-red-400' : selected.rxErrors > 10 ? 'text-yellow-400' : 'text-white'}`}>
                        {selected.rxErrors}
                      </div>
                      <div className="text-[10px] text-slate-500">RX Errors</div>
                    </div>
                    <div className="bg-slate-800/60 rounded-lg p-3">
                      <div className={`text-base font-bold ${selected.txErrors > 100 ? 'text-red-400' : selected.txErrors > 10 ? 'text-yellow-400' : 'text-white'}`}>
                        {selected.txErrors}
                      </div>
                      <div className="text-[10px] text-slate-500">TX Errors</div>
                    </div>
                    <div className="bg-slate-800/60 rounded-lg p-3">
                      <div className={`text-base font-bold ${selected.rxDrops > 50 ? 'text-red-400' : selected.rxDrops > 10 ? 'text-yellow-400' : 'text-white'}`}>
                        {selected.rxDrops}
                      </div>
                      <div className="text-[10px] text-slate-500">RX Drops</div>
                    </div>
                    <div className="bg-slate-800/60 rounded-lg p-3">
                      <div className={`text-base font-bold ${selected.txDrops > 50 ? 'text-red-400' : selected.txDrops > 10 ? 'text-yellow-400' : 'text-white'}`}>
                        {selected.txDrops}
                      </div>
                      <div className="text-[10px] text-slate-500">TX Drops</div>
                    </div>
                  </div>
                  {(totalErrors > 0 || totalDrops > 0) && (
                    <div className="text-[10px] text-slate-600 pt-1">
                      Total: {totalErrors} errors · {totalDrops} drops
                    </div>
                  )}
                </div>

                {/* Interface details */}
                <div className="bg-slate-900 rounded-xl p-4 space-y-2">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu size={10} /> Interface Details
                  </div>
                  <InfoRow label="Speed" value={selected.speedGbps >= 1 ? `${selected.speedGbps} Gbps` : `${selected.speedGbps * 1000} Mbps`} />
                  <InfoRow label="Duplex" value={selected.duplex ?? 'N/A'} />
                  <InfoRow label="MTU" value={selected.mtu != null ? `${selected.mtu} bytes` : 'N/A'} />
                  <InfoRow label="Operstate" value={selected.operstate ?? selected.status} />
                  {selected.macAddress && <InfoRow label="MAC" value={selected.macAddress} mono />}
                  <InfoRow label="Rack" value={selected.rack} />
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
