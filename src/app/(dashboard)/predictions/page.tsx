'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Brain, Clock, AlertTriangle } from 'lucide-react'
import type { Prediction } from '@/lib/simulation'

const fetcher = async (url: string): Promise<Prediction[]> => {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json() as unknown
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Unable to load predictions'
    throw new Error(message)
  }
  if (!Array.isArray(data)) throw new Error('Invalid predictions response')
  return data as Prediction[]
}

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
}

const COMP_BADGE: Record<string, string> = {
  disk: 'bg-slate-700 text-slate-300',
  cpu: 'bg-blue-900/40 text-blue-400',
  memory: 'bg-purple-900/40 text-purple-400',
  network: 'bg-cyan-900/40 text-cyan-400',
  psu: 'bg-orange-900/40 text-orange-400',
}

export default function PredictionsPage() {
  const { data, error, isLoading, mutate } = useSWR<Prediction[]>('/api/predictions', fetcher, { refreshInterval: 30000 })
  const predictions = data ?? []
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterComponent, setFilterComponent] = useState('all')

  const components = [...new Set(predictions.map(p => p.component))]
  const filtered = predictions.filter(p => {
    if (filterSeverity !== 'all' && p.severity !== filterSeverity) return false
    if (filterComponent !== 'all' && p.component !== filterComponent) return false
    return true
  })

  const criticalCount = predictions.filter(p => p.severity === 'critical').length
  const within7d = predictions.filter(p => p.estimatedDaysToFailure <= 7).length
  const avgConfidence = predictions.length ? (predictions.reduce((a, p) => a + p.confidence, 0) / predictions.length).toFixed(0) : 0

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="flex-1">{error instanceof Error ? error.message : 'Unable to load predictions'}</span>
          <button onClick={() => void mutate()} className="shrink-0 underline hover:text-rose-100">Retry</button>
        </div>
      )}

      {isLoading && !data && (
        <div className="rounded-xl border border-slate-800/60 bg-[#111827] p-8 text-center text-sm text-slate-500">
          Loading predictions…
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <Brain size={14} className="text-purple-400 mb-2" />
          <div className="text-xl font-bold text-white">{predictions.length}</div>
          <div className="text-xs text-slate-400">Active Predictions</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className={`text-xl font-bold ${criticalCount > 0 ? 'text-red-400' : 'text-white'}`}>{criticalCount}</div>
          <div className="text-xs text-slate-400">Critical Severity</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className={`text-xl font-bold ${within7d > 0 ? 'text-orange-400' : 'text-white'}`}>{within7d}</div>
          <div className="text-xs text-slate-400">Failure Within 7d</div>
        </div>
        <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4">
          <div className="text-xl font-bold text-purple-400">{avgConfidence}%</div>
          <div className="text-xs text-slate-400">Avg Confidence</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All severity</option>
          {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterComponent} onChange={e => setFilterComponent(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
          <option value="all">All components</option>
          {components.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Prediction cards */}
      {!isLoading && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(pred => (
          <div key={pred.id} className="bg-[#111827] border border-slate-800/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className={pred.severity === 'critical' ? 'text-red-400' : pred.severity === 'high' ? 'text-orange-400' : 'text-yellow-400'} />
                <span className="text-sm font-bold text-white">{pred.hostname}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEV_BADGE[pred.severity]}`}>{pred.severity.toUpperCase()}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${COMP_BADGE[pred.component] || 'bg-slate-700 text-slate-300'}`}>{pred.component.toUpperCase()}</span>
              <span className="text-xs text-slate-500">{pred.rack}</span>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed">{pred.reason}</div>

            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-slate-500">Confidence</span>
                <span className="text-purple-400 font-bold">{pred.confidence}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full">
                <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${pred.confidence}%` }} />
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1 text-slate-500">
                <Clock size={10} />
                <span>Est. failure in <span className={pred.estimatedDaysToFailure <= 3 ? 'text-red-400 font-bold' : pred.estimatedDaysToFailure <= 7 ? 'text-orange-400 font-bold' : 'text-slate-300'}>{pred.estimatedDaysToFailure} days</span></span>
              </div>
              <Brain size={11} className="text-purple-400/60" />
            </div>
          </div>
        ))}
        {filtered.length === 0 && predictions.length === 0 && (
          <div className="col-span-full bg-[#111827] border border-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <div className="text-green-400 text-2xl">✓</div>
            <div className="text-sm font-medium text-slate-300">All systems healthy</div>
            <div className="text-xs text-slate-500">No failure predictions detected — all metrics are within normal thresholds</div>
          </div>
        )}
        {filtered.length === 0 && predictions.length > 0 && (
          <div className="col-span-full bg-[#111827] border border-slate-800/60 rounded-2xl p-8 text-center text-slate-500 text-sm">
            No predictions match the current filters
          </div>
        )}
      </div>}
    </div>
  )
}
