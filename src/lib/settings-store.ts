import fs from 'fs'
import path from 'path'

export interface AppSettings {
  // Infrastructure — data sources
  prometheusUrl: string
  alertmanagerUrl: string
  snmpCommunity: string
  snmpPduHost: string
  ipmiDefaultUser: string
  ipmiDefaultPassword: string
  // Rack & asset inventory
  rackTopologyFile: string
  cmdbInventoryFile: string
  // Alerting — thresholds
  criticalTempThreshold: number
  warningTempThreshold: number
  diskFailureAlertDays: number
  powerAlertPctOverBudget: number
  // Alerting — delivery
  slackWebhookUrl: string
  alertEmailEnabled: boolean
  alertRecipients: string  // comma-separated fallback emails
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
  // AI Copilot
  aiModel: string
  groqApiKey: string
  // General
  defaultRefreshInterval: number
}

const DEFAULTS: AppSettings = {
  // Infrastructure
  prometheusUrl: '',
  alertmanagerUrl: '',
  snmpCommunity: 'public',
  snmpPduHost: '',
  ipmiDefaultUser: 'admin',
  ipmiDefaultPassword: '',
  // Rack & asset inventory
  rackTopologyFile: '',
  cmdbInventoryFile: '',
  // Alerting thresholds
  criticalTempThreshold: 85,
  warningTempThreshold: 75,
  diskFailureAlertDays: 30,
  powerAlertPctOverBudget: 10,
  // Alerting delivery
  slackWebhookUrl: '',
  alertEmailEnabled: false,
  alertRecipients: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPassword: '',
  smtpFrom: '',
  // AI Copilot
  aiModel: 'llama-3.3-70b-versatile',
  groqApiKey: '',
  // General
  defaultRefreshInterval: 30,
}

const DATA_DIR = path.join(process.cwd(), 'data')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function getSettings(): AppSettings {
  ensureDir()
  if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULTS }
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as Partial<AppSettings>
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const updated: AppSettings = { ...current, ...partial }
  ensureDir()
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8')
  return updated
}
