import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedDisks } from '@/lib/simulation'
import type { DiskAsset } from '@/lib/simulation'
import { isPrometheusConfigured, promQuery } from '@/lib/prometheus'

async function liveStorage(): Promise<DiskAsset[]> {
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

    disks.push({
      id: `disk-${++idx}`,
      serverId: `node-${instance}`,
      hostname: instance.split(':')[0],
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
        temperature: 0,
      },
      warrantyExpiry: '',
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
