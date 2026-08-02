'use client'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Save, Eye, EyeOff, RefreshCw, Brain, Bell, Database, Settings as SettingsIcon, Mail, Server, GitBranch, Send, CheckCircle, XCircle, Shield } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const GROQ_MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended)' },
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Fast)' },
  { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Long Context)' },
  { value: 'gemma2-9b-it', label: 'Gemma 2 9B IT' },
  { value: 'llama3-70b-8192', label: 'Llama 3 70B' },
]

interface AppSettings {
  // Infrastructure
  prometheusUrl: string
  alertmanagerUrl: string
  snmpCommunity: string
  snmpPduHost: string
  pduVendor: 'apc' | 'raritan' | 'vertiv' | 'eaton' | 'servertech' | 'generic'
  pduOutletOid: string
  ipmiDefaultUser: string
  ipmiDefaultPassword: string
  rackTopologyFile: string
  cmdbInventoryFile: string
  // Alerting thresholds
  criticalTempThreshold: number
  warningTempThreshold: number
  diskFailureAlertDays: number
  powerAlertPctOverBudget: number
  // Alerting delivery
  slackWebhookUrl: string
  alertEmailEnabled: boolean
  alertRecipients: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
  // AI Copilot
  aiModel: string
  groqApiKey: string
  // General
  defaultRefreshInterval: number
}

interface AuditEntry {
  ts: string
  actor: string
  action: string
  detail: string
  ip: string
}

const ACTION_COLOR: Record<string, string> = {
  'login.success':    'text-green-400',
  'login.fail':       'text-red-400',
  'login.rate_limited': 'text-red-500',
  'logout':           'text-slate-400',
  'settings.update':  'text-blue-400',
  'user.create':      'text-cyan-400',
  'user.update':      'text-yellow-400',
  'user.delete':      'text-red-400',
  'incident.resolve': 'text-green-400',
  'incident.acknowledge': 'text-yellow-400',
  'incident.assign':  'text-blue-400',
  'incident.update':  'text-slate-400',
}

export default function SettingsPage() {
  const { data: settings, mutate } = useSWR<AppSettings>('/api/settings', fetcher)
  const { data: usage, mutate: refreshUsage } = useSWR('/api/copilot/usage', fetcher, { refreshInterval: 30000 })
  const { data: auditLog = [], mutate: refreshAudit } = useSWR<AuditEntry[]>('/api/audit?limit=100', fetcher, { refreshInterval: 60000 })
  const [form, setForm] = useState<AppSettings | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testStatus, setTestStatus] = useState<'idle'|'sending'|'ok'|'error'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [slackTestStatus, setSlackTestStatus] = useState<'idle'|'sending'|'ok'|'error'>('idle')
  const [slackTestMsg, setSlackTestMsg] = useState('')
  const [connTest, setConnTest] = useState<Record<string, { status: 'idle'|'testing'|'ok'|'error'; msg: string }>>({})

  async function testConnection(key: string, type: string, params: Record<string, string>) {
    setConnTest(t => ({ ...t, [key]: { status: 'testing', msg: '' } }))
    try {
      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...params }),
      })
      const json = await res.json()
      setConnTest(t => ({ ...t, [key]: { status: res.ok ? 'ok' : 'error', msg: json.message || json.error || '' } }))
    } catch (e) {
      setConnTest(t => ({ ...t, [key]: { status: 'error', msg: e instanceof Error ? e.message : 'Network error' } }))
    }
    setTimeout(() => setConnTest(t => ({ ...t, [key]: { status: 'idle', msg: '' } })), 8000)
  }

  async function sendTestEmail() {
    setTestStatus('sending'); setTestMsg('')
    try {
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testTo.trim() || undefined,
          smtpHost: form?.smtpHost,
          smtpPort: form?.smtpPort,
          smtpUser: form?.smtpUser,
          smtpPassword: form?.smtpPassword,
          smtpFrom: form?.smtpFrom,
        }),
      })
      const json = await res.json()
      if (res.ok) { setTestStatus('ok'); setTestMsg(`Sent to ${json.to}`) }
      else { setTestStatus('error'); setTestMsg(json.error ?? 'Unknown error') }
    } catch (e) {
      setTestStatus('error'); setTestMsg(e instanceof Error ? e.message : 'Network error')
    }
    setTimeout(() => setTestStatus('idle'), 8000)
  }

  async function sendSlackTest() {
    setSlackTestStatus('sending'); setSlackTestMsg('')
    try {
      const res = await fetch('/api/settings/test-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: form?.slackWebhookUrl }),
      })
      const json = await res.json()
      if (res.ok) { setSlackTestStatus('ok'); setSlackTestMsg(json.message ?? 'Webhook accepted') }
      else { setSlackTestStatus('error'); setSlackTestMsg(json.error ?? 'Unknown error') }
    } catch (e) {
      setSlackTestStatus('error'); setSlackTestMsg(e instanceof Error ? e.message : 'Network error')
    }
    setTimeout(() => setSlackTestStatus('idle'), 8000)
  }

  useEffect(() => { if (settings && !form) setForm(settings) }, [settings])

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm(f => f ? { ...f, [key]: value } : f)
    setSaved(false)
  }

  async function save() {
    if (!form) return
    setSaving(true)
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    mutate(form, false)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!form) return <div className="p-6 text-slate-500 text-sm">Loading...</div>

  const isLive = !!(form.prometheusUrl || form.alertmanagerUrl)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
      {/* Status banner */}
      {isLive ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl px-4 py-3 flex items-center gap-2 text-xs text-green-400">
          <Database size={13} />
          <strong>Live Mode</strong> — Connected to real data sources. Prometheus and Alertmanager are configured.
        </div>
      ) : (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl px-4 py-3 flex items-center gap-2 text-xs text-blue-400">
          <Database size={13} />
          <strong>Demo Mode</strong> — Using simulated datacenter data. Connect Prometheus, SNMP or IPMI in Infrastructure settings for live data.
        </div>
      )}

      {/* Infrastructure */}
      <Section icon={Database} title="Infrastructure" subtitle="Data source connections">
        <Field label="Prometheus URL" hint="Covers: Servers, Storage, Network pages">
          <div className="flex gap-2">
            <input value={form.prometheusUrl} onChange={e => update('prometheusUrl', e.target.value)} placeholder="http://prometheus:9090"
              className="settings-input flex-1" />
            <button
              onClick={() => testConnection('prometheus', 'prometheus', { url: form.prometheusUrl })}
              disabled={!form.prometheusUrl || connTest.prometheus?.status === 'testing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700/50 border border-slate-600/40 text-slate-300 text-xs font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {connTest.prometheus?.status === 'testing' ? 'Testing…' : 'Test'}
            </button>
          </div>
          {connTest.prometheus?.status === 'ok' && <div className="flex items-center gap-1.5 text-[11px] text-green-400 mt-1"><CheckCircle size={11} />{connTest.prometheus.msg}</div>}
          {connTest.prometheus?.status === 'error' && <div className="flex items-start gap-1.5 text-[11px] text-red-400 mt-1"><XCircle size={11} className="shrink-0 mt-0.5" /><span>{connTest.prometheus.msg}</span></div>}
          {!connTest.prometheus?.status || connTest.prometheus.status === 'idle' ? <div className="text-[10px] text-slate-600 mt-1">Health endpoint: <code className="bg-slate-800 text-slate-400 px-1 rounded">/-/healthy</code></div> : null}
        </Field>
        <Field label="Alertmanager URL" hint="Covers: Incidents page — real alerts">
          <div className="flex gap-2">
            <input value={form.alertmanagerUrl} onChange={e => update('alertmanagerUrl', e.target.value)} placeholder="http://alertmanager:9093"
              className="settings-input flex-1" />
            <button
              onClick={() => testConnection('alertmanager', 'alertmanager', { url: form.alertmanagerUrl })}
              disabled={!form.alertmanagerUrl || connTest.alertmanager?.status === 'testing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700/50 border border-slate-600/40 text-slate-300 text-xs font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {connTest.alertmanager?.status === 'testing' ? 'Testing…' : 'Test'}
            </button>
          </div>
          {connTest.alertmanager?.status === 'ok' && <div className="flex items-center gap-1.5 text-[11px] text-green-400 mt-1"><CheckCircle size={11} />{connTest.alertmanager.msg}</div>}
          {connTest.alertmanager?.status === 'error' && <div className="flex items-start gap-1.5 text-[11px] text-red-400 mt-1"><XCircle size={11} className="shrink-0 mt-0.5" /><span>{connTest.alertmanager.msg}</span></div>}
          {!connTest.alertmanager?.status || connTest.alertmanager.status === 'idle' ? <div className="text-[10px] text-slate-600 mt-1">Health endpoint: <code className="bg-slate-800 text-slate-400 px-1 rounded">/-/healthy</code></div> : null}
        </Field>
        <Field label="SNMP Community" hint="Used for network switches & PDUs">
          <input value={form.snmpCommunity} onChange={e => update('snmpCommunity', e.target.value)} placeholder="public"
            className="settings-input" />
          <div className="text-[10px] text-slate-600 mt-1">Test connectivity: <code className="bg-slate-800 text-slate-300 px-1 rounded">snmpwalk -v2c -c public &lt;host&gt;</code></div>
        </Field>
        <Field label="SNMP PDU Host" hint="Covers: Power page — PDU wattage & outlet data">
          <div className="flex gap-2">
            <input value={form.snmpPduHost} onChange={e => update('snmpPduHost', e.target.value)} placeholder="192.168.1.10"
              className="settings-input flex-1" />
            <button
              onClick={() => testConnection('snmp', 'snmp', { host: form.snmpPduHost, community: form.snmpCommunity })}
              disabled={!form.snmpPduHost || connTest.snmp?.status === 'testing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700/50 border border-slate-600/40 text-slate-300 text-xs font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {connTest.snmp?.status === 'testing' ? 'Testing…' : 'Test'}
            </button>
          </div>
          {connTest.snmp?.status === 'ok' && <div className="flex items-center gap-1.5 text-[11px] text-green-400 mt-1"><CheckCircle size={11} /><span className="truncate">{connTest.snmp.msg}</span></div>}
          {connTest.snmp?.status === 'error' && <div className="flex items-start gap-1.5 text-[11px] text-red-400 mt-1"><XCircle size={11} className="shrink-0 mt-0.5" /><span>{connTest.snmp.msg}</span></div>}
          {!connTest.snmp?.status || connTest.snmp.status === 'idle' ? <div className="text-[10px] text-slate-600 mt-1">Uses community from field above · runs <code className="bg-slate-800 text-slate-400 px-1 rounded">snmpget sysDescr.0</code> server-side</div> : null}
        </Field>
        <Field label="PDU Vendor" hint="Selects the default outlet-metering OID for the Power page">
          <select value={form.pduVendor} onChange={e => update('pduVendor', e.target.value as AppSettings['pduVendor'])}
            className="settings-input">
            <option value="apc">APC (Schneider Electric)</option>
            <option value="raritan">Raritan</option>
            <option value="vertiv">Vertiv / Geist</option>
            <option value="eaton">Eaton ePDU</option>
            <option value="servertech">Server Technology Sentry</option>
            <option value="generic">Generic / Unknown</option>
          </select>
          <div className="text-[10px] text-slate-600 mt-1">Exact OID can vary by model & firmware — use the override below if outlet data doesn&apos;t appear.</div>
        </Field>
        <Field label="PDU Outlet OID (override)" hint="Optional — paste the exact OID from your PDU's MIB if the vendor default doesn't match">
          <input value={form.pduOutletOid} onChange={e => update('pduOutletOid', e.target.value)} placeholder="1.3.6.1.4.1.318.1.1.12.3.5.1.1.2"
            className="settings-input" />
        </Field>
        <Field label="IPMI Default User" hint="Covers: Power page — per-server wattage & temp">
          <input value={form.ipmiDefaultUser} onChange={e => update('ipmiDefaultUser', e.target.value)} placeholder="admin"
            className="settings-input" />
          <div className="text-[10px] text-slate-600 mt-1">Test BMC access: <code className="bg-slate-800 text-slate-300 px-1 rounded">ipmitool -H &lt;host&gt; -U admin -P &lt;pass&gt; power status</code></div>
        </Field>
        <Field label="IPMI Default Password">
          <input type="password" value={form.ipmiDefaultPassword} onChange={e => update('ipmiDefaultPassword', e.target.value)} placeholder="••••••••"
            className="settings-input" autoComplete="off" />
        </Field>
        <Field label="Rack Topology File" hint="Covers: Rack View — server U-slot positions (JSON path on server)">
          <input value={form.rackTopologyFile} onChange={e => update('rackTopologyFile', e.target.value)} placeholder="/etc/vyndc/rack-topology.json"
            className="settings-input" />
          <div className="text-[10px] text-slate-600 mt-1">Must be readable by the VynDC process: <code className="bg-slate-800 text-slate-300 px-1 rounded">cat /etc/vyndc/rack-topology.json | jq .</code></div>
        </Field>
        <Field label="CMDB Inventory File" hint="Covers: Assets page — warranty, purchase date, model (JSON/CSV path)">
          <input value={form.cmdbInventoryFile} onChange={e => update('cmdbInventoryFile', e.target.value)} placeholder="/etc/vyndc/inventory.json"
            className="settings-input" />
        </Field>
      </Section>

      {/* Alerting */}
      <Section icon={Bell} title="Alerting" subtitle="Thresholds & notifications">
        <Field label="Critical Temp Threshold (°C)">
          <input type="number" value={form.criticalTempThreshold} onChange={e => update('criticalTempThreshold', +e.target.value)}
            className="settings-input w-24" min={60} max={100} />
        </Field>
        <Field label="Warning Temp Threshold (°C)">
          <input type="number" value={form.warningTempThreshold} onChange={e => update('warningTempThreshold', +e.target.value)}
            className="settings-input w-24" min={50} max={90} />
        </Field>
        <Field label="Disk Failure Alert (days before)">
          <input type="number" value={form.diskFailureAlertDays} onChange={e => update('diskFailureAlertDays', +e.target.value)}
            className="settings-input w-24" min={1} max={90} />
        </Field>
        <Field label="Power Budget Alert (% over)">
          <input type="number" value={form.powerAlertPctOverBudget} onChange={e => update('powerAlertPctOverBudget', +e.target.value)}
            className="settings-input w-24" min={1} max={50} />
        </Field>
        <Field label="Slack Webhook URL">
          <div className="flex gap-2">
            <input value={form.slackWebhookUrl} onChange={e => update('slackWebhookUrl', e.target.value)} placeholder="https://hooks.slack.com/..."
              className="settings-input flex-1" />
            <button
              onClick={sendSlackTest}
              disabled={slackTestStatus === 'sending' || !form.slackWebhookUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700/50 border border-slate-600/40 text-slate-300 text-xs font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {slackTestStatus === 'sending' ? 'Testing…' : 'Test'}
            </button>
          </div>
          {slackTestStatus === 'ok' && (
            <div className="flex items-center gap-1.5 text-[11px] text-green-400 mt-1">
              <CheckCircle size={11} /> {slackTestMsg}
            </div>
          )}
          {slackTestStatus === 'error' && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-400 mt-1">
              <XCircle size={11} className="shrink-0 mt-0.5" />
              <span>{slackTestMsg}</span>
            </div>
          )}
        </Field>
        <Field label="Email Alerts">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.alertEmailEnabled} onChange={e => update('alertEmailEnabled', e.target.checked)}
              className="w-4 h-4 rounded accent-orange-500" />
            <span className="text-xs text-slate-400">Enable email alerts</span>
          </label>
        </Field>
        <Field label="Default Recipients" hint="Fallback emails when no routing rule matches (comma-separated)">
          <input value={form.alertRecipients ?? ''} onChange={e => update('alertRecipients', e.target.value)}
            placeholder="ops@example.com, manager@example.com"
            className="settings-input" />
        </Field>
      </Section>

      {/* SMTP */}
      <Section icon={Mail} title="SMTP / Email Delivery" subtitle="Outbound email for alert notifications">
        <Field label="SMTP Host" hint="e.g. smtp.gmail.com, smtp.office365.com, your mail server">
          <input value={form.smtpHost} onChange={e => update('smtpHost', e.target.value)} placeholder="smtp.gmail.com"
            className="settings-input" />
        </Field>
        <Field label="SMTP Port" hint="587 = STARTTLS (recommended), 465 = SSL, 25 = plain">
          <input type="number" value={form.smtpPort} onChange={e => update('smtpPort', +e.target.value)}
            className="settings-input w-24" min={1} max={65535} />
        </Field>
        <Field label="SMTP Username" hint="Usually your full email address">
          <input value={form.smtpUser} onChange={e => update('smtpUser', e.target.value)} placeholder="alerts@example.com"
            className="settings-input" />
        </Field>
        <Field label="SMTP Password">
          <input type="password" value={form.smtpPassword} onChange={e => update('smtpPassword', e.target.value)} placeholder="••••••••"
            className="settings-input" autoComplete="off" />
        </Field>
        <Field label="From Address" hint="Sender address shown in alert emails">
          <input value={form.smtpFrom} onChange={e => update('smtpFrom', e.target.value)} placeholder="VynDC Alerts <alerts@example.com>"
            className="settings-input" />
        </Field>
        <Field label="Send Test Email" hint="Verifies SMTP connection and sends a test message">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                placeholder={form.alertRecipients?.split(',')[0]?.trim() || form.smtpUser || 'you@example.com'}
                className="settings-input flex-1"
                type="email"
              />
              <button
                onClick={sendTestEmail}
                disabled={testStatus === 'sending' || !form.smtpHost}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-medium hover:bg-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={11} />
                {testStatus === 'sending' ? 'Sending…' : 'Send Test'}
              </button>
            </div>
            {testStatus === 'ok' && (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle size={12} /> {testMsg}
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-start gap-1.5 text-xs text-red-400">
                <XCircle size={12} className="shrink-0 mt-0.5" />
                <span className="break-all">{testMsg}</span>
              </div>
            )}
            {!form.smtpHost && (
              <div className="text-[10px] text-slate-600">Configure SMTP Host above and save first.</div>
            )}
          </div>
        </Field>
      </Section>

      {/* AI Copilot */}      <Section icon={Brain} title="AI Copilot" subtitle="Groq API configuration">
        <Field label="Groq API Key">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input type={showKey ? 'text' : 'password'} value={form.groqApiKey}
                onChange={e => update('groqApiKey', e.target.value)} placeholder="gsk_..."
                className="settings-input w-full pr-9" autoComplete="off" />
              <button type="button" onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="text-[10px] text-slate-600 mt-1">Get your key at <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">console.groq.com</a></div>
        </Field>
        <Field label="AI Model">
          <select value={form.aiModel} onChange={e => update('aiModel', e.target.value)}
            className="settings-input">
            {GROQ_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        {/* Usage stats */}
        {usage && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-300">Today&apos;s Usage</span>
              <button onClick={() => refreshUsage()} className="text-slate-600 hover:text-slate-400"><RefreshCw size={11} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Requests', value: usage.today.requests },
                { label: 'Prompt Tokens', value: usage.today.promptTokens.toLocaleString() },
                { label: 'Completion', value: usage.today.completionTokens.toLocaleString() },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-800/60 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-white">{stat.value}</div>
                  <div className="text-[9px] text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-slate-500">Total tokens today: {(usage.today.promptTokens + usage.today.completionTokens).toLocaleString()}</div>
          </div>
        )}
      </Section>

      {/* General */}
      <Section icon={SettingsIcon} title="General" subtitle="Dashboard preferences">
        <Field label="Default Refresh Interval (seconds)">
          <input type="number" value={form.defaultRefreshInterval} onChange={e => update('defaultRefreshInterval', +e.target.value)}
            className="settings-input w-24" min={5} max={300} step={5} />
        </Field>
      </Section>

      {/* Audit Log */}
      <Section icon={Shield} title="Audit Log" subtitle="Who did what, and when (last 100 entries)">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-slate-500">{auditLog.length} entries</span>
          <button onClick={() => refreshAudit()} className="text-slate-600 hover:text-slate-400 flex items-center gap-1 text-[11px]">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {auditLog.length === 0
          ? <div className="text-xs text-slate-600 text-center py-4">No audit entries yet — actions will appear here.</div>
          : <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {auditLog.map((e, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-900/50 text-[11px]">
                <span className="text-slate-600 shrink-0 w-32 truncate" title={e.ts}>
                  {new Date(e.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`shrink-0 w-36 font-mono truncate ${ACTION_COLOR[e.action] ?? 'text-slate-400'}`}>{e.action}</span>
                <span className="text-slate-300 flex-1 truncate" title={e.detail}>{e.detail}</span>
                <span className="text-slate-600 shrink-0 hidden sm:block">{e.actor}</span>
                <span className="text-slate-700 shrink-0 hidden lg:block">{e.ip}</span>
              </div>
            ))}
          </div>
        }
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium">
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && <span className="text-xs text-green-400">Settings saved!</span>}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, subtitle, children }: { icon: React.ComponentType<{size?:number;className?:string}>; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111827] border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-800">
        <Icon size={14} className="text-orange-400" />
        <div>
          <div className="text-sm font-bold text-white">{title}</div>
          <div className="text-[10px] text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
      <div className="sm:w-48 shrink-0">
        <label className="text-xs text-slate-400">{label}</label>
        {hint && <div className="text-[10px] text-slate-600 mt-0.5">{hint}</div>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

