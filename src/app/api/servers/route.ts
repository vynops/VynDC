import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedServers } from '@/lib/simulation'
import type { Server } from '@/lib/simulation'
import { isPrometheusConfigured, promQuery } from '@/lib/prometheus'

async function liveServers(): Promise<Server[]> {
  // Fetch all node_exporter metrics in parallel
  const [
    cpuIdle,
    memTotal,
    memAvail,
    diskTotal,
    diskAvail,
    loadAvg,
    nodeInfo,
    uptime,
    cpuCount,
  ] = await Promise.all([
    promQuery('avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100'),
    promQuery('node_memory_MemTotal_bytes'),
    promQuery('node_memory_MemAvailable_bytes'),
    promQuery('node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('node_load1'),
    promQuery('node_uname_info'),
    promQuery('node_time_seconds - node_boot_time_seconds'),
    promQuery('count by (instance) (node_cpu_seconds_total{mode="idle"})'),
  ])

  // Build a map of instance → metrics
  const instances = [...new Set([
    ...memTotal.map(r => r.metric.instance),
  ])].filter(Boolean)

  return instances.map((instance, idx): Server => {
    const byInst = (arr: typeof cpuIdle) =>
      arr.find(r => r.metric.instance === instance)

    const idleRow = byInst(cpuIdle)
    const idlePct = idleRow ? parseFloat(idleRow.value[1]) : 50
    const cpuPct = Math.round(Math.max(0, Math.min(100, 100 - idlePct)))

    const memTotalBytes = parseFloat(byInst(memTotal)?.value[1] ?? '0')
    const memAvailBytes = parseFloat(byInst(memAvail)?.value[1] ?? '0')
    const memGiB = memTotalBytes / (1024 ** 3)
    const memUsedGiB = (memTotalBytes - memAvailBytes) / (1024 ** 3)

    const diskTotalBytes = parseFloat(byInst(diskTotal)?.value[1] ?? '0')
    const diskAvailBytes = parseFloat(byInst(diskAvail)?.value[1] ?? '0')
    const diskUsedBytes = diskTotalBytes - diskAvailBytes
    const diskTotalTiB = diskTotalBytes / (1024 ** 4)

    const uptimeSec = parseFloat(byInst(uptime)?.value[1] ?? '0')
    const cpuCores = parseInt(byInst(cpuCount)?.value[1] ?? '1', 10)

    const uname = byInst(nodeInfo)
    const hostname = uname?.metric.nodename ?? instance.split(':')[0]
    const os = uname ? `${uname.metric.sysname} ${uname.metric.release}` : 'Linux'

    const diskUsedPct = diskTotalBytes > 0 ? diskUsedBytes / diskTotalBytes : 0
    const status: Server['status'] =
      cpuPct > 90 || diskUsedPct > 0.9 || memUsedGiB / memGiB > 0.95
        ? 'critical'
        : cpuPct > 75 || diskUsedPct > 0.8
        ? 'warning'
        : 'healthy'

    return {
      id: `node-${idx + 1}`,
      hostname,
      rack: 'rack-1',
      uPosition: (idx * 2) + 1,
      uHeight: 2,
      ipmi: '',
      os,
      cpuModel: 'Unknown',
      cpuCores,
      cpuUsagePct: cpuPct,
      memoryGiB: Math.round(memGiB * 10) / 10,
      memoryUsedGiB: Math.round(memUsedGiB * 10) / 10,
      diskCount: 1,
      diskTotalTiB: Math.round(diskTotalTiB * 100) / 100,
      networkInterfaces: [],
      tempCelsius: 0,
      powerWatts: 0,
      powerCapWatts: 0,
      status,
      uptime: Math.round(uptimeSec),
      lastSeen: new Date().toISOString(),
    }
  })
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  if (isPrometheusConfigured()) {
    try {
      const servers = await liveServers()
      return NextResponse.json(servers)
    } catch (e) {
      console.error('[servers] Prometheus error, falling back to simulation:', e)
    }
  }

  return NextResponse.json(simulatedServers())
}
