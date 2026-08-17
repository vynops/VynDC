import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSettings, saveSettings } from '@/lib/settings-store'
import { writeAudit, getClientIp } from '@/lib/audit'

const MASKED = '***configured***'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const settings = getSettings()
  // Mask API keys in responses
  return NextResponse.json({
    ...settings,
    aiApiKey: settings.aiApiKey ? MASKED : '',
    groqApiKey: settings.groqApiKey ? MASKED : '',
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json() as Record<string, unknown>
    const existing = getSettings()

    if (body.aiApiKey === MASKED) {
      body.aiApiKey = existing.aiApiKey
    }
    if (body.groqApiKey === MASKED) {
      body.groqApiKey = existing.groqApiKey
    }

    // Backward compatibility between old/new key fields.
    if (typeof body.aiProvider === 'string' && body.aiProvider === 'groq' && typeof body.aiApiKey === 'string' && body.aiApiKey) {
      body.groqApiKey = body.aiApiKey
    } else if (!body.aiApiKey && typeof body.groqApiKey === 'string' && body.groqApiKey) {
      body.aiApiKey = body.groqApiKey
    }

    const updated = saveSettings(body)
    const actor = typeof auth === 'object' && 'email' in auth ? (auth as { email: string }).email : 'unknown'
    writeAudit({ actor, action: 'settings.update', detail: 'Settings saved', ip: getClientIp(req) })
    return NextResponse.json({
      ...updated,
      aiApiKey: updated.aiApiKey ? MASKED : '',
      groqApiKey: updated.groqApiKey ? MASKED : '',
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
