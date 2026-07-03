'use client'
import useSWR from 'swr'
import type { RackSummary, Server } from '@/lib/simulation'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_COLOR: Record<string, string> = {
  healthy: 'bg-green-500',
  warning: 'bg-yellow-400',
  critical: 'bg-red-500',
  offline: 'bg-slate-600',
}

export default function RackPage() {
  const { data: racks = [] } = useSWR<RackSummary[]>('/api/racks', fetcher, { refreshInterval: 30000 })
  const { data: servers = [] } = useSWR<Server[]>('/api/servers', fetcher, { refreshInterval: 30000 })

  const serverMap = new Map(servers.map(s => [s.id, s]))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {racks.map(rack => {
          const rackServers = rack.servers.map(id => serverMap.get(id)).filter(Boolean) as Server[]
          const powerPct = (rack.totalPowerW / rack.powerCapW) * 100
          const usedPct = (rack.usedU / rack.totalU) * 100

          // Build U-slot map
          const slots: { server: Server | null; isTop: boolean }[] = Array.from({ length: rack.totalU }, () => ({ server: null, isTop: false }))
          rackServers.forEach(srv => {
            const uIdx = srv.uPosition - 1
            for (let u = 0; u < srv.uHeight; u++) {
              if (uIdx + u < slots.length) {
                slots[uIdx + u].server = srv
                slots[uIdx + u].isTop = u === 0
              }
            }
          })

          return (
            <div key={rack.id} className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-bold text-white">{rack.label}</div>
                  <div className="text-[11px] text-slate-500">{rack.location}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">{rack.usedU}/{rack.totalU}U</div>
                  <div className="text-[10px] text-slate-600">{rack.totalPowerW}W</div>
                </div>
              </div>

              {/* Rack diagram */}
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 space-y-px">
                {slots.map((slot, i) => {
                  if (slot.server && !slot.isTop) return null
                  if (!slot.server) {
                    return (
                      <div key={i} className="h-2 rounded-sm bg-slate-800/50" title={`U${rack.totalU - i}`} />
                    )
                  }
                  const srv = slot.server
                  const heightPx = Math.max(8, srv.uHeight * 10)
                  return (
                    <div key={i} title={`${srv.hostname} — ${srv.status} — CPU:${srv.cpuUsagePct.toFixed(0)}% Temp:${srv.tempCelsius}°C`}
                      className={`rounded-sm cursor-pointer flex items-center px-1.5 group relative transition-all ${STATUS_COLOR[srv.status]}`}
                      style={{ height: `${heightPx}px` }}>
                      <span className="text-[8px] font-bold text-black/70 truncate leading-none group-hover:text-black">
                        {srv.hostname.replace('rack', '').replace(/[a-z]+/i, '')}
                      </span>
                      {/* Tooltip */}
                      <div className="absolute left-full ml-2 top-0 z-10 hidden group-hover:block bg-slate-900 border border-slate-700 rounded-lg p-2 text-[10px] whitespace-nowrap shadow-xl">
                        <div className="font-bold text-white">{srv.hostname}</div>
                        <div className="text-slate-400">U{srv.uPosition} · {srv.uHeight}U</div>
                        <div className="text-slate-400">CPU {srv.cpuUsagePct.toFixed(1)}% · {srv.tempCelsius}°C · {srv.powerWatts}W</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Rack stats */}
              <div className="mt-3 space-y-1.5">
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-slate-500">U Utilisation</span>
                    <span className="text-slate-400">{usedPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full">
                    <div className="h-1 rounded-full bg-orange-500/70" style={{ width: `${usedPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-slate-500">Power</span>
                    <span className={powerPct > 80 ? 'text-red-400' : 'text-slate-400'}>{powerPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full">
                    <div className={`h-1 rounded-full ${powerPct > 80 ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${powerPct}%` }} />
                  </div>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">Temp</span>
                  <span className={rack.tempCelsius > 28 ? 'text-red-400' : 'text-slate-400'}>{rack.tempCelsius}°C</span>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-2">
                {(['healthy','warning','critical','offline'] as const).map(s => (
                  <div key={s} className="flex items-center gap-1 text-[9px] text-slate-500">
                    <div className={`w-2 h-2 rounded-sm ${STATUS_COLOR[s]}`} />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
