export type DataSourceMode = 'demo' | 'live' | 'partial'

export interface DataSourceStatus {
  mode: DataSourceMode
  label: string
  summary: string
  sources: {
    prometheus: { configured: boolean; connected: boolean }
    alertmanager: { configured: boolean; connected: boolean }
  }
}

export function resolveDataSourceStatus(params: {
  prometheusConfigured: boolean
  alertmanagerConfigured: boolean
  prometheusConnected: boolean
  alertmanagerConnected: boolean
}): DataSourceStatus {
  const { prometheusConfigured, alertmanagerConfigured, prometheusConnected, alertmanagerConnected } = params

  const configuredSources = [prometheusConfigured, alertmanagerConfigured].filter(Boolean).length
  const connectedSources = [prometheusConnected, alertmanagerConnected].filter(Boolean).length

  if (configuredSources === 0) {
    return {
      mode: 'demo',
      label: 'Demo mode',
      summary: 'No live data source configured. Showing sample datacenter data.',
      sources: {
        prometheus: { configured: false, connected: false },
        alertmanager: { configured: false, connected: false },
      },
    }
  }

  if (configuredSources > 0 && connectedSources === 0) {
    return {
      mode: 'demo',
      label: 'Demo fallback',
      summary: 'Configured sources are not reachable right now. Showing sample datacenter data.',
      sources: {
        prometheus: { configured: prometheusConfigured, connected: prometheusConnected },
        alertmanager: { configured: alertmanagerConfigured, connected: alertmanagerConnected },
      },
    }
  }

  if (configuredSources > 0 && connectedSources < configuredSources) {
    return {
      mode: 'partial',
      label: 'Partial live mode',
      summary: 'Some live sources are connected. Mixed live and sample data is being shown.',
      sources: {
        prometheus: { configured: prometheusConfigured, connected: prometheusConnected },
        alertmanager: { configured: alertmanagerConfigured, connected: alertmanagerConnected },
      },
    }
  }

  return {
    mode: 'live',
    label: 'Live mode',
    summary: 'Connected to live monitoring data. Showing real datacenter metrics.',
    sources: {
      prometheus: { configured: prometheusConfigured, connected: prometheusConnected },
      alertmanager: { configured: alertmanagerConfigured, connected: alertmanagerConnected },
    },
  }
}

