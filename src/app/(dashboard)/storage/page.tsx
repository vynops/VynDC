'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { HardDrive, Search, Download, AlertTriangle, X, Thermometer, Clock, RotateCcw, MapPin } from 'lucide-react'
import type { DiskAsset } from '@/lib/simulation'
import { exportCsv } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface InventoryEntry {
  hostname?: string; role?: string; model?: string; serial?: string
  vendor?: string; purchaseDate?: string; warrantyExpiry?: string
  costUsd?: number; location?: string
}

const HEALTH_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400 border border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  failing: 'bg-red-500/20 text-red-400 border border-red-500/30',
}
const TYPE_BADGE: Record<string, string> = {
  SSD: 'bg-blue-500/20 text-blue-400',
  HDD: 'bg-slate-700 text-slate-400',
  NVMe: 'bg-purple-500/20 text-purple-400',
}

function InfoRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className={`text-[11px] text-right truncate ${mono ? 'font-mono' : ''} ${color ?? 'text-slate-300'}`}>{value}</span>
    </div>
  )
}

export default function StoragePage() {
  const { data: disks = [] } = useSWR<DiskAsset[]>('/api/storage', fetcher, { refreshInterval: 30000 })
  const { data: inventory = [] } = useSWR<InventoryEntry[]>('/api/inventory', fetcher)
  const [search, setSearch] = useState('')
  const [filterHealth, setFilterHealth] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [selected, setSelected] = useState<DiskAsset | null>(null)

  const filtered = disks.filter(d => {
    if (search && !d.hostname.toLowerCase().includes(search.toLowerCase())) return false
    if (filterHealth !== 'all' && d.smart.health !== filterHealth) return false
    if (filterType !== 'all' && d.type !== filterType) return false
    return true
  })

  const totalGiB = disks.reduce((a, d) => a + d.capacityGiB, 0)
  const usedGiB = disks.reduce((a, d) => a + d.usedGiB, 0)
  const failingCount = disks.filter(d => d.smart.health === 'failing').length
  const warningCount = disks.filter(d => d.smart.health === 'warning').length

  function doExport() {
    exportCsv(filtered.map(d => ({
      hostname: d.hostname, rack: d.rack, slot: d.slot, type: d.type,
      capacity_gib: d.capacityGiB, used_gib: d.usedGiB,
      used_pct: ((d.usedGiB / d.capacityGiB) * 100).toFixed(1), health: d.smart.health,
      temp_c: d.smart.temperature, warranty_exp: d.warrantyExpiry,
    })), 'vyndc-storage.csv')
  }

  // Detail panel data
  const inv = selected ? inventory.find(e => e.hostname === selected.hostname) : null
  const selUsedPct = selected ? (selected.usedGiB / selected.capacityGiB) * 100 : 0
  const warrantyDate = selected?.warrantyExpiry ? new Date(selected.warrantyExpiry) : null
  const warrantyColor = !warrantyDate ? 'text-slate-500'
    : warrantyDate < new Date() ? 'text-red-400'
    : warrantyDate < new Date(Date.now() + 90 * 86400000) ? 'text-yellow-400'
    : 'text-green-400'

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <HardDrive size={14} className="text-orange-400 mb-2" />
          <div className="text-xl font-bold text-white">{disks.length}</div>
          <div className="text-xs text-slate-400">Total Disks</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="text-xl font-bold text-white">{(totalGiB/1024).toFixed(1)} TiB</div>
          <div className="text-xs text-slate-400">Total Capacity</div>
          <div className="text-[10px] text-slate-600">{(usedGiB/1024).toFixed(1)} TiB used ({((usedGiB/totalGiB)*100).toFixed(1)}%)</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className={`text-xl font-bold ${failingCount > 0 ? 'text-red-400' : 'text-white'}`}>{failingCount}</div>
          <div className="text-xs text-slate-400">Failing Disks</div>
          <div className="text-[10px] text-slate-600">{warningCount} warning</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="text-xl font-bold text-white">{disks.filter(d => d.warrantyExpiry && new Date(d.warrantyExpiry) < new Date(Date.now() + 30 * 86400000)).length}</div>
          <div className="text-xs text-slate-400">Warranty Expiring</div>
          <div className="text-[10px] text-slate-600">Within 30 days</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hostname..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
        </div>
        <select value={filterHealth} onChange={e => setFilterHealth(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All health</option>
          <option value="healthy">Healthy</option>
          <option value="warning">Warning</option>
          <option value="failing">Failing</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All types</option>
          <option value="SSD">SSD</option>
          <option value="HDD">HDD</option>
          <option value="NVMe">NVMe</option>
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
                <th className="text-left p-3 text-slate-400 font-medium hidden sm:table-cell">Rack / Slot</th>
                <th className="text-left p-3 text-slate-400 font-medium">Type</th>
                <th className="text-right p-3 text-slate-400 font-medium">Capacity</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden sm:table-cell">Used</th>
                <th className="text-left p-3 text-slate-400 font-medium">Health</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden md:table-cell">Temp</th>
                <th className="text-right p-3 text-slate-400 font-medium hidden md:table-cell">Warranty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const usedPct = (d.usedGiB / d.capacityGiB) * 100
                return (
                  <tr key={d.id}
                    onClick={() => setSelected(d)}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {d.smart.health === 'failing' && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
                        <span className="text-white">{d.hostname}</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-400 hidden sm:table-cell">{d.rack} · {d.slot}</td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TYPE_BADGE[d.type] || 'bg-slate-700 text-slate-400'}`}>{d.type}</span>
                    </td>
                    <td className="p-3 text-right text-slate-300">{d.capacityGiB >= 1024 ? `${(d.capacityGiB/1024).toFixed(1)} TiB` : `${d.capacityGiB} GiB`}</td>
                    <td className="p-3 text-right hidden sm:table-cell">
                      <span className={usedPct > 85 ? 'text-red-400' : usedPct > 70 ? 'text-yellow-400' : 'text-slate-300'}>{usedPct.toFixed(1)}%</span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${HEALTH_BADGE[d.smart.health]}`}>{d.smart.health}</span>
                    </td>
                    <td className="p-3 text-right hidden md:table-cell">
                      <span className={d.smart.temperature > 50 ? 'text-red-400' : d.smart.temperature > 40 ? 'text-yellow-400' : 'text-white'}>{d.smart.temperature}°C</span>
                    </td>
                    <td className="p-3 text-right hidden md:table-cell text-slate-500">{d.warrantyExpiry || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-800 text-[11px] text-slate-600">
          Showing {filtered.length} of {disks.length} disks · Click a row for details
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-xs bg-[#0d1117] border-l border-slate-800 h-full overflow-y-auto shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-start justify-between p-5 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive size={15} className="text-orange-400" />
                  <span className="text-white font-bold text-sm truncate max-w-[180px]">{selected.hostname}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${HEALTH_BADGE[selected.smart.health] || ''}`}>{selected.smart.health}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TYPE_BADGE[selected.type] || 'bg-slate-700 text-slate-400'}`}>{selected.type}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1">
              {/* Capacity */}
              <div className="bg-slate-900 rounded-xl p-4 space-y-3">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Storage</div>
                <InfoRow label="Mount point" value={selected.slot} mono />
                <InfoRow label="Capacity" value={selected.capacityGiB >= 1024 ? `${(selected.capacityGiB/1024).toFixed(1)} TiB` : `${selected.capacityGiB} GiB`} />
                <div>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className="text-slate-500">Used</span>
                    <span className={selUsedPct > 85 ? 'text-red-400' : selUsedPct > 70 ? 'text-yellow-400' : 'text-slate-300'}>{selUsedPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${selUsedPct > 85 ? 'bg-red-500' : selUsedPct > 70 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(selUsedPct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>{selected.usedGiB.toFixed(1)} GiB used</span>
                    <span>{(selected.capacityGiB - selected.usedGiB).toFixed(1)} GiB free</span>
                  </div>
                </div>
              </div>

              {/* SMART */}
              <div className="bg-slate-900 rounded-xl p-4 space-y-3">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">SMART / Health</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <Thermometer size={12} className="text-orange-400 mb-1" />
                    <div className={`text-base font-bold ${selected.smart.temperature > 50 ? 'text-red-400' : selected.smart.temperature > 40 ? 'text-yellow-400' : 'text-white'}`}>
                      {selected.smart.temperature > 0 ? `${selected.smart.temperature}°C` : '—'}
                    </div>
                    <div className="text-[10px] text-slate-500">Temperature</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <RotateCcw size={12} className="text-orange-400 mb-1" />
                    <div className={`text-base font-bold ${selected.smart.reallocatedSectors > 20 ? 'text-red-400' : selected.smart.reallocatedSectors > 5 ? 'text-yellow-400' : 'text-white'}`}>
                      {selected.smart.reallocatedSectors}
                    </div>
                    <div className="text-[10px] text-slate-500">Reallocated sectors</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <Clock size={12} className="text-orange-400 mb-1" />
                    <div className="text-base font-bold text-white">
                      {selected.smart.powerOnHours > 0 ? `${(selected.smart.powerOnHours / 8760).toFixed(1)}y` : 'N/A'}
                    </div>
                    <div className="text-[10px] text-slate-500">Power-on hours</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <HardDrive size={12} className="text-orange-400 mb-1" />
                    <div className="text-base font-bold text-white">
                      {selected.age > 0 ? `${(selected.age / 365).toFixed(1)}y` : 'N/A'}
                    </div>
                    <div className="text-[10px] text-slate-500">Disk age</div>
                  </div>
                </div>
              </div>

              {/* Asset */}
              <div className="bg-slate-900 rounded-xl p-4 space-y-2">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Asset</div>
                {selected.model && <InfoRow label="Model" value={selected.model} />}
                <InfoRow label="Rack" value={selected.rack} />
                <InfoRow label="Warranty" value={selected.warrantyExpiry || '—'} color={warrantyColor} />
                {selected.replacementDue && <InfoRow label="Replacement due" value={selected.replacementDue} color="text-red-400" />}
              </div>

              {/* Inventory record */}
              {inv && (
                <div className="bg-slate-900 rounded-xl p-4 space-y-2">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={10} /> Inventory Record
                  </div>
                  {inv.role && <InfoRow label="Role" value={inv.role} />}
                  {inv.vendor && <InfoRow label="Vendor" value={inv.vendor} />}
                  {inv.serial && <InfoRow label="Serial" value={inv.serial} mono />}
                  {inv.purchaseDate && <InfoRow label="Purchased" value={inv.purchaseDate} />}
                  {inv.location && <InfoRow label="Location" value={inv.location} />}
                  {!!inv.costUsd && <InfoRow label="Cost" value={`$${inv.costUsd.toLocaleString()}`} />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
