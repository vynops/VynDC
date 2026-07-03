'use client'
import useSWR from 'swr'
import { Zap, Thermometer, Battery, TrendingUp } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import type { PowerMetrics } from '@/lib/simulation'

type PowerData = PowerMetrics & { isEstimated?: boolean }

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function PowerPage() {
  const { data: power } = useSWR<PowerData>('/api/power', fetcher, { refreshInterval: 30000 })
  if (!power) return <div className="p-6 text-slate-500 text-sm">Loading...</div>

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Estimated banner */}
      {power.isEstimated && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300">
          <Zap size={12} className="text-orange-400 flex-shrink-0" />
          <span><span className="font-semibold">Estimated power</span> — values derived from CPU utilisation × vCPU TDP. Connect a PDU via SNMP (Settings → Infrastructure) for hardware-accurate readings.</span>
        </div>
      )}
      {/* Top metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'PUE', value: power.pue.toFixed(2), sub: 'Power Usage Effectiveness', color: power.pue > 1.6 ? 'text-red-400' : power.pue > 1.4 ? 'text-yellow-400' : 'text-green-400', icon: Zap },
          { label: 'Total Power', value: `${power.totalPowerKw.toFixed(1)} kW`, sub: 'Facility draw', color: 'text-white', icon: Zap },
          { label: 'IT Load', value: `${power.itLoadKw.toFixed(1)} kW`, sub: 'Servers + network', color: 'text-orange-400', icon: Zap },
          { label: 'Cooling', value: `${power.coolingKw.toFixed(1)} kW`, sub: 'HVAC + CRAC', color: 'text-blue-400', icon: Thermometer },
          { label: 'Daily Cost', value: `$${power.dailyCostUsd.toFixed(0)}`, sub: `$${(power.costPerKwhUsd).toFixed(3)}/kWh`, color: 'text-white', icon: TrendingUp },
          { label: 'Monthly Est.', value: `$${power.monthlyCostUsd.toFixed(0)}`, sub: 'Projected', color: 'text-orange-400', icon: TrendingUp },
        ].map(card => (
          <div key={card.label} className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
            <card.icon size={14} className="text-orange-400 mb-2" />
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{card.label}</div>
            <div className="text-[10px] text-slate-600">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* UPS Status */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Battery size={14} className="text-orange-400" />
          <h3 className="text-sm font-bold text-white">UPS Status</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className={`text-2xl font-bold ${power.upsLoadPct > 80 ? 'text-red-400' : 'text-white'}`}>{power.upsLoadPct.toFixed(0)}%</div>
            <div className="text-xs text-slate-400">Load</div>
            <div className="mt-1 h-1.5 bg-slate-800 rounded-full"><div className={`h-1.5 rounded-full ${power.upsLoadPct > 80 ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${power.upsLoadPct}%` }} /></div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${power.upsBatteryPct < 30 ? 'text-red-400' : power.upsBatteryPct < 60 ? 'text-yellow-400' : 'text-green-400'}`}>{power.upsBatteryPct.toFixed(0)}%</div>
            <div className="text-xs text-slate-400">Battery</div>
            <div className="mt-1 h-1.5 bg-slate-800 rounded-full"><div className={`h-1.5 rounded-full ${power.upsBatteryPct < 30 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${power.upsBatteryPct}%` }} /></div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{power.upsRuntimeMin}m</div>
            <div className="text-xs text-slate-400">Runtime</div>
            <div className="text-[10px] text-slate-600 mt-1">At current load</div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Power + PUE trend */}
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-orange-400" />
            <h3 className="text-sm font-bold text-white">Power Trend — 24h</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={power.hourlyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gPower" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="powerKw" name="Power (kW)" stroke="#f97316" fill="url(#gPower)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Per-rack power */}
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-orange-400" />
            <h3 className="text-sm font-bold text-white">Per-Rack Power Draw</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={power.rackPower} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(val: number, name: string) => [`${val}W`, name === 'powerW' ? 'Power' : 'Capacity']} />
              <Bar dataKey="powerW" name="Power" radius={[4,4,0,0]}>
                {power.rackPower.map((r, i) => (
                  <Cell key={i} fill={(r.powerW / r.capW) > 0.8 ? '#ef4444' : '#f97316'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
