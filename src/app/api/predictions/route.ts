import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedPredictions } from '@/lib/simulation'
import type { Prediction } from '@/lib/simulation'
import { isPrometheusConfigured, promQuery } from '@/lib/prometheus'
import { getSettings } from '@/lib/settings-store'

// predict_linear(series[window], seconds_ahead)
// returns bytes available in N days — negative = already exceeded
async function livePredictions(): Promise<Prediction[]> {
  const settings = getSettings()
  const criticalTemp = settings.criticalTempThreshold
  const warningTemp = settings.warningTempThreshold
  const diskAlertDays = settings.diskFailureAlertDays

  const secsAhead = diskAlertDays * 24 * 3600

  const [
    diskFillPred,   // predicted avail bytes in diskAlertDays
    diskCurrent,    // current avail bytes (to compute fill rate)
    diskTotal,
    cpuTrend,       // avg CPU over last 6h
    memTrend,       // avg mem used % over last 6h
    tempTrend,      // node temp if available
    memTotal,
    memAvail,
  ] = await Promise.all([
    promQuery(`predict_linear(node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}[6h], ${secsAhead})`),
    promQuery('node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}'),
    promQuery('avg_over_time(rate(node_cpu_seconds_total{mode!="idle"}[5m])[6h:5m]) * 100'),
    promQuery('avg_over_time((1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)[6h:5m]) * 100'),
    promQuery('node_hwmon_temp_celsius{sensor="temp1"}'),
    promQuery('node_memory_MemTotal_bytes'),
    promQuery('node_memory_MemAvailable_bytes'),
  ])

  const preds: Prediction[] = []
  let idx = 0

  // ── Disk fill predictions ─────────────────────────────────────────────────
  diskFillPred.forEach(r => {
    const { instance } = r.metric
    const hostname = instance.split(':')[0]
    const predictedAvail = parseFloat(r.value[1])
    const currentAvail = parseFloat(diskCurrent.find(x => x.metric.instance === instance)?.value[1] ?? '1')
    const total = parseFloat(diskTotal.find(x => x.metric.instance === instance)?.value[1] ?? '1')

    // Only fire if disk is actually shrinking and will run out within diskAlertDays
    if (predictedAvail < 0 && currentAvail < total) {
      const usedPct = (total - currentAvail) / total
      // Estimate days to full: currentAvail / fill_rate_per_second / 86400
      const fillRatePerSec = (currentAvail - predictedAvail) / secsAhead
      const daysToFull = fillRatePerSec > 0 ? Math.round(currentAvail / fillRatePerSec / 86400) : diskAlertDays
      preds.push({
        id: `pred-disk-${++idx}`,
        serverId: `node-${instance}`,
        hostname,
        rack: 'rack-1',
        component: 'disk',
        confidence: Math.min(95, Math.round(usedPct * 100)),
        estimatedDaysToFailure: Math.max(1, daysToFull),
        reason: `Disk filling at current rate — predicted full in ~${daysToFull} day${daysToFull !== 1 ? 's' : ''}`,
        severity: daysToFull <= 3 ? 'critical' : daysToFull <= 7 ? 'high' : 'medium',
        createdAt: new Date().toISOString(),
      })
    }
  })

  // ── CPU saturation predictions ────────────────────────────────────────────
  cpuTrend.forEach(r => {
    const { instance } = r.metric
    const hostname = instance.split(':')[0]
    const avgCpu = parseFloat(r.value[1])
    if (avgCpu > 80) {
      preds.push({
        id: `pred-cpu-${++idx}`,
        serverId: `node-${instance}`,
        hostname,
        rack: 'rack-1',
        component: 'cpu',
        confidence: Math.min(90, Math.round(avgCpu)),
        estimatedDaysToFailure: avgCpu > 95 ? 1 : avgCpu > 90 ? 3 : 7,
        reason: `CPU averaging ${Math.round(avgCpu)}% over last 6h — sustained saturation risk`,
        severity: avgCpu > 95 ? 'critical' : avgCpu > 90 ? 'high' : 'medium',
        createdAt: new Date().toISOString(),
      })
    }
  })

  // ── Memory pressure predictions ───────────────────────────────────────────
  memTrend.forEach(r => {
    const { instance } = r.metric
    const hostname = instance.split(':')[0]
    const avgMemPct = parseFloat(r.value[1])
    if (avgMemPct > 85) {
      preds.push({
        id: `pred-mem-${++idx}`,
        serverId: `node-${instance}`,
        hostname,
        rack: 'rack-1',
        component: 'memory',
        confidence: Math.min(90, Math.round(avgMemPct)),
        estimatedDaysToFailure: avgMemPct > 95 ? 1 : avgMemPct > 92 ? 2 : 5,
        reason: `Memory usage averaging ${Math.round(avgMemPct)}% over last 6h — OOM risk`,
        severity: avgMemPct > 95 ? 'critical' : avgMemPct > 92 ? 'high' : 'medium',
        createdAt: new Date().toISOString(),
      })
    }
  })

  // ── Thermal predictions ───────────────────────────────────────────────────
  tempTrend.forEach(r => {
    const { instance } = r.metric
    const hostname = instance.split(':')[0]
    const temp = parseFloat(r.value[1])
    if (temp > warningTemp) {
      preds.push({
        id: `pred-temp-${++idx}`,
        serverId: `node-${instance}`,
        hostname,
        rack: 'rack-1',
        component: 'thermal',
        confidence: 85,
        estimatedDaysToFailure: temp > criticalTemp ? 1 : 7,
        reason: `Temperature at ${Math.round(temp)}°C — exceeds ${temp > criticalTemp ? 'critical' : 'warning'} threshold (${temp > criticalTemp ? criticalTemp : warningTemp}°C)`,
        severity: temp > criticalTemp ? 'critical' : 'high',
        createdAt: new Date().toISOString(),
      })
    }
  })

  return preds
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  if (isPrometheusConfigured()) {
    try {
      const preds = await livePredictions()
      // If no anomalies found, return empty array (good news = no predictions needed)
      return NextResponse.json(preds)
    } catch (e) {
      console.error('[predictions] Prometheus error, falling back:', e)
    }
  }

  return NextResponse.json(simulatedPredictions())
}
