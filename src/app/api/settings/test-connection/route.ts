import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { spawnSync } from 'child_process'

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json() as Record<string, string>
  const { type } = body

  // ── Prometheus / Alertmanager ──────────────────────────────────────────────
  if (type === 'prometheus' || type === 'alertmanager') {
    const url = body.url?.trim()
    if (!url) return NextResponse.json({ error: 'URL is empty' }, { status: 400 })

    const healthUrl = url.replace(/\/$/, '') + '/-/healthy'
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        return NextResponse.json({ message: `Reachable — HTTP ${res.status}` })
      }
      return NextResponse.json(
        { error: `HTTP ${res.status} ${res.statusText}` },
        { status: 502 },
      )
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Connection failed' },
        { status: 502 },
      )
    }
  }

  // ── SNMP ──────────────────────────────────────────────────────────────────
  if (type === 'snmp') {
    const community = body.community?.trim() || 'public'
    const host = body.host?.trim()
    if (!host) return NextResponse.json({ error: 'SNMP PDU Host is empty' }, { status: 400 })

    const result = spawnSync(
      'snmpget',
      ['-Ln', '-On', '-v2c', '-c', community, '-t', '5', '-r', '1', host, '.1.3.6.1.2.1.1.1.0'],
      { timeout: 10_000 },
    )

    if (result.error) {
      const msg = (result.error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'snmpget not found — install net-snmp on the VynDC server'
        : result.error.message
      return NextResponse.json({ error: msg }, { status: 502 })
    }
    if (result.status !== 0) {
      return NextResponse.json(
        { error: result.stderr?.toString().trim() || 'SNMP query failed' },
        { status: 502 },
      )
    }
    const out = result.stdout?.toString().split('\n')[0]?.trim() || 'OK'
    return NextResponse.json({ message: out })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}

