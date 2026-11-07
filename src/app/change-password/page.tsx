'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword.length < 12) {
      setError('Choose a password with at least 12 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        setError(result.error ?? 'Unable to change password.')
        return
      }
      router.replace('/overview')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f1a] flex items-center justify-center px-4">
      <section className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 mb-4">
            <KeyRound size={22} className="text-orange-400" />
          </div>
          <h1 className="text-xl font-black text-white">Set a new password</h1>
          <p className="text-sm text-slate-400 mt-2">Change the temporary admin password to continue.</p>
        </div>

        <form onSubmit={submit} className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <label className="block text-xs font-medium text-slate-400">
            Temporary password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60"
            />
          </label>
          <label className="block text-xs font-medium text-slate-400">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60"
            />
          </label>
          <label className="block text-xs font-medium text-slate-400">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Updating...</> : 'Change password'}
          </button>
        </form>
      </section>
    </main>
  )
}