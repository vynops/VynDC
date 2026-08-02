'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, LogOut, Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { DataSourceStatus } from '@/lib/data-source-status'

interface HeaderProps {
  title: string
  subtitle?: string
  onRefresh?: () => void
  refreshing?: boolean
  actions?: React.ReactNode
  dataSourceStatus?: DataSourceStatus | null
}

export default function Header({ title, subtitle, onRefresh, refreshing, actions, dataSourceStatus }: HeaderProps) {
  const router = useRouter()
  const [openIncidents, setOpenIncidents] = useState<number | null>(null)

  function refreshPage() {
    if (onRefresh) {
      onRefresh()
      return
    }
    window.location.reload()
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  useEffect(() => {
    let active = true

    async function loadOpenIncidents() {
      try {
        const response = await fetch('/api/overview', { cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to read overview')
        const overview = await response.json() as { openIncidents?: number }
        if (active) setOpenIncidents(overview.openIncidents ?? 0)
      } catch {
        if (active) setOpenIncidents(0)
      }
    }

    loadOpenIncidents()
    const timer = window.setInterval(loadOpenIncidents, 30000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const statusTone = dataSourceStatus?.mode === 'live'
    ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-300'
    : dataSourceStatus?.mode === 'partial'
      ? 'border-amber-500/20 bg-amber-500/8 text-amber-300'
      : 'border-slate-700/60 bg-slate-900/40 text-slate-300'

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-sm flex-shrink-0 lg:pl-6 pl-16">
      <div className="min-w-0">
        <h1 className="text-white font-semibold text-[1.05rem] leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-400 text-xs mt-1.5">{subtitle}</p>}
        <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${statusTone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dataSourceStatus?.mode === 'live' ? 'bg-emerald-400' : dataSourceStatus?.mode === 'partial' ? 'bg-amber-400' : 'bg-slate-400'}`} />
          <span>{dataSourceStatus?.label ?? 'Checking data source…'}</span>
        </div>
        {dataSourceStatus?.summary && <p className="mt-1.5 text-[11px] text-slate-500 max-w-[42rem]">{dataSourceStatus.summary}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {actions}
        <button
          onClick={refreshPage}
          disabled={refreshing}
          title="Refresh"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => router.push('/incidents')}
          title="Incidents"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-amber-300"
        >
          <Bell size={16} />
          {openIncidents !== null && openIncidents > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-950" />
          )}
        </button>
        <button
          onClick={logout}
          title="Sign out"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-red-400"
        >
          <LogOut size={15} />
          <span>DataCenter</span>
        </button>
      </div>
    </header>
  )
}

