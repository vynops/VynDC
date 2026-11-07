export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { ensureAdminExists } = await import('./lib/user-store')
    ensureAdminExists()
    if (process.env.VYNDC_INCIDENT_WORKER_ENABLED === 'true') {
      const { startIncidentWorker } = await import('./lib/incident-worker')
      startIncidentWorker()
    }
  }
}