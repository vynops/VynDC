import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedRacks } from '@/lib/simulation'
import type { RackSummary } from '@/lib/simulation'
import { getSettings } from '@/lib/settings-store'
import { isPrometheusConfigured, promQuery } from '@/lib/prometheus'
import fs from 'fs'
import path from 'path'

interface TopoServer { id: string; hostname: string; uStart: number; uHeight: number }
interface TopoRack {
  id: string; label: string; location: string; totalU: number; powerCapW: number
  servers: TopoServer[]
}
interface Topology { racks: TopoRack[] }

function loadTopology(): Topology | null {
  // 1. Check path from Settings UI
  const settingsPath = getSettings().rackTopologyFile
  // 2. Fall back to data/rack-topology.json next to cwd (works local + server)
  const defaultPath = path.join(process.cwd(), 'data', 'rack-topology.json')
  const filePath = settingsPath || defaultPath

  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Topology
  } catch {
    return null
  }
}

async function liveRacks(topo: Topology): Promise<RackSummary[]> {
  // Optionally enrich with live power/temp from Prometheus if configured
  let powerByHost: Record<string, number> = {}
  let tempByHost: Record<string, number> = {}

  if (isPrometheusConfigured()) {
    try {
      const [powerRows, tempRows] = await Promise.all([
        promQuery('node_power_supply_online'),           // basic — may be 0 on VMs
        promQuery('node_hwmon_temp_celsius{sensor="temp1"}'),
      ])
      powerRows.forEach(r => {
        const host = r.metric.instance?.split(':')[0] ?? ''
        powerByHost[host] = parseFloat(r.value[1])
      })
      tempRows.forEach(r => {
        const host = r.metric.instance?.split(':')[0] ?? ''
        tempByHost[host] = parseFloat(r.value[1])
      })
    } catch { /* enrichment optional */ }
  }

  return topo.racks.map((rack): RackSummary => {
    const usedU = rack.servers.reduce((sum, s) => sum + s.uHeight, 0)
    const totalPowerW = rack.servers.reduce((sum, s) => sum + (powerByHost[s.hostname] ?? 0), 0)
    const temps = rack.servers.map(s => tempByHost[s.hostname]).filter(Boolean) as number[]
    const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0

    return {
      id: rack.id,
      label: rack.label,
      location: rack.location,
      totalU: rack.totalU,
      usedU,
      servers: rack.servers.map(s => s.id),
      totalPowerW,
      powerCapW: rack.powerCapW ?? 5000,
      tempCelsius: Math.round(avgTemp),
    }
  })
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const topo = loadTopology()
  if (topo) {
    try {
      return NextResponse.json(await liveRacks(topo))
    } catch (e) {
      console.error('[racks] error reading topology:', e)
    }
  }

  return NextResponse.json(simulatedRacks())
}
