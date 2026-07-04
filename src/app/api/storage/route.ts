import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedDisks } from '@/lib/simulation'
import type { DiskAsset } from '@/lib/simulation'
import { isPrometheusConfigured, promQuery } from '@/lib/prometheus'
import fs from 'fs'
import path from 'path'

function loadWarrantyMap(): Record<string, string> {
  try {
    const file = path.join(process.cwd(), 'data', 'inventory.json')
    if (!fs.existsSync(file)) return {}
    const entries: Array<{ hostname?: string; warrantyExpiry?: string }> = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Object.fromEntries(
      entries.filter(e => e.hostname && e.warrantyExpiry).map(e => [e.hostname!, e.warrantyExpiry!])
    )
  } catch {
    return {}
  }
}

async function liveStorage(): Promise<DiskAsset[]> {
  const warrantyMap = loadWarrantyMap()

  // Resolve IP-based Prometheus instance labels to real hostnames via node_uname_info
  let nodeNameMap: Record<string, string> = {}
  try {
    const unameRes = await promQuery('node_uname_info')
    unameRes.forEach(r => {
      if (r.metric.instance && r.metric.nodename) {
        nodeNameMap[r.metric.instance.split(':')[0]] = r.metric.nodename
      }
    })
  } catch { /* non-fatal */ }

  // Build per-node temperature map from hwmon sensors
  const tempMap: Record<string, number> = {}
  try {
    const hwmonRes = await promQuery('node_hwmon_temp_celsius')
    hwmonRes.forEach(r => {
      const ip = r.metric.instance?.split(':')[0]
      if (!ip) return
      const val = parseFloat(r.value[1])
      if (!isNaN(val) && val > 0) tempMap[ip] = Math.max(tempMap[ip] ?? 0, val)
    })
  } catch { /* non-fatal */ }

  const [diskTotal, diskAvail, diskDevice] = await Promise.all([
    promQuery('node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"}'),
    promQuery('node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"}'),
    promQuery('node_filesystem_device_error{fstype!~"tmpfs|overlay|squashfs"}'),
  ])

  const disks: DiskAsset[] = []
  let idx = 0

  diskTotal.forEach(r => {
    const { instance, mountpoint, device, fstype } = r.metric
    const totalBytes = parseFloat(r.value[1])
    const availBytes = parseFloat(
      diskAvail.find(x => x.metric.instance === instance && x.metric.mountpoint === mountpoint)?.value[1] ?? '0'
    )
    const usedBytes = totalBytes - availBytes
    const capacityGiB = Math.round(totalBytes / (1024 ** 3) * 10) / 10
    const usedGiB = Math.round(usedBytes / (1024 ** 3) * 10) / 10
    const usedPct = totalBytes > 0 ? usedBytes / totalBytes : 0

    const ip = instance.split(':')[0]
    const hostname = nodeNameMap[ip] ?? ip
    disks.push({
      id: `disk-${++idx}`,
      serverId: `node-${instance}`,
      hostname,
      rack: 'rack-1',
      slot: mountpoint,
      model: device ?? fstype ?? 'unknown',
      type: 'SSD',
      capacityGiB,
      usedGiB,
      age: 0,
      smart: {
        health: usedPct > 0.95 ? 'failing' : usedPct > 0.85 ? 'warning' : 'healthy',
        reallocatedSectors: 0,
        powerOnHours: 0,
        temperature: Math.round(tempMap[ip] ?? 0),
      },
      warrantyExpiry: warrantyMap[hostname] ?? warrantyMap[ip] ?? '',
    })
  })

  return disks
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  if (isPrometheusConfigured()) {
    try {
      return NextResponse.json(await liveStorage())
    } catch (e) {
      console.error('[storage] Prometheus error, falling back:', e)
    }
  }

  return NextResponse.json(simulatedDisks())
}
