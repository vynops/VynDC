import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSettings } from '@/lib/settings-store'

type AIProvider = 'groq' | 'openai' | 'anthropic' | 'google' | 'custom'

const MASKED = '***configured***'

function normalizeProvider(value: string | undefined): AIProvider {
  if (value === 'openai' || value === 'anthropic' || value === 'google' || value === 'custom') return value
  return 'groq'
}

function resolveConfig(body: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }) {
  const settings = getSettings()
  const provider = normalizeProvider(body.provider || settings.aiProvider)
  let apiKey = body.apiKey?.trim() || ''
  if (!apiKey || apiKey === MASKED) {
    apiKey = settings.aiApiKey || settings.groqApiKey || process.env.GROQ_API_KEY || ''
  }
  const model = body.model?.trim() || settings.aiModel || 'llama-3.3-70b-versatile'
  const baseUrl = body.baseUrl?.trim() || settings.aiBaseUrl || ''
  return { provider, apiKey, model, baseUrl }
}

async function testOpenAICompatible(baseUrl: string, apiKey: string, model: string) {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const endpoint = normalizedBase.endsWith('/chat/completions')
    ? normalizedBase
    : normalizedBase.endsWith('/v1') || normalizedBase.includes('/openai/v1')
      ? `${normalizedBase}/chat/completions`
      : `${normalizedBase}/v1/chat/completions`

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      max_tokens: 8,
      temperature: 0,
    }),
  })
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
  const preferred = models
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

  return preferred.slice(0, 8)
}

async function findUsableOpenAIModel(baseUrl: string, apiKey: string, current: string, models: string[]): Promise<string | null> {
  const candidates = prioritizeModels(models, current)
  for (const candidate of candidates) {
    const res = await testOpenAICompatible(baseUrl, apiKey, candidate)
    if (res.ok) return candidate
    const detail = (await res.text()).toLowerCase()
    if (res.status === 400 && detail.includes('requires terms acceptance')) {
      continue
    }
  }
  return candidates[0] ?? null
}

async function testAnthropic(apiKey: string, model: string) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    }),
  })
}

async function testGoogle(apiKey: string, model: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: ok' }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    }),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json() as { provider?: string; apiKey?: string; model?: string; baseUrl?: string }
  const { provider, apiKey, model, baseUrl } = resolveConfig(body)

  if (!apiKey) {
    return NextResponse.json({ ok: false, message: 'API key is not configured.' }, { status: 400 })
  }

  if (provider === 'custom' && !baseUrl) {
    return NextResponse.json({ ok: false, message: 'Base URL is required for custom provider.' }, { status: 400 })
  }

  try {
    const response = provider === 'anthropic'
      ? await testAnthropic(apiKey, model)
      : provider === 'google'
        ? await testGoogle(apiKey, model)
        : provider === 'openai'
          ? await testOpenAICompatible('https://api.openai.com/v1', apiKey, model)
          : provider === 'custom'
            ? await testOpenAICompatible(baseUrl, apiKey, model)
            : await testOpenAICompatible('https://api.groq.com/openai/v1', apiKey, model)

    if (!response.ok) {
      const detail = await response.text()
      if (
        (provider === 'groq' || provider === 'openai' || provider === 'custom')
        && (
          (response.status === 404 && /model_not_found|does not exist|do not have access/i.test(detail))
          || (response.status === 400 && /requires terms acceptance|model_/i.test(detail))
        )
      ) {
        const modelBase = provider === 'openai'
          ? 'https://api.openai.com/v1'
          : provider === 'custom'
            ? baseUrl
            : 'https://api.groq.com/openai/v1'
        const available = await listOpenAICompatibleModels(modelBase, apiKey)
        const suggestedModel = await findUsableOpenAIModel(modelBase, apiKey, model, available)
        const recommendation = suggestedModel ? ` Suggested model: ${suggestedModel}.` : ''
        const suggestion = available.length ? ` Available models: ${available.slice(0, 12).join(', ')}` : ''
        return NextResponse.json(
          {
            ok: true,
            message: `Connected to provider, but model '${model}' is not available for this account.${recommendation}${suggestion}`,
            modelAvailable: false,
            suggestedModel,
            availableModels: available,
          }
        )
      }

      const trimmed = detail.slice(0, 260)
      const msg = trimmed
        ? `Connection failed (HTTP ${response.status}): ${trimmed}`
        : `Connection failed (HTTP ${response.status})`
      return NextResponse.json({ ok: false, message: msg }, { status: 502 })
    }

    return NextResponse.json({ ok: true, message: 'AI provider connection successful.' })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : 'Connection test failed.' },
      { status: 502 }
    )
  }
}
