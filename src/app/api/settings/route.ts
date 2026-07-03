import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSettings, saveSettings } from '@/lib/settings-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const settings = getSettings()
  // Mask API key
  return NextResponse.json({ ...settings, groqApiKey: settings.groqApiKey ? '***' : '' })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json()
    const updated = saveSettings(body)
    return NextResponse.json({ ...updated, groqApiKey: updated.groqApiKey ? '***' : '' })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
