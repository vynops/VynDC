'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { DataSourceStatus } from '@/lib/data-source-status'
import Sidebar from './Sidebar'
import Header from './Header'

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/overview':    { title: 'Overview',        subtitle: 'Datacenter health at a glance' },
  '/servers':     { title: 'Servers',         subtitle: 'Live server inventory & metrics' },
  '/rack':        { title: 'Rack View',       subtitle: 'Physical rack layout & occupancy' },
  '/power':       { title: 'Power & Cooling', subtitle: 'Energy consumption & PUE' },
  '/storage':     { title: 'Storage',         subtitle: 'Disk inventory & SMART health' },
  '/network':     { title: 'Network',         subtitle: 'Interface traffic & errors' },
  '/incidents':   { title: 'Incidents',       subtitle: 'Open alerts & issue tracking' },
  '/maintenance': { title: 'Maintenance',     subtitle: 'Scheduled windows & alert suppression' },
  '/predictions': { title: 'Predictions',     subtitle: 'AI-powered failure forecasts' },
  '/assets':      { title: 'Assets',          subtitle: 'Full server & disk inventory' },
  '/copilot':     { title: 'AI Copilot',      subtitle: 'Ask anything about your datacenter' },
  '/automation':  { title: 'Automation',      subtitle: 'Runbooks and workflow execution' },
  '/autonomous-ops': { title: 'Autonomous Ops', subtitle: 'Automation policy and safety controls' },
  '/team':        { title: 'Team',            subtitle: 'User management & roles' },
  '/settings':    { title: 'Settings',        subtitle: 'Infrastructure & alert configuration' },
}

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const page = PAGE_TITLES[pathname] ?? { title: 'VynDC', subtitle: '' }
  const [dataSourceStatus, setDataSourceStatus] = useState<DataSourceStatus | null>(null)

  useEffect(() => {
    let active = true

    async function loadStatus() {
      try {
        const response = await fetch('/api/status', { cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to read data source status')
        const status = await response.json() as DataSourceStatus
        if (active) setDataSourceStatus(status)
      } catch {
        if (active) {
          setDataSourceStatus({
            mode: 'demo',
            label: 'Demo mode',
            summary: 'Showing sample datacenter data while the status check is unavailable.',
            sources: {
              prometheus: { configured: false, connected: false },
              alertmanager: { configured: false, connected: false },
            },
          })
        }
      }
    }

    loadStatus()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={page.title} subtitle={page.subtitle} dataSourceStatus={dataSourceStatus} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
