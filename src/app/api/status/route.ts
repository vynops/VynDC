import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { resolveDataSourceStatus } from '@/lib/data-source-status'
import { isPrometheusConfigured, isAlertmanagerConfigured, promQuery, alertmanagerAlerts } from '@/lib/prometheus'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  let prometheusConnected = false
  let alertmanagerConnected = false

  if (isPrometheusConfigured()) {
    try {
      await promQuery('up')
      prometheusConnected = true
    } catch {
      prometheusConnected = false
    }
  }

  if (isAlertmanagerConfigured()) {
    try {
      await alertmanagerAlerts()
      alertmanagerConnected = true
    } catch {
      alertmanagerConnected = false
    }
  }

  return NextResponse.json(
    resolveDataSourceStatus({
      prometheusConfigured: isPrometheusConfigured(),
      alertmanagerConfigured: isAlertmanagerConfigured(),
      prometheusConnected,
      alertmanagerConnected,
    })
  )
}

