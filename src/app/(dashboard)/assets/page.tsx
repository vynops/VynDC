'use client'
import useSWR from 'swr'
import { Server, HardDrive, Download, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { Server as ServerType, DiskAsset } from '@/lib/simulation'
import type { InventoryEntry } from '@/app/api/inventory/route'
import { exportCsv } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  critical: 'bg-red-500/20 text-red-400',
  offline: 'bg-slate-700 text-slate-400',
}

export default function AssetsPage() {
  const { data: servers = [] } = useSWR<ServerType[]>('/api/servers', fetcher)
  const { data: disks = [] } = useSWR<DiskAsset[]>('/api/storage', fetcher)
  const { data: inventory = [] } = useSWR<InventoryEntry[]>('/api/inventory', fetcher)

  // Build a hostname → CMDB entry map for fast lookup
  const cmdb = Object.fromEntries(inventory.map(e => [e.hostname, e]))

  const warrantyExpiringSoon = inventory.filter(e => {
    if (!e.warrantyExpiry) return false
    return new Date(e.warrantyExpiry) < new Date(Date.now() + 90 * 86400000)
  })
  const warrantyExpired = inventory.filter(e => {
    if (!e.warrantyExpiry) return false
    return new Date(e.warrantyExpiry) < new Date()
  })

  const failingDisks = disks.filter(d => d.smart.health === 'failing')
  const warrantyExpiringDisks = disks.filter(d => d.warrantyExpiry && new Date(d.warrantyExpiry) < new Date(Date.now() + 30 * 86400000))

  function exportServers() {
    exportCsv(servers.map(s => {
      const c = cmdb[s.hostname] ?? {}
      return {
        hostname: s.hostname, role: c.role ?? '', rack: s.rack, status: s.status,
        vendor: c.vendor ?? '', model: c.model ?? s.cpuModel, serial: c.serial ?? '',
        os: s.os, cpu_cores: s.cpuCores, memory_gib: s.memoryGiB,
        purchase_date: c.purchaseDate ?? '', warranty_expiry: c.warrantyExpiry ?? '',
        cost_usd: c.costUsd ?? '', uptime_s: s.uptime, last_seen: s.lastSeen,
      }
    }), 'vyndc-assets-servers.csv')
  }

  function exportDisks() {
    exportCsv(disks.map(d => ({
      hostname: d.hostname, rack: d.rack, slot: d.slot, type: d.type,
      capacity_gib: d.capacityGiB, used_gib: d.usedGiB, health: d.smart.health,
      age_years: d.age, warranty: d.warrantyExpiry || '',
    })), 'vyndc-assets-disks.csv')
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <Server size={14} className="text-orange-400 mb-2" />
          <div className="text-xl font-bold text-white">{servers.length}</div>
          <div className="text-xs text-slate-400">Total Servers</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <HardDrive size={14} className="text-orange-400 mb-2" />
          <div className="text-xl font-bold text-white">{disks.length}</div>
          <div className="text-xs text-slate-400">Total Disks</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          {warrantyExpired.length > 0
            ? <ShieldAlert size={14} className="text-red-400 mb-2" />
            : <ShieldCheck size={14} className="text-green-400 mb-2" />}
          <div className={`text-xl font-bold ${warrantyExpired.length > 0 ? 'text-red-400' : warrantyExpiringSoon.length > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {warrantyExpired.length > 0 ? warrantyExpired.length : warrantyExpiringSoon.length}
          </div>
          <div className="text-xs text-slate-400">{warrantyExpired.length > 0 ? 'Warranty Expired' : 'Warranty Expiring'}</div>
          <div className="text-[10px] text-slate-600">{warrantyExpired.length > 0 ? 'Needs renewal' : 'Within 90 days'}</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className={`text-xl font-bold ${failingDisks.length > 0 ? 'text-red-400' : 'text-white'}`}>{failingDisks.length}</div>
          <div className="text-xs text-slate-400">Failing Disks</div>
          <div className="text-[10px] text-slate-600">{disks.filter(d => d.smart.health === 'warning').length} warning</div>
        </div>
      </div>

      {/* Server Inventory Table */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Server size={13} className="text-orange-400" />
            <h3 className="text-xs font-bold text-white">Server Inventory</h3>
          </div>
          <button onClick={exportServers} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px]">
            <Download size={10} /> Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                {['Hostname','Role','Status','Vendor / Model','Serial','OS','Memory','Purchase Date','Warranty','Uptime'].map(h => (
                  <th key={h} className="text-left p-3 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {servers.map(s => {
                const c = cmdb[s.hostname] ?? {}
                const warrantyDate = c.warrantyExpiry ? new Date(c.warrantyExpiry) : null
                const now = new Date()
                const daysToWarranty = warrantyDate ? Math.ceil((warrantyDate.getTime() - now.getTime()) / 86400000) : null
                const warrantyColor = daysToWarranty === null ? 'text-slate-600'
                  : daysToWarranty < 0 ? 'text-red-400'
                  : daysToWarranty < 90 ? 'text-yellow-400'
                  : 'text-green-400'
                return (
                  <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    <td className="p-3 text-white font-medium">
                      <div className="flex items-center gap-1">
                        {(s.status === 'critical' || s.status === 'warning') && <AlertTriangle size={10} className={s.status === 'critical' ? 'text-red-400' : 'text-yellow-400'} />}
                        {s.hostname}
                      </div>
                    </td>
                    <td className="p-3 text-slate-400 whitespace-nowrap">{c.role ?? '—'}</td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[s.status]}`}>{s.status}</span>
                    </td>
                    <td className="p-3 text-slate-400 whitespace-nowrap">
                      <div className="text-slate-300">{c.vendor ?? '—'}</div>
                      <div className="text-[10px] text-slate-600">{c.model ?? s.cpuModel}</div>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[10px]">{c.serial ?? '—'}</td>
                    <td className="p-3 text-slate-400 whitespace-nowrap">{s.os}</td>
                    <td className="p-3 text-slate-400">{s.memoryGiB} GiB</td>
                    <td className="p-3 text-slate-500">{c.purchaseDate ?? '—'}</td>
                    <td className={`p-3 whitespace-nowrap ${warrantyColor}`}>
                      {c.warrantyExpiry
                        ? daysToWarranty !== null && daysToWarranty < 0
                          ? `Expired ${Math.abs(daysToWarranty)}d ago`
                          : `${c.warrantyExpiry} (${daysToWarranty}d)`
                        : '—'}
                    </td>
                    <td className="p-3 text-slate-500">{Math.floor(s.uptime / 86400)}d {Math.floor((s.uptime % 86400) / 3600)}h</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disk Inventory */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <HardDrive size={13} className="text-orange-400" />
            <h3 className="text-xs font-bold text-white">Disk Inventory</h3>
          </div>
          <button onClick={exportDisks} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px]">
            <Download size={10} /> Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                {['Host','Rack','Slot','Type','Capacity','Used%','Health','Warranty'].map(h => (
                  <th key={h} className="text-left p-3 text-slate-400 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {disks.map(d => {
                const usedPct = (d.usedGiB / d.capacityGiB) * 100
                return (
                  <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    <td className="p-3 text-white">{d.hostname}</td>
                    <td className="p-3 text-slate-400">{d.rack}</td>
                    <td className="p-3 text-slate-500">{d.slot}</td>
                    <td className="p-3 text-slate-400">{d.type}</td>
                    <td className="p-3 text-slate-300">{d.capacityGiB >= 1024 ? `${(d.capacityGiB/1024).toFixed(1)} TiB` : `${d.capacityGiB} GiB`}</td>
                    <td className="p-3"><span className={usedPct > 85 ? 'text-red-400' : usedPct > 70 ? 'text-yellow-400' : 'text-slate-400'}>{usedPct.toFixed(1)}%</span></td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${d.smart.health === 'failing' ? 'bg-red-500/20 text-red-400' : d.smart.health === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>{d.smart.health}</span>
                    </td>
                    <td className="p-3 text-slate-500">{d.warrantyExpiry || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
