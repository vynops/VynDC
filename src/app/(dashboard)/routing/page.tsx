'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { GitBranch, Plus, Trash2, X, Edit2, ChevronDown, ChevronRight, Zap } from 'lucide-react'
import type { RoutingRule, EscalationPolicy, EscalationStep } from '@/lib/oncall-store'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const SEV_OPTS = ['*','critical','high','medium','low']
const CAT_OPTS = ['*','hardware','network','storage','power','other']

// ─── Routing Rule Modal ──────────────────────────────────────────────────────
function RuleModal({ rule, policies, onClose, onDone }: {
  rule?: RoutingRule
  policies: EscalationPolicy[]
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState<Partial<RoutingRule>>(rule ?? {
    name: '', severity: '*', category: '*',
    notifyEmails: [], notifySlack: true, notifyOncall: true, escalationPolicyId: 'default',
  })
  const [emailInput, setEmailInput] = useState('')
  const [saving, setSaving] = useState(false)

  function addEmail() {
    const e = emailInput.trim()
    if (!e) return
    setForm(f => ({ ...f, notifyEmails: [...(f.notifyEmails ?? []), e] }))
    setEmailInput('')
  }
  function removeEmail(em: string) {
    setForm(f => ({ ...f, notifyEmails: (f.notifyEmails ?? []).filter(x => x !== em) }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/routing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, id: rule?.id }),
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-slate-700 rounded-2xl p-6 w-full max-w-lg overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">{rule ? 'Edit' : 'Add'} Routing Rule</h2>
          <button onClick={onClose}><X size={15} className="text-slate-500 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold">Rule Name</label>
            <input required value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Critical → Pager + Slack"
              className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold">Match Severity</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
                {SEV_OPTS.map(s => <option key={s} value={s}>{s === '*' ? 'Any' : s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold">Match Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
                {CAT_OPTS.map(c => <option key={c} value={c}>{c === '*' ? 'Any' : c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] text-slate-500 uppercase font-bold">Notify via</label>
            {[
              { key: 'notifySlack'  as const, label: 'Slack webhook' },
              { key: 'notifyOncall' as const, label: 'Currently on-call engineer' },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form[opt.key]}
                  onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))}
                  className="w-4 h-4 accent-orange-500" />
                <span className="text-xs text-slate-400">{opt.label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold">Additional Email Recipients</label>
            <div className="flex gap-2 mt-1">
              <input value={emailInput} onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
                placeholder="ops@example.com" type="email"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
              <button type="button" onClick={addEmail}
                className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm">+</button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(form.notifyEmails ?? []).map(em => (
                <span key={em} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 text-xs text-slate-300">
                  {em}
                  <button type="button" onClick={() => removeEmail(em)} className="text-slate-500 hover:text-red-400"><X size={10} /></button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold">Escalation Policy</label>
            <select value={form.escalationPolicyId} onChange={e => setForm(f => ({ ...f, escalationPolicyId: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none">
              <option value="">None</option>
              {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Saving…' : 'Save Rule'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Escalation Policy Editor ─────────────────────────────────────────────────
function EscalationEditor({ policy, onClose, onDone }: {
  policy?: EscalationPolicy; onClose: () => void; onDone: () => void
}) {
  const [name, setName] = useState(policy?.name ?? '')
  const [steps, setSteps] = useState<EscalationStep[]>(policy?.steps ?? [])
  const [saving, setSaving] = useState(false)

  function addStep() {
    setSteps(s => [...s, { delayMin: 15, notifyEmails: [], notifySlack: true, notifyOncall: true }])
  }
  function removeStep(i: number) { setSteps(s => s.filter((_, j) => j !== i)) }
  function updateStep(i: number, patch: Partial<EscalationStep>) {
    setSteps(s => s.map((step, j) => j === i ? { ...step, ...patch } : step))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/escalations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: policy?.id, name, steps }),
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-slate-700 rounded-2xl p-6 w-full max-w-xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">{policy ? 'Edit' : 'Add'} Escalation Policy</h2>
          <button onClick={onClose}><X size={15} className="text-slate-500 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold">Policy Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Default Escalation"
              className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-orange-500/60" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-slate-500 uppercase font-bold">Escalation Steps</label>
              <button type="button" onClick={addStep}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300">
                <Plus size={11} /> Add Step
              </button>
            </div>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Step {i + 1}</span>
                    <button type="button" onClick={() => removeStep(i)}
                      className="text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 whitespace-nowrap">Delay (min)</label>
                    <input type="number" min={1} max={10080} value={step.delayMin}
                      onChange={e => updateStep(i, { delayMin: +e.target.value })}
                      className="w-20 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none" />
                  </div>
                  <input value={step.message ?? ''} onChange={e => updateStep(i, { message: e.target.value })}
                    placeholder="Optional custom message"
                    className="w-full px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none" />
                  <div className="flex gap-4">
                    {[
                      { key: 'notifySlack'  as const, label: 'Slack' },
                      { key: 'notifyOncall' as const, label: 'On-call' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={!!step[opt.key]}
                          onChange={e => updateStep(i, { [opt.key]: e.target.checked })}
                          className="w-3 h-3 accent-orange-500" />
                        <span className="text-[11px] text-slate-400">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <input
                    value={(step.notifyEmails ?? []).join(', ')}
                    onChange={e => updateStep(i, { notifyEmails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="Extra emails (comma-separated)"
                    className="w-full px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none" />
                </div>
              ))}
              {steps.length === 0 && (
                <div className="text-center text-slate-600 text-xs py-4 border border-dashed border-slate-800 rounded-xl">
                  No steps — click &ldquo;Add Step&rdquo; above
                </div>
              )}
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Saving…' : 'Save Policy'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RoutingPage() {
  const { data: rules = [], mutate: mutateRules } = useSWR<RoutingRule[]>('/api/routing', fetcher, { refreshInterval: 60000 })
  const { data: policies = [], mutate: mutatePolicies } = useSWR<EscalationPolicy[]>('/api/escalations', fetcher)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editRule, setEditRule] = useState<RoutingRule | undefined>()
  const [showEscModal, setShowEscModal] = useState(false)
  const [editPolicy, setEditPolicy] = useState<EscalationPolicy | undefined>()
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null)

  async function deleteRule(id: string) {
    await fetch(`/api/routing?id=${id}`, { method: 'DELETE' })
    mutateRules()
  }
  async function deletePolicy(id: string) {
    await fetch(`/api/escalations?id=${id}`, { method: 'DELETE' })
    mutatePolicies()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <GitBranch size={18} className="text-orange-400" /> Routing & Escalations
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">Define who gets notified for which alerts, and how escalation works</p>
      </div>

      {/* ── Routing Rules ──────────────────────────────────────── */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-800">
          <GitBranch size={14} className="text-orange-400" />
          <span className="text-sm font-bold text-white">Routing Rules</span>
          <span className="text-[10px] text-slate-500 ml-1">— matched top-to-bottom</span>
          <button onClick={() => { setEditRule(undefined); setShowRuleModal(true) }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-medium hover:bg-orange-500/25">
            <Plus size={12} /> Add Rule
          </button>
        </div>
        {rules.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No rules defined.</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {rules.map((r, idx) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/20 transition-colors">
                <span className="w-5 h-5 rounded-md bg-slate-800 text-[10px] text-slate-400 font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white font-medium">{r.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                      sev:{r.severity === '*' ? 'any' : r.severity}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                      cat:{r.category === '*' ? 'any' : r.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex gap-2 flex-wrap">
                    {r.notifySlack && <span>✦ Slack</span>}
                    {r.notifyOncall && <span>✦ On-call</span>}
                    {r.notifyEmails.length > 0 && <span>✦ {r.notifyEmails.length} email(s)</span>}
                    {r.escalationPolicyId && <span>✦ Escalate: {policies.find(p => p.id === r.escalationPolicyId)?.name ?? r.escalationPolicyId}</span>}
                  </div>
                </div>
                <button onClick={() => { setEditRule(r); setShowRuleModal(true) }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 flex-shrink-0">
                  <Edit2 size={12} />
                </button>
                <button onClick={() => deleteRule(r.id)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Escalation Policies ────────────────────────────────── */}
      <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-800">
          <Zap size={14} className="text-orange-400" />
          <span className="text-sm font-bold text-white">Escalation Policies</span>
          <button onClick={() => { setEditPolicy(undefined); setShowEscModal(true) }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-medium hover:bg-orange-500/25">
            <Plus size={12} /> Add Policy
          </button>
        </div>
        {policies.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No policies defined.</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {policies.map(p => (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/20 cursor-pointer"
                  onClick={() => setExpandedPolicy(expandedPolicy === p.id ? null : p.id)}>
                  {expandedPolicy === p.id ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                  <span className="flex-1 text-sm text-white font-medium">{p.name}</span>
                  <span className="text-[11px] text-slate-500">{p.steps.length} step{p.steps.length !== 1 ? 's' : ''}</span>
                  <button onClick={e => { e.stopPropagation(); setEditPolicy(p); setShowEscModal(true) }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); deletePolicy(p.id) }}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={12} />
                  </button>
                </div>
                {expandedPolicy === p.id && (
                  <div className="px-10 pb-3 space-y-1.5">
                    {p.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                        <span className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                        <span>After <strong className="text-white">{step.delayMin}min</strong> — {[
                          step.notifySlack && 'Slack',
                          step.notifyOncall && 'On-call',
                          ...(step.notifyEmails ?? []),
                        ].filter(Boolean).join(', ')} {step.message ? `— "${step.message}"` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showRuleModal && (
        <RuleModal
          rule={editRule}
          policies={policies}
          onClose={() => { setShowRuleModal(false); setEditRule(undefined) }}
          onDone={() => { setShowRuleModal(false); setEditRule(undefined); mutateRules() }}
        />
      )}
      {showEscModal && (
        <EscalationEditor
          policy={editPolicy}
          onClose={() => { setShowEscModal(false); setEditPolicy(undefined) }}
          onDone={() => { setShowEscModal(false); setEditPolicy(undefined); mutatePolicies() }}
        />
      )}
    </div>
  )
}
