import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedOverview } from '@/lib/simulation'
import { isPrometheusConfigured, isAlertmanagerConfigured, promQuery, alertmanagerAlerts } from '@/lib/prometheus'
import type { OverviewMetrics } from '@/lib/simulation'

async function liveOverview(): Promise<OverviewMetrics> {
  const [cpuIdle, memTotal, memAvail, diskTotal, diskAvail, load1] = await Promise.all([
    promQuery('avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100'),
    promQuery('node_memory_MemTotal_bytes'),
    promQuery('node_memory_MemAvailable_bytes'),
    promQuery('node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('node_load1'),
  ])

  const instances = [...new Set(memTotal.map(r => r.metric.instance))].filter(Boolean)
  const total = instances.length

  let healthy = 0, warning = 0, critical = 0
  instances.forEach(inst => {
    const idle = parseFloat(cpuIdle.find(r => r.metric.instance === inst)?.value[1] ?? '50')
    const cpu = 100 - idle
    const mt = parseFloat(memTotal.find(r => r.metric.instance === inst)?.value[1] ?? '1')
    const ma = parseFloat(memAvail.find(r => r.metric.instance === inst)?.value[1] ?? '1')
    const memPct = mt > 0 ? (mt - ma) / mt * 100 : 0
    if (cpu > 90 || memPct > 95) critical++
    else if (cpu > 75 || memPct > 80) warning++
    else healthy++
  })

  const totalDisk = diskTotal.reduce((s, r) => s + parseFloat(r.value[1]), 0)
  const availDisk = diskAvail.reduce((s, r) => s + parseFloat(r.value[1]), 0)
  const storageUsedPct = totalDisk > 0 ? Math.round((totalDisk - availDisk) / totalDisk * 100) : 0

  let openIncidents = 0, criticalIncidents = 0
  if (isAlertmanagerConfigured()) {
    try {
      const alerts = await alertmanagerAlerts()
      openIncidents = alerts.filter(a => a.status.state === 'active').length
      criticalIncidents = alerts.filter(a => a.status.state === 'active' && a.labels.severity === 'critical').length
    } catch { /* alertmanager optional */ }
  }

  const sim = simulatedOverview()
  return {
    ...sim,
    totalServers: total,
    healthyServers: healthy,
    warningServers: warning,
    criticalServers: critical,
    offlineServers: 0,
    storageUsedPct,
    openIncidents,
    criticalIncidents,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  if (isPrometheusConfigured()) {
    try {
      return NextResponse.json(await liveOverview())
    } catch (e) {
      console.error('[overview] Prometheus error, falling back:', e)
    }
  }

  return NextResponse.json(simulatedOverview())
}
