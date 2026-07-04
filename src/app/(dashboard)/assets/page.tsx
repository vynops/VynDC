'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Server, HardDrive, Download, AlertTriangle, ShieldCheck, ShieldAlert, X, Cpu, MemoryStick, Thermometer, Zap, Network, MapPin, Clock } from 'lucide-react'
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
  const [selectedServer, setSelectedServer] = useState<ServerType | null>(null)
  const [selectedDisk, setSelectedDisk] = useState<DiskAsset | null>(null)

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
    <>
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
                  <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors" onClick={() => setSelectedServer(s)}>
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
                  <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors" onClick={() => setSelectedDisk(d)}>
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

    {/* Server Detail Drawer */}
    {selectedServer && (() => {
      const s = selectedServer
      const c = cmdb[s.hostname] ?? {}
      const warrantyDate = c.warrantyExpiry ? new Date(c.warrantyExpiry) : null
      const daysToWarranty = warrantyDate ? Math.ceil((warrantyDate.getTime() - Date.now()) / 86400000) : null
      const wColor = daysToWarranty === null ? 'text-slate-500' : daysToWarranty < 0 ? 'text-red-400' : daysToWarranty < 90 ? 'text-yellow-400' : 'text-green-400'
      const cpuBar = Math.min(100, s.cpuUsagePct)
      const memBar = Math.min(100, (s.memoryUsedGiB / s.memoryGiB) * 100)
      const pwrBar = Math.min(100, (s.powerWatts / (s.powerCapWatts || 1)) * 100)
      return (
        <div className="fixed inset-0 bg-black/25 z-50 flex justify-end" onClick={() => setSelectedServer(null)}>
          <div className="w-full max-w-md bg-[#0d1117] border-l border-slate-800 h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-[#0d1117] border-b border-slate-800 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <div className="flex items-center gap-2">
                  <Server size={14} className="text-orange-400" />
                  <span className="text-sm font-bold text-white">{s.hostname}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[s.status]}`}>{s.status}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{c.role ?? 'Server'} · {s.rack} U{s.uPosition}</div>
              </div>
              <button onClick={() => setSelectedServer(null)} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Live metrics */}
              <Section2 icon={Cpu} title="Live Metrics">
                <MetricBar label="CPU" value={`${s.cpuUsagePct}%`} pct={cpuBar} color={cpuBar > 90 ? 'bg-red-500' : cpuBar > 75 ? 'bg-orange-500' : 'bg-green-500'} />
                <MetricBar label="Memory" value={`${s.memoryUsedGiB.toFixed(1)} / ${s.memoryGiB} GiB`} pct={memBar} color={memBar > 90 ? 'bg-red-500' : memBar > 75 ? 'bg-orange-500' : 'bg-blue-500'} />
                <MetricBar label="Power" value={`${s.powerWatts}W / ${s.powerCapWatts}W`} pct={pwrBar} color={pwrBar > 90 ? 'bg-red-500' : pwrBar > 75 ? 'bg-yellow-500' : 'bg-purple-500'} />
                <InfoRow label="Temperature" value={`${s.tempCelsius}°C`} valueClass={s.tempCelsius > 80 ? 'text-red-400' : s.tempCelsius > 70 ? 'text-yellow-400' : 'text-green-400'} />
                <InfoRow label="Uptime" value={`${Math.floor(s.uptime/86400)}d ${Math.floor((s.uptime%86400)/3600)}h`} />
                <InfoRow label="Last Seen" value={new Date(s.lastSeen).toLocaleString()} />
              </Section2>

              {/* Hardware */}
              <Section2 icon={Server} title="Hardware">
                <InfoRow label="CPU Model" value={s.cpuModel} />
                <InfoRow label="CPU Cores" value={String(s.cpuCores)} />
                <InfoRow label="Memory" value={`${s.memoryGiB} GiB`} />
                <InfoRow label="Disks" value={`${s.diskCount} disk${s.diskCount !== 1 ? 's' : ''} · ${s.diskTotalTiB.toFixed(1)} TiB total`} />
                <InfoRow label="OS" value={s.os} />
                <InfoRow label="IPMI" value={s.ipmi || '—'} mono />
              </Section2>

              {/* Network interfaces */}
              {s.networkInterfaces?.length > 0 && (
                <Section2 icon={Network} title="Network Interfaces">
                  {s.networkInterfaces.map((n, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0">
                      <span className="text-xs font-mono text-slate-300">{n.name ?? `eth${i}`}</span>
                      <div className="text-right text-[11px] text-slate-500">
                        <div>{n.speedGbps} Gbps</div>
                        {(n.rxMbps != null || n.txMbps != null) && <div>↓{n.rxMbps?.toFixed(1)} ↑{n.txMbps?.toFixed(1)} Mbps</div>}
                      </div>
                    </div>
                  ))}
                </Section2>
              )}

              {/* Physical */}
              <Section2 icon={MapPin} title="Physical Location">
                <InfoRow label="Rack" value={s.rack} />
                <InfoRow label="U Position" value={`U${s.uPosition} (${s.uHeight}U height)`} />
              </Section2>

              {/* CMDB / Asset */}
              <Section2 icon={ShieldCheck} title="Asset / CMDB">
                <InfoRow label="Vendor" value={c.vendor || '—'} />
                <InfoRow label="Model" value={c.model || '—'} />
                <InfoRow label="Serial" value={c.serial || '—'} mono />
                <InfoRow label="Purchase Date" value={c.purchaseDate || '—'} />
                <InfoRow label="Warranty" value={
                  c.warrantyExpiry
                    ? daysToWarranty !== null && daysToWarranty < 0
                      ? `Expired ${Math.abs(daysToWarranty)}d ago`
                      : `${c.warrantyExpiry} (${daysToWarranty}d left)`
                    : '—'
                } valueClass={wColor} />
                <InfoRow label="Cost" value={c.costUsd ? `$${c.costUsd.toLocaleString()}` : '—'} />
                <InfoRow label="Location" value={c.location || '—'} />
              </Section2>
            </div>
          </div>
        </div>
      )
    })()}

    {/* ── Disk Detail Drawer ────────────────────────────────────────────── */}
    {selectedDisk && (() => {
      const d = selectedDisk
      const usedPct = (d.usedGiB / d.capacityGiB) * 100
      const wDate = d.warrantyExpiry ? new Date(d.warrantyExpiry) : null
      const wDays = wDate ? Math.ceil((wDate.getTime() - Date.now()) / 86400000) : null
      const wColor = wDays === null ? 'text-slate-500' : wDays < 0 ? 'text-red-400' : wDays < 90 ? 'text-yellow-400' : 'text-green-400'
      const healthColor = d.smart.health === 'failing' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : d.smart.health === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-green-500/10 text-green-400 border border-green-500/20'
      const tempColor = d.smart.temperature > 50 ? 'text-red-400' : d.smart.temperature > 40 ? 'text-yellow-400' : 'text-green-400'
      return (
        <div className="fixed inset-0 bg-black/25 z-50 flex justify-end" onClick={() => setSelectedDisk(null)}>
          <div className="w-full max-w-md bg-[#0d1117] border-l border-slate-800 h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-[#0d1117] border-b border-slate-800 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <div className="flex items-center gap-2">
                  <HardDrive size={14} className="text-orange-400" />
                  <span className="text-sm font-bold text-white">{d.hostname} / {d.slot}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${healthColor}`}>{d.smart.health}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{d.type} · {d.rack} · {d.model}</div>
              </div>
              <button onClick={() => setSelectedDisk(null)} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Storage utilisation */}
              <Section2 icon={HardDrive} title="Storage">
                <MetricBar
                  label="Used"
                  value={`${d.usedGiB >= 1024 ? (d.usedGiB/1024).toFixed(1)+' TiB' : d.usedGiB+' GiB'} / ${d.capacityGiB >= 1024 ? (d.capacityGiB/1024).toFixed(1)+' TiB' : d.capacityGiB+' GiB'}`}
                  pct={usedPct}
                  color={usedPct > 85 ? 'bg-red-500' : usedPct > 70 ? 'bg-yellow-500' : 'bg-blue-500'}
                />
                <InfoRow label="Model" value={d.model} />
                <InfoRow label="Type" value={d.type} />
                <InfoRow label="Capacity" value={d.capacityGiB >= 1024 ? `${(d.capacityGiB/1024).toFixed(1)} TiB` : `${d.capacityGiB} GiB`} />
                <InfoRow label="Free" value={(() => { const free = d.capacityGiB - d.usedGiB; return free >= 1024 ? `${(free/1024).toFixed(1)} TiB` : `${free} GiB` })()} />
              </Section2>

              {/* SMART */}
              <Section2 icon={Thermometer} title="SMART Health">
                <InfoRow label="Health" value={d.smart.health.toUpperCase()} valueClass={d.smart.health === 'failing' ? 'text-red-400 font-bold' : d.smart.health === 'warning' ? 'text-yellow-400 font-bold' : 'text-green-400'} />
                <InfoRow label="Temperature" value={`${d.smart.temperature}°C`} valueClass={tempColor} />
                <InfoRow label="Reallocated Sectors" value={String(d.smart.reallocatedSectors)} valueClass={d.smart.reallocatedSectors > 0 ? 'text-red-400 font-bold' : 'text-green-400'} />
                <InfoRow label="Power-On Hours" value={`${d.smart.powerOnHours.toLocaleString()} h (${Math.round(d.smart.powerOnHours/8760*10)/10} yrs)`} />
              </Section2>

              {/* Lifecycle */}
              <Section2 icon={Clock} title="Lifecycle">
                <InfoRow label="Disk Age" value={`${d.age} year${d.age !== 1 ? 's' : ''}`} valueClass={d.age >= 5 ? 'text-red-400' : d.age >= 3 ? 'text-yellow-400' : 'text-slate-300'} />
                <InfoRow label="Warranty Expiry" value={
                  d.warrantyExpiry
                    ? wDays !== null && wDays < 0
                      ? `Expired ${Math.abs(wDays)}d ago`
                      : `${d.warrantyExpiry} (${wDays}d left)`
                    : '—'
                } valueClass={wColor} />
                <InfoRow label="Replacement Due" value={d.replacementDue || '—'} valueClass={d.replacementDue ? 'text-orange-400' : 'text-slate-500'} />
              </Section2>

              {/* Physical */}
              <Section2 icon={MapPin} title="Physical Location">
                <InfoRow label="Host" value={d.hostname} />
                <InfoRow label="Rack" value={d.rack} />
                <InfoRow label="Slot" value={d.slot} />
              </Section2>
            </div>
          </div>
        </div>
      )
    })()}
    </>
  )
}

function Section2({ icon: Icon, title, children }: { icon: React.ComponentType<{size?:number;className?:string}>; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={11} className="text-orange-400" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl divide-y divide-slate-800/50">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 gap-4">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className={`text-[11px] text-right break-all ${mono ? 'font-mono' : ''} ${valueClass ?? 'text-slate-300'}`}>{value}</span>
    </div>
  )
}

function MetricBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-300">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
