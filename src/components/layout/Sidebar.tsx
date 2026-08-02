'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import useSWR from 'swr'
import {
  LayoutDashboard, Server, Layers, Zap, HardDrive, Network,
  AlertTriangle, Brain, Package, Bot, Users, Settings, ShieldCheck,
  LogOut, Menu, X, ChevronRight, Phone, GitBranch, Timer, CalendarClock, PlayCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Fleet',
    items: [
      { href: '/overview', label: 'Overview', icon: LayoutDashboard },
      { href: '/servers', label: 'Servers', icon: Server },
      { href: '/rack', label: 'Rack View', icon: Layers },
      { href: '/power', label: 'Power & Cooling', icon: Zap },
      { href: '/storage', label: 'Storage', icon: HardDrive },
      { href: '/network', label: 'Network', icon: Network },
    ],
  },
  {
    label: 'Observe',
    items: [
      { href: '/assets', label: 'Assets', icon: Package },
      { href: '/predictions', label: 'Predictions', icon: Brain },
      { href: '/copilot', label: 'AI Copilot', icon: Bot },
      { href: '/automation', label: 'Automation', icon: PlayCircle },
      { href: '/autonomous-ops', label: 'Autonomous Ops', icon: ShieldCheck },
    ],
  },
  {
    label: 'Operate',
    items: [
      { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
      { href: '/maintenance', label: 'Maintenance', icon: CalendarClock },
      { href: '/oncall', label: 'On-Call', icon: Phone },
      { href: '/routing', label: 'Routing & Escalations', icon: GitBranch },
      { href: '/sla', label: 'SLA Tracker', icon: Timer },
    ],
  },
]

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const fetcher = (url: string) => fetch(url).then(r => r.json())

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
        active
          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-orange-400' : 'text-slate-500 group-hover:text-slate-300')} />
      {item.label}
      {active && <ChevronRight className="w-3 h-3 ml-auto text-orange-500" />}
    </Link>
  )
}

interface SidebarContentProps {
  pathname: string
  onClose?: () => void
}

function SidebarContent({ pathname, onClose }: SidebarContentProps) {
  const router = useRouter()
  const { data: me } = useSWR('/api/auth/me', fetcher)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-800/60">
        <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
          <Server className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-base leading-none">VynDC</div>
          <div className="text-slate-500 text-xs leading-none mt-0.5">Datacenter Ops</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map(item => (
                <NavLink key={item.href} item={item} active={pathname === item.href} onClick={onClose} />
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-slate-800/60 pt-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">
            Admin
          </div>
          {BOTTOM_ITEMS.map(item => (
            <NavLink key={item.href} item={item} active={pathname === item.href} onClick={onClose} />
          ))}
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-slate-800/60 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-400 text-xs font-bold">
              {me?.name ? me.name.charAt(0).toUpperCase() : '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-white truncate">{me?.name ?? '…'}</div>
            <div className="text-[9px] text-slate-500 uppercase font-bold truncate">{me?.role ?? ''}</div>
          </div>
          <button onClick={handleLogout} title="Sign out"
            className="p-1 rounded-lg hover:bg-slate-700 text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0">
            <LogOut size={12} />
          </button>
        </div>
        <div className="text-[10px] text-slate-700 px-2">Part of VynOps Suite</div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-[#0a0f1e] border-r border-slate-800/60 h-screen sticky top-0 flex-shrink-0">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-[#0a0f1e] border-r border-slate-800/60 h-full z-10">
            <SidebarContent pathname={pathname} onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  )
}
