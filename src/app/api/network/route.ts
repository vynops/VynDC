import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { simulatedNetwork } from '@/lib/simulation'
import type { NetworkInterface } from '@/lib/simulation'
import { isPrometheusConfigured, promQuery } from '@/lib/prometheus'

async function liveNetwork(): Promise<NetworkInterface[]> {
  const [rxBytes, txBytes, rxErr, txErr, rxDrop, txDrop, speed, linkUp] = await Promise.all([
    promQuery('rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|br-.*|cni.*"}[2m]) * 8 / 1e6'),
    promQuery('rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|br-.*|cni.*"}[2m]) * 8 / 1e6'),
    promQuery('rate(node_network_receive_errs_total{device!~"lo|veth.*|docker.*|br-.*|cni.*"}[2m])'),
    promQuery('rate(node_network_transmit_errs_total{device!~"lo|veth.*|docker.*|br-.*|cni.*"}[2m])'),
    promQuery('rate(node_network_receive_drop_total{device!~"lo|veth.*|docker.*|br-.*|cni.*"}[2m])'),
    promQuery('rate(node_network_transmit_drop_total{device!~"lo|veth.*|docker.*|br-.*|cni.*"}[2m])'),
    promQuery('node_network_speed_bytes{device!~"lo|veth.*|docker.*|br-.*|cni.*"}'),
    promQuery('node_network_up{device!~"lo|veth.*|docker.*|br-.*|cni.*"}'),
  ])

  const ifaces: NetworkInterface[] = []
  let idx = 0

  rxBytes.forEach(r => {
    const { instance, device } = r.metric
    const key = (arr: typeof rxBytes) =>
      arr.find(x => x.metric.instance === instance && x.metric.device === device)

    const speedBps = parseFloat(key(speed)?.value[1] ?? '0')
    const up = parseFloat(key(linkUp)?.value[1] ?? '1') > 0

    ifaces.push({
      id: `nic-${++idx}`,
      serverId: `node-${instance}`,
      hostname: instance.split(':')[0],
      rack: 'rack-1',
      interface: device,
      speedGbps: speedBps > 0 ? speedBps / 1e9 : 1,
      rxMbps: Math.round(parseFloat(r.value[1]) * 10) / 10,
      txMbps: Math.round(parseFloat(key(txBytes)?.value[1] ?? '0') * 10) / 10,
      rxErrors: Math.round(parseFloat(key(rxErr)?.value[1] ?? '0')),
      txErrors: Math.round(parseFloat(key(txErr)?.value[1] ?? '0')),
      rxDrops: Math.round(parseFloat(key(rxDrop)?.value[1] ?? '0')),
      txDrops: Math.round(parseFloat(key(txDrop)?.value[1] ?? '0')),
      status: up ? 'up' : 'down',
    })
  })

  return ifaces
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  if (isPrometheusConfigured()) {
    try {
      return NextResponse.json(await liveNetwork())
    } catch (e) {
      console.error('[network] Prometheus error, falling back:', e)
    }
  }

  return NextResponse.json(simulatedNetwork())
}
