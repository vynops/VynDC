import { seededRandom } from './seed'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ServerStatus = 'healthy' | 'warning' | 'critical' | 'offline'
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low'
export type DiskHealth = 'good' | 'warning' | 'failing' | 'failed'

export interface NetworkInterfaceInfo {
  name: string
  speedGbps: number
  rxMbps: number
  txMbps: number
}

export interface Server {
  id: string
  hostname: string
  rack: string
  uPosition: number
  uHeight: number
  ipmi: string
  os: string
  cpuModel: string
  cpuCores: number
  cpuUsagePct: number
  memoryGiB: number
  memoryUsedGiB: number
  diskCount: number
  diskTotalTiB: number
  networkInterfaces: NetworkInterfaceInfo[]
  tempCelsius: number
  powerWatts: number
  powerCapWatts: number
  status: ServerStatus
  uptime: number
  lastSeen: string
}

export interface RackSummary {
  id: string
  label: string
  location: string
  totalU: number
  usedU: number
  servers: string[]
  totalPowerW: number
  powerCapW: number
  tempCelsius: number
}

export interface PowerMetrics {
  totalPowerKw: number
  pue: number
  itLoadKw: number
  coolingKw: number
  upsLoadPct: number
  upsBatteryPct: number
  upsRuntimeMin: number
  costPerKwhUsd: number
  dailyCostUsd: number
  monthlyCostUsd: number
  rackPower: { rackId: string; label: string; powerW: number; capW: number }[]
  hourlyTrend: { hour: string; powerKw: number; pue: number }[]
}

export interface DiskAsset {
  id: string
  serverId: string
  hostname: string
  rack: string
  slot: string
  model: string
  type: 'SSD' | 'HDD' | 'NVMe'
  capacityGiB: number
  usedGiB: number
  age: number
  smart: {
    health: DiskHealth
    reallocatedSectors: number
    powerOnHours: number
    temperature: number
  }
  warrantyExpiry: string
  replacementDue?: string
}

export interface NetworkInterface {
  id: string
  serverId: string
  hostname: string
  rack: string
  interface: string
  speedGbps: number
  rxMbps: number
  txMbps: number
  rxErrors: number
  txErrors: number
  rxDrops: number
  txDrops: number
  status: 'up' | 'down' | 'degraded'
}

export interface Incident {
  id: string
  title: string
  severity: IncidentSeverity
  serverId?: string
  hostname?: string
  rack?: string
  category: 'hardware' | 'thermal' | 'power' | 'network' | 'storage' | 'prediction'
  description: string
  status: 'open' | 'acknowledged' | 'resolved'
  createdAt: string
  resolvedAt?: string
  assignedTo?: string
}

export interface Prediction {
  id: string
  serverId: string
  hostname: string
  rack: string
  component: 'disk' | 'memory' | 'cpu' | 'psu' | 'thermal'
  confidence: number
  estimatedDaysToFailure: number
  reason: string
  severity: IncidentSeverity
  createdAt: string
}

export interface OverviewMetrics {
  totalServers: number
  healthyServers: number
  warningServers: number
  criticalServers: number
  offlineServers: number
  totalRacks: number
  avgPue: number
  avgTempCelsius: number
  totalPowerKw: number
  openIncidents: number
  criticalIncidents: number
  activePredictions: number
  storageUsedPct: number
  networkUtilPct: number
  incidentTrend: { date: string; critical: number; high: number; medium: number }[]
  serverStatusHistory: { hour: string; healthy: number; warning: number; critical: number }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEED = 0xdeadbeef
const RACKS = ['A01', 'A02', 'A03', 'A04']
const OS_LIST = ['Ubuntu 22.04 LTS', 'RHEL 9.3', 'Proxmox VE 8.1', 'Ubuntu 20.04 LTS', 'RHEL 8.8']
const CPU_MODELS = [
  'Intel Xeon Gold 6338 (32C)',
  'Intel Xeon Silver 4314 (16C)',
  'AMD EPYC 7543 (32C)',
  'Intel Xeon Gold 5320 (26C)',
  'AMD EPYC 9354P (32C)',
]
const DISK_MODELS = {
  SSD: ['Samsung PM9A3 3.84TB', 'Micron 5300 3.84TB', 'Samsung PM863a 1.92TB'],
  HDD: ['Seagate Exos X18 18TB', 'WD Gold 16TB', 'Seagate Exos X20 20TB'],
  NVMe: ['Samsung PM9A3 7.68TB', 'Kioxia CM6 6.4TB', 'Intel P5520 6.4TB'],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

function int(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function float(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min)
}

function isoDateDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function isoDateDaysAhead(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Servers ─────────────────────────────────────────────────────────────────

export function simulatedServers(): Server[] {
  const rng = seededRandom(SEED)
  const servers: Server[] = []
  let globalU = 0

  for (let ri = 0; ri < RACKS.length; ri++) {
    const rack = RACKS[ri]
    let rackU = 2 // start at U2
    for (let si = 0; si < 6; si++) {
      const idx = ri * 6 + si
      const uHeight = pick([1, 1, 1, 2], rng)
      const cpuCores = pick([16, 32, 32, 64], rng)
      const memGiB = pick([64, 128, 128, 256, 512], rng)
      const cpuUsage = float(5, 92, rng)
      const memUsed = float(0.3, 0.9, rng) * memGiB
      const temp = float(32, 88, rng)
      const powerCap = pick([500, 750, 1000, 1500], rng)
      const power = float(0.4, 0.9, rng) * powerCap
      const diskCount = pick([2, 4, 4, 6, 8], rng)
      const diskTotalTiB = diskCount * pick([2, 4, 8, 16], rng) / 1024 * 1000

      let status: ServerStatus
      if (cpuUsage > 90 || temp > 85) status = 'critical'
      else if (cpuUsage > 75 || temp > 75) status = 'warning'
      else if (idx === 3 && ri === 2) status = 'offline'
      else status = 'healthy'

      const uptime = int(86400, 86400 * 400, rng)

      servers.push({
        id: `srv-${rack.toLowerCase()}-${String(si + 1).padStart(2, '0')}`,
        hostname: `dc-${rack.toLowerCase()}-node${String(si + 1).padStart(2, '0')}`,
        rack,
        uPosition: rackU,
        uHeight,
        ipmi: `10.0.${ri + 1}.${100 + si}`,
        os: pick(OS_LIST, rng),
        cpuModel: pick(CPU_MODELS, rng),
        cpuCores,
        cpuUsagePct: Math.round(cpuUsage * 10) / 10,
        memoryGiB: memGiB,
        memoryUsedGiB: Math.round(memUsed * 10) / 10,
        diskCount,
        diskTotalTiB: Math.round(diskTotalTiB * 10) / 10,
        networkInterfaces: [
          {
            name: 'eth0',
            speedGbps: 25,
            rxMbps: Math.round(float(10, 2000, rng) * 10) / 10,
            txMbps: Math.round(float(5, 1500, rng) * 10) / 10,
          },
          {
            name: 'eth1',
            speedGbps: 25,
            rxMbps: Math.round(float(0, 500, rng) * 10) / 10,
            txMbps: Math.round(float(0, 300, rng) * 10) / 10,
          },
        ],
        tempCelsius: Math.round(temp * 10) / 10,
        powerWatts: Math.round(power),
        powerCapWatts: powerCap,
        status,
        uptime,
        lastSeen: isoDateDaysAgo(0),
      })

      rackU += uHeight + 1
      globalU++
    }
  }

  return servers
}

// ─── Racks ────────────────────────────────────────────────────────────────────

export function simulatedRacks(): RackSummary[] {
  const servers = simulatedServers()
  return RACKS.map((rack, ri) => {
    const rackServers = servers.filter(s => s.rack === rack)
    const totalPowerW = rackServers.reduce((acc, s) => acc + s.powerWatts, 0)
    const usedU = rackServers.reduce((acc, s) => acc + s.uHeight + 1, 0)
    const avgTemp = rackServers.reduce((acc, s) => acc + s.tempCelsius, 0) / rackServers.length
    return {
      id: rack.toLowerCase(),
      label: `Rack ${rack}`,
      location: `Row A, Position ${ri + 1}`,
      totalU: 42,
      usedU,
      servers: rackServers.map(s => s.id),
      totalPowerW,
      powerCapW: 10000,
      tempCelsius: Math.round(avgTemp * 10) / 10,
    }
  })
}

// ─── Power ────────────────────────────────────────────────────────────────────

export function simulatedPower(): PowerMetrics {
  const rng = seededRandom(SEED + 1)
  const servers = simulatedServers()
  const racks = simulatedRacks()
  const itLoadKw = servers.reduce((acc, s) => acc + s.powerWatts, 0) / 1000
  const pue = 1.38
  const coolingKw = itLoadKw * (pue - 1)
  const totalPowerKw = itLoadKw * pue
  const costPerKwh = 0.12
  const dailyCost = totalPowerKw * 24 * costPerKwh
  const monthlyCost = dailyCost * 30

  const hourlyTrend = Array.from({ length: 24 }, (_, h) => {
    const variation = 0.85 + float(0, 0.3, rng)
    const kw = itLoadKw * variation
    return {
      hour: `${String(h).padStart(2, '0')}:00`,
      powerKw: Math.round(kw * 100) / 100,
      pue: Math.round((1.3 + rng() * 0.2) * 100) / 100,
    }
  })

  return {
    totalPowerKw: Math.round(totalPowerKw * 100) / 100,
    pue,
    itLoadKw: Math.round(itLoadKw * 100) / 100,
    coolingKw: Math.round(coolingKw * 100) / 100,
    upsLoadPct: Math.round(float(55, 75, rng) * 10) / 10,
    upsBatteryPct: 100,
    upsRuntimeMin: int(45, 90, rng),
    costPerKwhUsd: costPerKwh,
    dailyCostUsd: Math.round(dailyCost * 100) / 100,
    monthlyCostUsd: Math.round(monthlyCost * 100) / 100,
    rackPower: racks.map(r => ({
      rackId: r.id,
      label: r.label,
      powerW: r.totalPowerW,
      capW: r.powerCapW,
    })),
    hourlyTrend,
  }
}

// ─── Disks ────────────────────────────────────────────────────────────────────

export function simulatedDisks(): DiskAsset[] {
  const rng = seededRandom(SEED + 2)
  const servers = simulatedServers()
  const disks: DiskAsset[] = []

  for (const server of servers) {
    for (let d = 0; d < server.diskCount; d++) {
      const type = pick(['SSD', 'HDD', 'NVMe'] as const, rng)
      const model = pick(DISK_MODELS[type], rng)
      const capGiB = type === 'NVMe' ? pick([6144, 7680], rng) : type === 'SSD' ? pick([1920, 3840], rng) : pick([16384, 18432, 20480], rng)
      const usedGiB = Math.round(float(0.2, 0.85, rng) * capGiB)
      const ageDays = int(30, 2000, rng)
      const poh = ageDays * 22
      const realloc = ageDays > 1000 && rng() > 0.7 ? int(1, 50, rng) : 0

      let health: DiskHealth = 'good'
      if (realloc > 20) health = 'failing'
      else if (realloc > 5) health = 'warning'
      else if (ageDays > 1800 && rng() > 0.8) health = 'failing'

      const warrantyYears = pick([3, 5], rng)
      const warrantyExpiry = new Date()
      warrantyExpiry.setDate(warrantyExpiry.getDate() - ageDays + warrantyYears * 365)

      disks.push({
        id: `disk-${server.id}-${d}`,
        serverId: server.id,
        hostname: server.hostname,
        rack: server.rack,
        slot: `bay${d}`,
        model,
        type,
        capacityGiB: capGiB,
        usedGiB,
        age: ageDays,
        smart: {
          health,
          reallocatedSectors: realloc,
          powerOnHours: poh,
          temperature: int(25, 55, rng),
        },
        warrantyExpiry: warrantyExpiry.toISOString().slice(0, 10),
        replacementDue: health === 'failing' ? isoDateDaysAhead(int(5, 30, rng)) : undefined,
      })
    }
  }

  return disks
}

// ─── Network ──────────────────────────────────────────────────────────────────

export function simulatedNetwork(): NetworkInterface[] {
  const rng = seededRandom(SEED + 3)
  const servers = simulatedServers()
  const ifaces: NetworkInterface[] = []

  for (const server of servers) {
    for (const nic of server.networkInterfaces) {
      const errors = rng() > 0.85 ? int(1, 200, rng) : 0
      const drops = rng() > 0.9 ? int(1, 50, rng) : 0
      const status: 'up' | 'down' | 'degraded' =
        errors > 100 ? 'degraded' : server.status === 'offline' ? 'down' : 'up'

      ifaces.push({
        id: `nic-${server.id}-${nic.name}`,
        serverId: server.id,
        hostname: server.hostname,
        rack: server.rack,
        interface: nic.name,
        speedGbps: nic.speedGbps,
        rxMbps: nic.rxMbps,
        txMbps: nic.txMbps,
        rxErrors: errors,
        txErrors: Math.floor(errors * 0.4),
        rxDrops: drops,
        txDrops: Math.floor(drops * 0.3),
        status,
      })
    }
  }

  return ifaces
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export function simulatedIncidents(): Incident[] {
  const rng = seededRandom(SEED + 4)
  const servers = simulatedServers()

  const templates: Array<{
    title: string
    severity: IncidentSeverity
    category: Incident['category']
    desc: string
  }> = [
    { title: 'CPU temperature critical', severity: 'critical', category: 'thermal', desc: 'CPU temperature exceeded 85°C threshold. Emergency throttling active.' },
    { title: 'Disk SMART failure predicted', severity: 'high', category: 'storage', desc: 'SMART data indicates imminent disk failure. Reallocated sectors: 47.' },
    { title: 'Network interface degraded', severity: 'medium', category: 'network', desc: 'High error rate detected on eth0. 182 rx errors in last 5 minutes.' },
    { title: 'Memory ECC errors detected', severity: 'high', category: 'hardware', desc: 'Correctable ECC memory errors on DIMM slot A2. Replace DIMM recommended.' },
    { title: 'Power supply redundancy lost', severity: 'high', category: 'power', desc: 'PSU-2 has failed. Server running on single power supply.' },
    { title: 'Rack temperature elevated', severity: 'medium', category: 'thermal', desc: 'Rack A03 inlet temperature is 28°C. Recommended max is 27°C.' },
    { title: 'Disk capacity threshold exceeded', severity: 'medium', category: 'storage', desc: '/data volume at 89% utilization. Consider expanding or archiving.' },
    { title: 'UPS battery below 40%', severity: 'high', category: 'power', desc: 'UPS battery at 38%. Runtime estimated at 12 minutes. Schedule replacement.' },
    { title: 'Node unreachable via IPMI', severity: 'critical', category: 'hardware', desc: 'IPMI BMC not responding to ping. Physical inspection required.' },
    { title: 'Fan speed out of range', severity: 'medium', category: 'thermal', desc: 'Fan zone 3 reporting 400 RPM below expected range. Possible fan failure.' },
    { title: 'Bonded NIC link degraded', severity: 'low', category: 'network', desc: 'Bond0 operating in degraded mode, eth1 link is down. Bandwidth halved.' },
    { title: 'OS disk write errors', severity: 'high', category: 'storage', desc: 'Kernel log reporting I/O errors on /dev/sda. Possible controller issue.' },
    { title: 'CPU utilisation sustained >90%', severity: 'medium', category: 'hardware', desc: 'CPU utilisation has been above 90% for 45 minutes. Check workloads.' },
    { title: 'Cooling unit fault', severity: 'critical', category: 'thermal', desc: 'CRAC unit 2 has triggered an internal fault alarm. Maintenance required.' },
    { title: 'Hypervisor memory overcommit', severity: 'low', category: 'hardware', desc: 'Memory balloon driver active on 3 VMs. Host memory pressure detected.' },
  ]

  const statuses: Incident['status'][] = ['open', 'open', 'acknowledged', 'open', 'resolved', 'acknowledged', 'open', 'open', 'open', 'open', 'resolved', 'open', 'open', 'open', 'acknowledged']

  return templates.map((t, i) => {
    const server = servers[int(0, servers.length - 1, rng)]
    const daysAgo = int(0, 14, rng)
    const st = statuses[i]
    const resolvedAt = st === 'resolved' ? isoDateDaysAgo(int(0, daysAgo, rng)) : undefined
    return {
      id: `inc-${String(i + 1).padStart(3, '0')}`,
      title: t.title,
      severity: t.severity,
      serverId: server.id,
      hostname: server.hostname,
      rack: server.rack,
      category: t.category,
      description: t.desc,
      status: st,
      createdAt: isoDateDaysAgo(daysAgo),
      resolvedAt,
      assignedTo: rng() > 0.6 ? pick(['ops-team@vyn.dev', 'admin@vyn.dev'], rng) : undefined,
    }
  })
}

// ─── Predictions ──────────────────────────────────────────────────────────────

export function simulatedPredictions(): Prediction[] {
  const rng = seededRandom(SEED + 5)
  const servers = simulatedServers()

  const templates: Array<{
    component: Prediction['component']
    reason: string
    severity: IncidentSeverity
    daysRange: [number, number]
    confRange: [number, number]
  }> = [
    { component: 'disk', reason: 'SMART reallocated sectors increasing at 3/day. Failure curve matches historical data.', severity: 'critical', daysRange: [3, 12], confRange: [88, 97] },
    { component: 'memory', reason: 'ECC correctable errors trending upward. Statistical model predicts uncorrectable error.', severity: 'high', daysRange: [10, 21], confRange: [72, 88] },
    { component: 'thermal', reason: 'CPU junction temperature trend extrapolation exceeds thermal limit within window.', severity: 'high', daysRange: [5, 14], confRange: [78, 92] },
    { component: 'psu', reason: 'PSU ripple voltage deviation and efficiency drop indicate capacitor degradation.', severity: 'high', daysRange: [14, 30], confRange: [65, 82] },
    { component: 'disk', reason: 'Spin-up time increasing. HDD bearing wear signature detected in acoustic profile.', severity: 'medium', daysRange: [20, 45], confRange: [60, 75] },
    { component: 'cpu', reason: 'Microcode error counter escalating. Possible cache or TLB instability predicted.', severity: 'medium', daysRange: [25, 60], confRange: [55, 70] },
    { component: 'thermal', reason: 'Inlet airflow obstruction detected via differential temperature sensors.', severity: 'low', daysRange: [30, 90], confRange: [50, 65] },
    { component: 'disk', reason: 'NVMe wear levelling count at 15%. Estimated write endurance exhaustion imminent.', severity: 'critical', daysRange: [7, 18], confRange: [85, 95] },
  ]

  return templates.map((t, i) => {
    const server = servers[int(0, servers.length - 1, rng)]
    return {
      id: `pred-${String(i + 1).padStart(3, '0')}`,
      serverId: server.id,
      hostname: server.hostname,
      rack: server.rack,
      component: t.component,
      confidence: int(t.confRange[0], t.confRange[1], rng),
      estimatedDaysToFailure: int(t.daysRange[0], t.daysRange[1], rng),
      reason: t.reason,
      severity: t.severity,
      createdAt: isoDateDaysAgo(int(0, 3, rng)),
    }
  })
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export function simulatedOverview(): OverviewMetrics {
  const rng = seededRandom(SEED + 6)
  const servers = simulatedServers()
  const power = simulatedPower()
  const incidents = simulatedIncidents()
  const predictions = simulatedPredictions()
  const disks = simulatedDisks()

  const healthy = servers.filter(s => s.status === 'healthy').length
  const warning = servers.filter(s => s.status === 'warning').length
  const critical = servers.filter(s => s.status === 'critical').length
  const offline = servers.filter(s => s.status === 'offline').length

  const avgTemp = servers.reduce((a, s) => a + s.tempCelsius, 0) / servers.length
  const totalStorageGiB = disks.reduce((a, d) => a + d.capacityGiB, 0)
  const usedStorageGiB = disks.reduce((a, d) => a + d.usedGiB, 0)

  const openIncidents = incidents.filter(i => i.status === 'open').length
  const criticalIncidents = incidents.filter(i => i.severity === 'critical' && i.status === 'open').length

  const allRxMbps = servers.flatMap(s => s.networkInterfaces).reduce((a, n) => a + n.rxMbps + n.txMbps, 0)
  const maxBandwidth = servers.length * 2 * 25 * 1000
  const networkUtilPct = Math.round((allRxMbps / maxBandwidth) * 100 * 10) / 10

  const incidentTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return {
      date: d.toISOString().slice(0, 10),
      critical: int(0, 3, rng),
      high: int(1, 5, rng),
      medium: int(2, 8, rng),
    }
  })

  const serverStatusHistory = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    healthy: int(18, 22, rng),
    warning: int(1, 4, rng),
    critical: int(0, 2, rng),
  }))

  return {
    totalServers: servers.length,
    healthyServers: healthy,
    warningServers: warning,
    criticalServers: critical,
    offlineServers: offline,
    totalRacks: 4,
    avgPue: power.pue,
    avgTempCelsius: Math.round(avgTemp * 10) / 10,
    totalPowerKw: power.totalPowerKw,
    openIncidents,
    criticalIncidents,
    activePredictions: predictions.length,
    storageUsedPct: Math.round((usedStorageGiB / totalStorageGiB) * 1000) / 10,
    networkUtilPct,
    incidentTrend,
    serverStatusHistory,
  }
}
