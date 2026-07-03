'use client'

import { usePathname } from 'next/navigation'
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
  '/predictions': { title: 'Predictions',     subtitle: 'AI-powered failure forecasts' },
  '/assets':      { title: 'Assets',          subtitle: 'Full server & disk inventory' },
  '/copilot':     { title: 'AI Copilot',      subtitle: 'Ask anything about your datacenter' },
  '/team':        { title: 'Team',            subtitle: 'User management & roles' },
  '/settings':    { title: 'Settings',        subtitle: 'Infrastructure & alert configuration' },
}

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const page = PAGE_TITLES[pathname] ?? { title: 'VynDC', subtitle: '' }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={page.title} subtitle={page.subtitle} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
