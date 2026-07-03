'use client'

import { RefreshCw, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  title: string
  subtitle?: string
  onRefresh?: () => void
  refreshing?: boolean
  actions?: React.ReactNode
}

export default function Header({ title, subtitle, onRefresh, refreshing, actions }: HeaderProps) {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-[#080d1a] flex-shrink-0 lg:pl-6 pl-16">
      <div>
        <h1 className="text-white font-semibold text-xl leading-tight">{title}</h1>
        {subtitle && <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
        <button onClick={logout} title="Sign out" className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut size={15} />
        </button>
      </div>
    </header>
  )
}
