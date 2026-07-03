'use client'
import useSWR from 'swr'
import { LayoutDashboard, Server, AlertTriangle, Brain, Zap, HardDrive, TrendingUp, Activity } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { OverviewMetrics, Incident, Prediction } from '@/lib/simulation'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_COLORS = { healthy: 'text-green-400', warning: 'text-yellow-400', critical: 'text-red-400', offline: 'text-slate-500' }
const SEV_COLORS: Record<string, string> = { critical: 'bg-red-500/20 text-red-400 border border-red-500/30', high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30', medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', low: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' }

function StatCard({ label, value, sub, icon: Icon, color = 'text-white' }: { label: string; value: string | number; sub?: string; icon: React.ComponentType<{size?:number;className?:string}>; color?: string }) {
  return (
    <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4 flex items-start gap-3">
      <div className="p-2 bg-slate-800/60 rounded-xl shrink-0"><Icon size={16} className="text-orange-400" /></div>
      <div className="min-w-0">
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-slate-400 mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-slate-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const { data: overview } = useSWR<OverviewMetrics>('/api/overview', fetcher, { refreshInterval: 30000 })
  const { data: incidents } = useSWR<Incident[]>('/api/incidents', fetcher, { refreshInterval: 30000 })
  const { data: predictions } = useSWR<Prediction[]>('/api/predictions', fetcher, { refreshInterval: 30000 })

  if (!overview) return <div className="p-6 text-slate-500 text-sm">Loading...</div>

  const recentIncidents = (incidents || []).filter(i => i.status === 'open').slice(0, 5)
  const topPredictions = (predictions || []).slice(0, 3)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Server Health Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Servers" value={overview.totalServers} icon={Server} />
        <StatCard label="Healthy" value={overview.healthyServers} icon={Activity} color="text-green-400" />
        <StatCard label="Warning" value={overview.warningServers} icon={AlertTriangle} color="text-yellow-400" />
        <StatCard label="Critical" value={overview.criticalServers} icon={AlertTriangle} color="text-red-400" />
        <StatCard label="Offline" value={overview.offlineServers} icon={Server} color="text-slate-500" />
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Avg PUE" value={overview.avgPue.toFixed(2)} sub="Power Usage Effectiveness" icon={Zap} color="text-orange-400" />
        <StatCard label="Total Power" value={`${overview.totalPowerKw.toFixed(1)} kW`} sub="IT Load" icon={Zap} />
        <StatCard label="Open Incidents" value={overview.openIncidents} sub={`${overview.criticalIncidents} critical`} icon={AlertTriangle} color={overview.criticalIncidents > 0 ? 'text-red-400' : 'text-white'} />
        <StatCard label="AI Predictions" value={overview.activePredictions} sub="Predicted failures" icon={Brain} color="text-purple-400" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incident Trend */}
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange-400" />
              <h3 className="text-sm font-bold text-white">Incident Trend — 7 Days</h3>
            </div>
            <a href="/incidents" className="text-[11px] text-orange-400 hover:text-orange-300">View all →</a>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={overview.incidentTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="critical" stackId="a" fill="#ef4444" radius={[0,0,0,0]} />
              <Bar dataKey="high" stackId="a" fill="#f97316" radius={[0,0,0,0]} />
              <Bar dataKey="medium" stackId="a" fill="#eab308" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Server Status History */}
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-orange-400" />
              <h3 className="text-sm font-bold text-white">Server Health — 24h</h3>
            </div>
            <a href="/servers" className="text-[11px] text-orange-400 hover:text-orange-300">View all →</a>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={overview.serverStatusHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gHealthy" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                <linearGradient id="gWarning" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#eab308" stopOpacity={0.3} /><stop offset="95%" stopColor="#eab308" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="healthy" stroke="#22c55e" fill="url(#gHealthy)" strokeWidth={2} />
              <Area type="monotone" dataKey="warning" stroke="#eab308" fill="url(#gWarning)" strokeWidth={2} />
              <Area type="monotone" dataKey="critical" stroke="#ef4444" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Open Incidents */}
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange-400" />
              <h3 className="text-sm font-bold text-white">Open Incidents</h3>
            </div>
            <a href="/incidents" className="text-[11px] text-orange-400 hover:text-orange-300">View all →</a>
          </div>
          {recentIncidents.length === 0
            ? <div className="text-xs text-slate-500 py-4 text-center">No open incidents</div>
            : <div className="space-y-2">
              {recentIncidents.map(inc => (
                <div key={inc.id} className="flex items-start gap-2 p-2 rounded-xl bg-slate-900/50">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${SEV_COLORS[inc.severity]}`}>{inc.severity.toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white truncate">{inc.title}</div>
                    <div className="text-[10px] text-slate-500">{inc.hostname} · {inc.rack}</div>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>

        {/* Top Predictions */}
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-purple-400" />
              <h3 className="text-sm font-bold text-white">AI Failure Predictions</h3>
            </div>
            <a href="/predictions" className="text-[11px] text-orange-400 hover:text-orange-300">View all →</a>
          </div>
          {topPredictions.length === 0
            ? <div className="text-xs text-slate-500 py-4 text-center">No active predictions</div>
            : <div className="space-y-2">
              {topPredictions.map(pred => (
                <div key={pred.id} className="p-2 rounded-xl bg-slate-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white font-medium">{pred.hostname}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${SEV_COLORS[pred.severity]}`}>{pred.estimatedDaysToFailure}d</span>
                  </div>
                  <div className="text-[10px] text-slate-400">{pred.component.toUpperCase()} · {pred.confidence}% confidence</div>
                  <div className="w-full bg-slate-800 rounded-full h-1">
                    <div className="h-1 rounded-full bg-orange-500" style={{ width: `${pred.confidence}%` }} />
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      </div>

      {/* Storage + Network quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4 flex items-center gap-3">
          <HardDrive size={20} className="text-orange-400 shrink-0" />
          <div className="flex-1">
            <div className="text-xl font-bold text-white">{overview.storageUsedPct.toFixed(1)}%</div>
            <div className="text-xs text-slate-400">Storage Used</div>
          </div>
          <a href="/storage" className="text-[11px] text-orange-400 hover:text-orange-300 shrink-0">View all →</a>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4 flex items-center gap-3">
          <LayoutDashboard size={20} className="text-orange-400 shrink-0" />
          <div className="flex-1">
            <div className="text-xl font-bold text-white">{overview.networkUtilPct.toFixed(1)}%</div>
            <div className="text-xs text-slate-400">Network Utilisation</div>
          </div>
          <a href="/network" className="text-[11px] text-orange-400 hover:text-orange-300 shrink-0">View all →</a>
        </div>
      </div>
    </div>
  )
}
