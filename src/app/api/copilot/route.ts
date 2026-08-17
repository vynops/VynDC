import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import type { SessionPayload } from '@/lib/auth'
import { recordPromptHistory } from '@/lib/copilot-history'
import { recordUsage } from '@/lib/copilot-usage'
import { getSettings } from '@/lib/settings-store'
import {
  simulatedServers,
  simulatedIncidents,
  simulatedPredictions,
  simulatedOverview,
} from '@/lib/simulation'
import {
  isPrometheusConfigured,
  isAlertmanagerConfigured,
  promQuery,
  alertmanagerAlerts,
} from '@/lib/prometheus'

type Message = { role: 'user' | 'assistant' | 'system'; content: string }
type ClientMessage = { role: 'user' | 'assistant'; content: string }
type AIProvider = 'groq' | 'openai' | 'anthropic' | 'google' | 'custom'

interface ProviderResponse {
  ok: boolean
  content: string
  promptTokens: number
  completionTokens: number
}

function normalizeProvider(value: string | undefined): AIProvider {
  if (value === 'openai' || value === 'anthropic' || value === 'google' || value === 'custom') return value
  return 'groq'
}

function resolveAiConfig(settings: ReturnType<typeof getSettings>) {
  const provider = normalizeProvider(settings.aiProvider)
  const apiKey = settings.aiApiKey || settings.groqApiKey || process.env.GROQ_API_KEY || ''
  const model = settings.aiModel || 'llama-3.3-70b-versatile'
  const baseUrl = settings.aiBaseUrl?.trim() || ''
  return { provider, apiKey, model, baseUrl }
}

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, messages: Message[]): Promise<ProviderResponse> {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const endpoint = normalizedBase.endsWith('/chat/completions')
    ? normalizedBase
    : normalizedBase.endsWith('/v1') || normalizedBase.includes('/openai/v1')
      ? `${normalizedBase}/chat/completions`
      : `${normalizedBase}/v1/chat/completions`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 600,
      temperature: 0.4,
    }),
  })

  if (!response.ok) {
    return { ok: false, content: '', promptTokens: 0, completionTokens: 0 }
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  return {
    ok: true,
    content: data.choices?.[0]?.message?.content ?? '',
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  }
}

async function listOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const endpoint = normalizedBase.endsWith('/models')
    ? normalizedBase
    : normalizedBase.endsWith('/v1') || normalizedBase.includes('/openai/v1')
      ? `${normalizedBase}/models`
      : `${normalizedBase}/v1/models`

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return []
    const json = await res.json() as { data?: Array<{ id?: string }> }
    return (json.data ?? []).map(m => m.id ?? '').filter(Boolean)
  } catch {
    return []
  }
}

function isLikelyChatModel(model: string): boolean {
  const m = model.toLowerCase()
  return !m.includes('whisper') && !m.includes('prompt-guard') && !m.includes('safeguard')
}

function prioritizeModels(models: string[], current: string): string[] {
  return models
    .filter(m => m !== current)
    .filter(isLikelyChatModel)
    .sort((a, b) => {
      const score = (v: string) => {
        const x = v.toLowerCase()
        if (x.includes('compound-mini')) return 100
        if (x.includes('compound')) return 95
        if (x.includes('gpt-oss-20b')) return 90
        if (x.includes('gpt-oss-120b')) return 85
        if (x.includes('qwen')) return 80
        if (x.includes('llama')) return 75
        return 50
      }
      return score(b) - score(a)
    })
    .slice(0, 8)
}

async function callOpenAICompatibleWithFallback(baseUrl: string, apiKey: string, model: string, messages: Message[]): Promise<ProviderResponse> {
  const primary = await callOpenAICompatible(baseUrl, apiKey, model, messages)
  if (primary.ok && primary.content) return primary

  const models = await listOpenAICompatibleModels(baseUrl, apiKey)
  const candidates = prioritizeModels(models, model)

  for (const candidate of candidates) {
    const alt = await callOpenAICompatible(baseUrl, apiKey, candidate, messages)
    if (alt.ok && alt.content) return alt
  }

  return primary
}

async function callAnthropic(apiKey: string, model: string, messages: Message[]): Promise<ProviderResponse> {
  const system = messages.find(m => m.role === 'system')?.content ?? ''
  const chat = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: 600,
      temperature: 0.4,
      messages: chat,
    }),
  })

  if (!response.ok) {
    return { ok: false, content: '', promptTokens: 0, completionTokens: 0 }
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = (data.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n').trim()

  return {
    ok: true,
    content: text,
    promptTokens: data.usage?.input_tokens ?? 0,
    completionTokens: data.usage?.output_tokens ?? 0,
  }
}

async function callGoogle(apiKey: string, model: string, messages: Message[]): Promise<ProviderResponse> {
  const system = messages.find(m => m.role === 'system')?.content ?? ''
  const chat = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: chat,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 600,
      },
    }),
  })

  if (!response.ok) {
    return { ok: false, content: '', promptTokens: 0, completionTokens: 0 }
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('\n').trim() ?? ''

  return {
    ok: true,
    content: text,
    promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
}

async function requestCompletion(provider: AIProvider, apiKey: string, model: string, baseUrl: string, messages: Message[]): Promise<ProviderResponse> {
  if (!apiKey) return { ok: false, content: '', promptTokens: 0, completionTokens: 0 }

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, messages)
  }

  if (provider === 'google') {
    return callGoogle(apiKey, model, messages)
  }

  if (provider === 'openai') {
    return callOpenAICompatibleWithFallback('https://api.openai.com/v1', apiKey, model, messages)
  }

  if (provider === 'custom') {
    if (!baseUrl) return { ok: false, content: '', promptTokens: 0, completionTokens: 0 }
    return callOpenAICompatibleWithFallback(baseUrl, apiKey, model, messages)
  }

  return callOpenAICompatibleWithFallback('https://api.groq.com/openai/v1', apiKey, model, messages)
}

const DC_FALLBACK: Record<string, string> = {
  default:
    "I'm the VynDC AI Copilot. I can help you understand your datacenter's health, incidents, and predictions. Try asking about server status, rack temperatures, or upcoming disk failures.",
  risk:
    "Based on current data, I can help identify servers showing elevated risk. Please check the Servers and Predictions pages for the latest failure forecasts.",
  heat:
    "I can help analyse rack temperatures and thermal issues. Check the Overview page for current temperature readings.",
  storage:
    "I can help with storage utilisation and disk health. Check the Storage and Assets pages for current capacity and SMART data.",
  incidents:
    "I can help with incident triage and escalation. Check the Incidents page for the latest open alerts.",
}

function getDemoResponse(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('risk') || lower.includes('at risk')) return DC_FALLBACK.risk
  if (lower.includes('heat') || lower.includes('temp') || lower.includes('hot') || lower.includes('thermal')) return DC_FALLBACK.heat
  if (lower.includes('storage') || lower.includes('disk') || lower.includes('capacity')) return DC_FALLBACK.storage
  if (lower.includes('incident') || lower.includes('alert') || lower.includes('issue')) return DC_FALLBACK.incidents
  return DC_FALLBACK.default
}

type SlimServer = { hostname: string; rack: string; status: string; cpuUsagePct: number; memUsedPct: number }
type SlimIncident = { title: string; severity: string; hostname?: string; description: string }
type Snapshot = {
  overview: ReturnType<typeof simulatedOverview>
  servers: SlimServer[]
  incidents: SlimIncident[]
  predictions: ReturnType<typeof simulatedPredictions>
  dataSource: 'live' | 'simulation'
}

async function fetchSnapshot(): Promise<Snapshot> {
  const simOverview = simulatedOverview()
  let overview = simOverview
  let servers: SlimServer[] = simulatedServers().map(s => ({
    hostname: s.hostname, rack: s.rack, status: s.status,
    cpuUsagePct: s.cpuUsagePct,
    memUsedPct: s.memoryGiB > 0 ? Math.round(s.memoryUsedGiB / s.memoryGiB * 100) : 0,
  }))
  let incidents: SlimIncident[] = simulatedIncidents()
    .filter(i => i.status !== 'resolved').slice(0, 8)
    .map(i => ({ title: i.title, severity: i.severity, hostname: i.hostname, description: i.description }))
  const predictions = simulatedPredictions().slice(0, 5)
  let dataSource: 'live' | 'simulation' = 'simulation'

  if (isPrometheusConfigured()) {
    try {
      const [cpuIdle, memTotal, memAvail, diskTotal, diskAvail] = await Promise.all([
        promQuery('avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100'),
        promQuery('node_memory_MemTotal_bytes'),
        promQuery('node_memory_MemAvailable_bytes'),
        promQuery('node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}'),
        promQuery('node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}'),
      ])
      const insts = [...new Set(memTotal.map(r => r.metric.instance))].filter(Boolean)
      let healthy = 0, warning = 0, critical = 0
      servers = insts.map(inst => {
        const idle = parseFloat(cpuIdle.find(r => r.metric.instance === inst)?.value[1] ?? '50')
        const cpu = Math.round(Math.max(0, Math.min(100, 100 - idle)))
        const mt = parseFloat(memTotal.find(r => r.metric.instance === inst)?.value[1] ?? '1')
        const ma = parseFloat(memAvail.find(r => r.metric.instance === inst)?.value[1] ?? '1')
        const memPct = mt > 0 ? Math.round((mt - ma) / mt * 100) : 0
        const status = cpu > 90 || memPct > 95 ? 'critical' : cpu > 75 || memPct > 80 ? 'warning' : 'healthy'
        if (status === 'critical') critical++; else if (status === 'warning') warning++; else healthy++
        return { hostname: inst.split(':')[0], rack: 'live', status, cpuUsagePct: cpu, memUsedPct: memPct }
      })
      const totalDisk = diskTotal.reduce((s, r) => s + parseFloat(r.value[1]), 0)
      const availDisk = diskAvail.reduce((s, r) => s + parseFloat(r.value[1]), 0)
      const storageUsedPct = totalDisk > 0 ? Math.round((totalDisk - availDisk) / totalDisk * 100) : simOverview.storageUsedPct
      overview = { ...simOverview, totalServers: insts.length, healthyServers: healthy, warningServers: warning, criticalServers: critical, offlineServers: 0, storageUsedPct }
      dataSource = 'live'
    } catch (e) {
      console.error('[copilot] Prometheus error, using simulation:', e)
    }
  }

  if (isAlertmanagerConfigured()) {
    try {
      const rawAlerts = await alertmanagerAlerts()
      const active = rawAlerts.filter(a => a.status.state === 'active')
      incidents = active.slice(0, 8).map(a => ({
        title: a.annotations.summary ?? a.labels.alertname ?? 'Alert',
        severity: (['critical','high','medium','low'].includes(a.labels.severity) ? a.labels.severity : 'medium'),
        hostname: a.labels.instance ?? a.labels.node,
        description: a.annotations.description ?? a.annotations.message ?? '',
      }))
      overview = {
        ...overview,
        openIncidents: active.length,
        criticalIncidents: active.filter(a => a.labels.severity === 'critical').length,
      }
      dataSource = 'live'
    } catch (e) {
      console.error('[copilot] Alertmanager error, using simulation:', e)
    }
  }

  return { overview, servers, incidents, predictions, dataSource }
}

function buildSystemPrompt(snap: Snapshot): string {
  const { overview, servers, incidents, predictions, dataSource } = snap
  const critServers = servers.filter(s => s.status === 'critical' || s.status === 'warning')
  const generatedAt = new Date().toISOString()
  return `You are VynDC Copilot, an AI assistant for datacenter operations.
Data source: ${dataSource === 'live' ? 'LIVE (Prometheus + Alertmanager)' : 'simulation (Prometheus not reachable)'}.
Snapshot time (UTC): ${generatedAt}

## Current Datacenter State
- Total Servers: ${overview.totalServers} (Healthy: ${overview.healthyServers}, Warning: ${overview.warningServers}, Critical: ${overview.criticalServers}, Offline: ${overview.offlineServers})
- Open Incidents: ${overview.openIncidents} (${overview.criticalIncidents} critical)
- Storage Used: ${overview.storageUsedPct}%
${dataSource === 'simulation' ? `- PUE: ${overview.avgPue} | Avg Temp: ${overview.avgTempCelsius}°C | Power: ${overview.totalPowerKw} kW` : ''}

## Servers Requiring Attention${critServers.length === 0 ? '\n- All servers healthy' : ''}
${critServers.map(s => `- ${s.hostname}: ${s.status.toUpperCase()}, CPU ${s.cpuUsagePct}%, Mem ${s.memUsedPct}%`).join('\n')}

## Open Incidents (up to 8)${incidents.length === 0 ? '\n- No active incidents' : ''}
${incidents.map(i => `- [${i.severity.toUpperCase()}] ${i.title}${i.hostname ? ` — ${i.hostname}` : ''}: ${i.description}`).join('\n')}

## Active Failure Predictions (top 5)
${predictions.map(p => `- ${p.hostname} (${p.rack}): ${p.component} failure in ~${p.estimatedDaysToFailure} days (${p.confidence}% confidence) — ${p.reason}`).join('\n')}

## Response Rules
- Use only the data in this prompt.
- If data is missing or uncertain, explicitly say: "Unknown from current telemetry".
- Separate observed facts from inferred recommendations.
- Mention whether guidance is based on live data or simulation data.
- Prefer concise operator-ready output.

## Required Output Format
Summary:
- 1 to 3 bullets with current state.

Key Risks:
- List top risks with severity and affected host/service.
- If none, write "No critical risks detected".

Recommended Actions:
- 1 to 5 concrete next steps, highest priority first.

Data Confidence:
- State: high, medium, or low.
- Brief reason (for example: source availability, missing metrics, or simulation mode).

Keep responses under 260 words unless user explicitly asks for detail.`
}

function sanitizeMessages(input: unknown): ClientMessage[] {
  if (!Array.isArray(input)) return []
  const clean = input
    .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
      !!m && typeof m === 'object' && 'role' in m && 'content' in m
      && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .map(m => ({ role: m.role, content: m.content.trim() }))
    .filter(m => m.content.length > 0)

  // Keep context bounded to avoid prompt bloat and stale instructions.
  return clean.slice(-20)
}

function buildDataDrivenResponse(snap: Snapshot, query: string): string {
  const lower = query.toLowerCase()
  const { overview, servers, incidents, dataSource } = snap
  const src = dataSource === 'live' ? 'live data' : 'simulation data'
  const critServers = servers.filter(s => s.status === 'critical')
  const warnServers = servers.filter(s => s.status === 'warning')

  if (lower.includes('risk') || lower.includes('at risk') || lower.includes('failure') || lower.includes('which server')) {
    const atRisk = [...critServers, ...warnServers]
    if (atRisk.length === 0) return `✅ Based on ${src}, all ${overview.totalServers} servers are currently healthy — no elevated risk detected.`
    const lines = atRisk.map(s => `- **${s.hostname}**: ${s.status.toUpperCase()} — CPU ${s.cpuUsagePct}%, Mem ${s.memUsedPct}%`)
    return `Based on ${src}, ${atRisk.length} server${atRisk.length > 1 ? 's are' : ' is'} at risk:\n\n${lines.join('\n')}\n\n${critServers.length > 0 ? `⚠️ ${critServers.length} critical — immediate attention recommended.` : 'No critical servers; monitor closely.'}`
  }

  if (lower.includes('incident') || lower.includes('alert') || lower.includes('issue')) {
    if (incidents.length === 0) return `✅ No active incidents detected (${src}).`
    const lines = incidents.slice(0, 5).map(i => `- **[${i.severity.toUpperCase()}]** ${i.title}${i.hostname ? ` — ${i.hostname}` : ''}`)
    return `There are **${overview.openIncidents}** open incidents (${overview.criticalIncidents} critical) from ${src}:\n\n${lines.join('\n')}`
  }

  if (lower.includes('storage') || lower.includes('disk') || lower.includes('capacity')) {
    return `Storage utilisation is currently **${overview.storageUsedPct}%** across all monitored nodes (${src}).${overview.storageUsedPct > 80 ? ' ⚠️ High utilisation — consider expanding capacity.' : overview.storageUsedPct > 60 ? ' Monitor growth trend.' : ' Utilisation is healthy.'}`
  }

  if (lower.includes('health') || lower.includes('status') || lower.includes('overview') || lower.includes('summary')) {
    return `**Datacenter summary** (${src}):\n- Servers: ${overview.totalServers} total — ${overview.healthyServers} healthy, ${overview.warningServers} warning, ${overview.criticalServers} critical\n- Open incidents: ${overview.openIncidents} (${overview.criticalIncidents} critical)\n- Storage: ${overview.storageUsedPct}% used\n\n${overview.criticalServers > 0 || overview.criticalIncidents > 0 ? '⚠️ Attention required — check Servers and Incidents pages.' : '✅ All systems nominal.'}`
  }

  // Generic fallback with real counts
  return `I'm the VynDC AI Copilot. Based on ${src}: **${overview.totalServers}** servers monitored, **${overview.openIncidents}** open incidents, **${overview.storageUsedPct}%** storage used. Ask me about server risk, incidents, storage, or datacenter health. _(Add an AI provider key in Settings for full AI responses.)_`
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const session = auth as SessionPayload

  try {
    const { messages: rawMessages } = await req.json() as { messages: unknown }
    const messages = sanitizeMessages(rawMessages)
    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    const settings = getSettings()
    const { provider, apiKey, model, baseUrl } = resolveAiConfig(settings)
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    recordPromptHistory(session.id, lastUserMsg)

    // Fetch live data once — used for both the Groq system prompt and the no-key fallback
    const snapshot = await fetchSnapshot()

    if (!apiKey) {
      return NextResponse.json({ message: buildDataDrivenResponse(snapshot, lastUserMsg), demo: true })
    }

    const systemPrompt = buildSystemPrompt(snapshot)
    const completion = await requestCompletion(
      provider,
      apiKey,
      model,
      baseUrl,
      [{ role: 'system', content: systemPrompt }, ...messages]
    )

    if (!completion.ok || !completion.content) {
      return NextResponse.json({ message: buildDataDrivenResponse(snapshot, lastUserMsg), demo: true })
    }

    if (completion.promptTokens > 0 || completion.completionTokens > 0) {
      recordUsage(completion.promptTokens, completion.completionTokens)
    }
    return NextResponse.json({ message: completion.content, demo: false })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
