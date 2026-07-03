'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Users, Plus, Trash2, Edit2, X, Shield, Lock } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  editor: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  viewer: 'bg-slate-700 text-slate-400 border border-slate-600',
}

interface UserRecord { id: string; email: string; name: string; role: string; lastLogin?: string; createdAt: string }

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Failed'); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">Invite Team Member</h2>
          <button onClick={onClose}><X size={15} className="text-slate-500 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
          <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name"
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
          <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address"
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
          <input required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Initial password"
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
            <option value="viewer">Viewer (read-only)</option>
            <option value="editor">Editor (acknowledge incidents)</option>
            <option value="admin">Admin (full access)</option>
          </select>
          <button type="submit" disabled={loading}
            className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium">
            {loading ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function TeamPage() {
  const { data: me } = useSWR<{ role: string }>('/api/auth/me', fetcher)
  const { data: users = [], mutate } = useSWR<UserRecord[]>('/api/users', fetcher)
  const [showInvite, setShowInvite] = useState(false)
  const [editingRole, setEditingRole] = useState<{ id: string; role: string } | null>(null)

  if (me && me.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
        <Lock size={32} className="text-slate-700" />
        <div className="text-sm">Team management is restricted to admins</div>
      </div>
    )
  }

  async function updateRole(id: string, role: string) {
    await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
    setEditingRole(null); mutate()
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user?')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl mx-auto">
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onDone={() => { setShowInvite(false); mutate() }} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-orange-400" />
          <h2 className="text-sm font-bold text-white">{users.length} Team Members</h2>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-medium">
          <Plus size={13} /> Invite Member
        </button>
      </div>

      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left p-3 text-slate-400 font-medium">Member</th>
              <th className="text-left p-3 text-slate-400 font-medium">Role</th>
              <th className="text-left p-3 text-slate-400 font-medium hidden sm:table-cell">Last Login</th>
              <th className="text-left p-3 text-slate-400 font-medium hidden sm:table-cell">Joined</th>
              <th className="p-3 text-slate-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium">{user.name}</div>
                      <div className="text-slate-500 text-[10px]">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  {editingRole?.id === user.id
                    ? <div className="flex items-center gap-1">
                        <select value={editingRole.role} onChange={e => setEditingRole({ id: user.id, role: e.target.value })}
                          className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white focus:outline-none">
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button onClick={() => updateRole(user.id, editingRole.role)} className="text-green-400 hover:text-green-300">✓</button>
                        <button onClick={() => setEditingRole(null)} className="text-slate-500 hover:text-white">✕</button>
                      </div>
                    : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_BADGE[user.role]}`}>
                        {user.role === 'admin' && <Shield size={8} className="inline mr-0.5" />}
                        {user.role}
                      </span>
                  }
                </td>
                <td className="p-3 text-slate-500 hidden sm:table-cell">{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
                <td className="p-3 text-slate-500 hidden sm:table-cell">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setEditingRole({ id: user.id, role: user.role })} className="text-slate-500 hover:text-blue-400">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => deleteUser(user.id)} className="text-slate-500 hover:text-red-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
