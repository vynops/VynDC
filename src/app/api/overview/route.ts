import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedOverview } from '@/lib/simulation'
import { isPrometheusConfigured, isAlertmanagerConfigured, promQuery, promQueryRange, alertmanagerAlerts } from '@/lib/prometheus'
import type { OverviewMetrics } from '@/lib/simulation'

async function liveOverview(): Promise<OverviewMetrics> {
  const now = Math.floor(Date.now() / 1000)
  const sevenDaysAgo = now - 7 * 24 * 3600

  const [cpuIdle, memTotal, memAvail, diskTotal, diskAvail, load1, cpuRange, memRange] = await Promise.all([
    promQuery('avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100'),
    promQuery('node_memory_MemTotal_bytes'),
    promQuery('node_memory_MemAvailable_bytes'),
    promQuery('node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('node_load1'),
    promQueryRange('avg(100 - (rate(node_cpu_seconds_total{mode="idle"}[5m]) * 100))', sevenDaysAgo, now, '1h'),
    promQueryRange('avg(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100', sevenDaysAgo, now, '1h'),
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

  // Build 7-day CPU + memory trend from Prometheus range data
  const cpuTrend7d = (cpuRange[0]?.values ?? []).map(([ts, cpuVal]) => {
    const memPoint = memRange[0]?.values.find(([mt]) => mt === ts)
    const d = new Date((ts as number) * 1000)
    return {
      time: `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:00`,
      cpu: Math.round(parseFloat(cpuVal as string) * 10) / 10,
      mem: memPoint ? Math.round(parseFloat(memPoint[1] as string) * 10) / 10 : 0,
    }
  })

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
    cpuTrend7d,
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
