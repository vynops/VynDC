import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedPower } from '@/lib/simulation'
import type { PowerMetrics } from '@/lib/simulation'
import { isPrometheusConfigured, promQuery, promQueryRange } from '@/lib/prometheus'
import { getSettings } from '@/lib/settings-store'

// ── SNMP PDU query (real hardware) ───────────────────────────────────────────
// Per-outlet metering OIDs are vendor-specific (each vendor uses its own private
// enterprise MIB). These are commonly-seen defaults for popular metered PDU
// lines — exact sub-OID/table index can still vary by model & firmware, so
// Settings → Infrastructure allows an manual OID override when the default
// doesn't match a customer's specific hardware.
type PduUnit = 'tenthAmps120v' | 'watts' | 'tenthWatts'
const VENDOR_OID_DEFAULTS: Record<string, { oid: string; unit: PduUnit; label: string }> = {
  apc:        { oid: '1.3.6.1.4.1.318.1.1.12.3.5.1.1.2',   unit: 'tenthAmps120v', label: 'APC (PowerNet-MIB rPDU outlet current)' },
  raritan:    { oid: '1.3.6.1.4.1.13742.6.5.4.3.1.4',      unit: 'watts',         label: 'Raritan (PDU2-MIB outlet active power)' },
  vertiv:     { oid: '1.3.6.1.4.1.21239.5.2.9.1.4.1.4',    unit: 'watts',         label: 'Vertiv/Geist (rPDU outlet active power)' },
  eaton:      { oid: '1.3.6.1.4.1.534.6.6.7.6.6.1.2',      unit: 'tenthAmps120v', label: 'Eaton ePDU (outlet current)' },
  servertech: { oid: '1.3.6.1.4.1.1718.3.2.3.1.9',         unit: 'tenthAmps120v', label: 'Server Technology Sentry (outlet current)' },
  generic:    { oid: '1.3.6.1.4.1.318.1.1.12.3.5.1.1.2',   unit: 'tenthAmps120v', label: 'Generic (falls back to APC OID — override recommended)' },
}

function toWatts(raw: number, unit: PduUnit): number {
  if (unit === 'watts') return Math.round(raw)
  if (unit === 'tenthWatts') return Math.round(raw / 10)
  return Math.round((raw / 10) * 120) // tenths-of-amps × 120V
}

async function snmpOutletWatts(
  host: string, community: string, vendor: string, oidOverride: string,
): Promise<{ watts: number[]; source: string }> {
  const vendorCfg = VENDOR_OID_DEFAULTS[vendor] ?? VENDOR_OID_DEFAULTS.generic
  const oid = oidOverride?.trim() || vendorCfg.oid
  const unit = oidOverride?.trim() ? 'watts' : vendorCfg.unit // custom OIDs assumed to report watts unless documented otherwise

  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)
  try {
    const { stdout } = await exec('snmpwalk', ['-v2c', `-c${community}`, host, oid], { timeout: 5000 })
    const watts = stdout.split('\n')
      .filter(l => l.includes('INTEGER'))
      .map(l => toWatts(parseInt(l.split('INTEGER:')[1]?.trim() ?? '0', 10), unit as PduUnit))
      .filter(w => w > 0)
    return { watts, source: oidOverride?.trim() ? 'custom OID' : vendorCfg.label }
  } catch {
    return { watts: [], source: oidOverride?.trim() ? 'custom OID' : vendorCfg.label }
  }
}

// ── CPU-based power estimation ────────────────────────────────────────────────
// Typical cloud vCPU TDP: ~5-8W per core at full load
const WATTS_PER_VCPU_FULL = 6

async function livePower(): Promise<PowerMetrics & { isEstimated: boolean; pduWarning?: string }> {
  const settings = getSettings()
  const costPerKwh = 0.12 // USD — reasonable default, could be a future setting

  const [cpuIdle, cpuCount, memTotal, memAvail] = await Promise.all([
    promQuery('avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100'),
    promQuery('count by (instance) (node_cpu_seconds_total{mode="idle"})'),
    promQuery('node_memory_MemTotal_bytes'),
    promQuery('node_memory_MemAvailable_bytes'),
  ])

  // Per-node estimated wattage
  const instances = [...new Set(cpuIdle.map(r => r.metric.instance))].filter(Boolean)

  let itLoadW = 0
  const nodeWatts: { hostname: string; watts: number; cores: number; cpuPct: number }[] = []

  instances.forEach(inst => {
    const idlePct = parseFloat(cpuIdle.find(r => r.metric.instance === inst)?.value[1] ?? '50')
    const cpuPct = Math.max(0, 100 - idlePct)
    const cores = parseInt(cpuCount.find(r => r.metric.instance === inst)?.value[1] ?? '1', 10)
    // Idle baseline ~30% of full TDP + usage portion
    const watts = Math.round(cores * WATTS_PER_VCPU_FULL * (0.3 + 0.7 * cpuPct / 100))
    itLoadW += watts
    nodeWatts.push({ hostname: inst.split(':')[0], watts, cores, cpuPct: Math.round(cpuPct) })
  })

  // Try SNMP PDU if configured — overrides estimate
  let isEstimated = true
  let pduWarning: string | undefined
  if (settings.snmpPduHost) {
    const { watts, source } = await snmpOutletWatts(
      settings.snmpPduHost, settings.snmpCommunity || 'public',
      settings.pduVendor || 'apc', settings.pduOutletOid || '',
    )
    if (watts.length > 0) {
      itLoadW = watts.reduce((a, b) => a + b, 0)
      isEstimated = false
    } else {
      pduWarning = `PDU at ${settings.snmpPduHost} did not return outlet data via ${source} — check the vendor selection or set a custom OID override in Settings → Infrastructure. Falling back to CPU-based estimate.`
    }
  }

  // Fetch 24h trend via range query
  const now = Math.floor(Date.now() / 1000)
  const start = now - 24 * 3600
  let hourlyTrend: PowerMetrics['hourlyTrend'] = []
  try {
    const cpuRange = await promQueryRange(
      'avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) * 100',
      start, now, '1h'
    )
    if (cpuRange.length > 0) {
      hourlyTrend = cpuRange[0].values.map(([ts, val]) => {
        const cpuPct = parseFloat(val)
        const totalCores = nodeWatts.reduce((s, n) => s + n.cores, 0)
        const powerKw = (totalCores * WATTS_PER_VCPU_FULL * (0.3 + 0.7 * cpuPct / 100)) / 1000
        const pue = 1.2 + cpuPct / 1000 // estimated PUE rises slightly with load
        const hour = new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        return { hour, powerKw: Math.round(powerKw * 100) / 100, pue: Math.round(pue * 100) / 100 }
      })
    }
  } catch { /* trend optional */ }

  const itLoadKw = itLoadW / 1000
  // Cloud VMs: PUE ≈ 1.1-1.2 (Oracle/AWS are efficient), no cooling overhead we control
  const pue = isEstimated ? 1.15 : 1.4
  const totalPowerKw = itLoadKw * pue
  const coolingKw = totalPowerKw - itLoadKw
  const dailyCostUsd = totalPowerKw * 24 * costPerKwh
  const monthlyCostUsd = dailyCostUsd * 30

  // Rack power from topology or per-node estimates
  const rackPower: PowerMetrics['rackPower'] = [{
    rackId: 'rack-1',
    label: 'Rack A',
    powerW: itLoadW,
    capW: Math.max(itLoadW * 2, 2000),
  }]

  return {
    totalPowerKw: Math.round(totalPowerKw * 100) / 100,
    pue: Math.round(pue * 100) / 100,
    itLoadKw: Math.round(itLoadKw * 100) / 100,
    coolingKw: Math.round(coolingKw * 100) / 100,
    upsLoadPct: Math.min(95, Math.round(itLoadW / 30)), // estimated UPS sizing
    upsBatteryPct: 100,
    upsRuntimeMin: 30,
    costPerKwhUsd: costPerKwh,
    dailyCostUsd: Math.round(dailyCostUsd * 100) / 100,
    monthlyCostUsd: Math.round(monthlyCostUsd * 100) / 100,
    rackPower,
    hourlyTrend,
    isEstimated,
    pduWarning,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  if (isPrometheusConfigured()) {
    try {
      return NextResponse.json(await livePower())
    } catch (e) {
      console.error('[power] Prometheus error, falling back:', e)
    }
  }

  return NextResponse.json({ ...simulatedPower(), isEstimated: false })
}

