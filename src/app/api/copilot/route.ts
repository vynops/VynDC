import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { recordUsage } from '@/lib/copilot-usage'
import { getSettings } from '@/lib/settings-store'
import {
  simulatedServers,
  simulatedIncidents,
  simulatedPredictions,
  simulatedOverview,
} from '@/lib/simulation'

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

const DC_FALLBACK: Record<string, string> = {
  default:
    "I'm the VynDC AI Copilot. I can help you understand your datacenter's health, incidents, and predictions. Try asking about server status, rack temperatures, or upcoming disk failures.",
  risk:
    "Based on current simulation data, the following servers show elevated risk: servers with critical CPU temperatures in Rack A03, and nodes with SMART disk warnings. I recommend reviewing the Predictions page for detailed failure forecasts.",
  heat:
    "Rack A03 is showing the highest average inlet temperature at ~31°C. This is likely due to high-density compute nodes in U8-U12 and possible rear airflow obstruction. Check fan speeds and consider load balancing to Rack A01.",
  storage:
    "Current storage utilisation is approximately 65% across all bays. Three disks are in SMART 'warning' state with elevated reallocated sectors. Forecast suggests two NVMe drives will reach endurance limits within 30 days — recommend proactive replacement.",
  incidents:
    "There are currently 8 open incidents: 2 critical (thermal), 3 high (hardware/storage), 3 medium. The critical CPU temperature alert on dc-a03-node03 is the most urgent — it has been open for 2 hours.",
}

function getDemoResponse(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('risk') || lower.includes('at risk')) return DC_FALLBACK.risk
  if (lower.includes('heat') || lower.includes('temp') || lower.includes('hot') || lower.includes('thermal')) return DC_FALLBACK.heat
  if (lower.includes('storage') || lower.includes('disk') || lower.includes('capacity')) return DC_FALLBACK.storage
  if (lower.includes('incident') || lower.includes('alert') || lower.includes('issue')) return DC_FALLBACK.incidents
  return DC_FALLBACK.default
}

function buildSystemPrompt(): string {
  const overview = simulatedOverview()
  const incidents = simulatedIncidents().filter(i => i.status !== 'resolved').slice(0, 5)
  const predictions = simulatedPredictions().slice(0, 5)
  const servers = simulatedServers()
  const critServers = servers.filter(s => s.status === 'critical' || s.status === 'warning')

  return `You are VynDC Copilot, an intelligent AI assistant for a datacenter operations dashboard.

## Current Datacenter State
- Total Servers: ${overview.totalServers} (Healthy: ${overview.healthyServers}, Warning: ${overview.warningServers}, Critical: ${overview.criticalServers}, Offline: ${overview.offlineServers})
- Total Racks: ${overview.totalRacks}
- PUE: ${overview.avgPue}
- Avg Temperature: ${overview.avgTempCelsius}°C
- Total Power: ${overview.totalPowerKw} kW
- Open Incidents: ${overview.openIncidents} (${overview.criticalIncidents} critical)
- Active Predictions: ${overview.activePredictions}
- Storage Used: ${overview.storageUsedPct}%

## Servers Requiring Attention
${critServers.map(s => `- ${s.hostname} (${s.rack}): ${s.status.toUpperCase()}, CPU ${s.cpuUsagePct}%, Temp ${s.tempCelsius}°C, Power ${s.powerWatts}W`).join('\n')}

## Open Incidents (top 5)
${incidents.map(i => `- [${i.severity.toUpperCase()}] ${i.title} — ${i.hostname} (${i.rack}): ${i.description}`).join('\n')}

## Active Predictions (top 5)
${predictions.map(p => `- ${p.hostname} (${p.rack}): ${p.component} failure in ~${p.estimatedDaysToFailure} days (${p.confidence}% confidence) — ${p.reason}`).join('\n')}

Respond concisely and helpfully. Focus on actionable insights. Use bullet points when listing items. Keep responses under 300 words unless detail is specifically requested.`
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  try {
    const { messages } = await req.json() as { messages: Message[] }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    const settings = getSettings()
    const apiKey = settings.groqApiKey || process.env.GROQ_API_KEY || ''

    if (!apiKey) {
      const lastUser = [...messages].reverse().find(m => m.role === 'user')
      const reply = getDemoResponse(lastUser?.content ?? '')
      return NextResponse.json({ message: reply, demo: true })
    }

    const systemPrompt = buildSystemPrompt()
    const model = settings.aiModel || 'llama-3.3-70b-versatile'

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 600,
        temperature: 0.4,
      }),
    })

    if (!response.ok) {
      const lastUser = [...messages].reverse().find(m => m.role === 'user')
      return NextResponse.json({ message: getDemoResponse(lastUser?.content ?? ''), demo: true })
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }
    const reply = data.choices?.[0]?.message?.content ?? ''
    if (data.usage) {
      recordUsage(data.usage.prompt_tokens ?? 0, data.usage.completion_tokens ?? 0)
    }
    return NextResponse.json({ message: reply, demo: false })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
