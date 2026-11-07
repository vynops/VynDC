/**
 * audit.ts — Lightweight audit log
 * Writes to data/audit-log.json (newest-first, capped at MAX_ENTRIES).
 * All writes are synchronous-but-non-blocking via setImmediate to avoid
 * slowing down API responses.
 */
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { readJson, writeJson, withStoreLock } from './json-store'

export interface AuditEntry {
  ts: string      // ISO-8601 timestamp
  actor: string   // user email, 'anonymous', or 'system'
  action: string  // dot-notation e.g. 'login.success', 'incident.resolve'
  detail: string  // human-readable description
  ip: string      // client IP
  id?: string
  incidentId?: string
  episodeId?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  notes?: string
  outcome?: 'requested' | 'succeeded' | 'failed' | 'skipped'
}

const AUDIT_FILE  = path.join(process.cwd(), 'data', 'audit-log.json')
const ARCHIVE_FILE = path.join(process.cwd(), 'data', 'audit-history.jsonl')
const MAX_ENTRIES = 1000

function load(): AuditEntry[] {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return []
    return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) as AuditEntry[]
  } catch { return [] }
}

/** Write an audit entry. Fire-and-forget — does not block the caller. */
export function writeAuditSync(entry: Omit<AuditEntry, 'ts'>): void {
  withStoreLock('audit', () => {
    const record = { ...entry, id: randomUUID(), ts: new Date().toISOString() }
    const log = readJson<AuditEntry[]>(AUDIT_FILE, [])
    const records = fs.existsSync(ARCHIVE_FILE) ? [record] : [...log].reverse().concat(record)
    const descriptor = fs.openSync(ARCHIVE_FILE, 'a', 0o600)
    try {
      fs.appendFileSync(descriptor, records.map(entry => JSON.stringify(entry)).join('\n') + '\n', 'utf8')
      fs.fsyncSync(descriptor)
    } finally { fs.closeSync(descriptor) }
    log.unshift(record)
    writeJson(AUDIT_FILE, log.slice(0, MAX_ENTRIES))
  })
}

export function writeAudit(entry: Omit<AuditEntry, 'ts'>): void {
  setImmediate(() => {
    try {
      writeAuditSync(entry)
    } catch (e) {
      console.error('[audit] write error:', e)
    }
  })
}

/** Read recent audit entries (newest-first). */
export function readAudit(limit = 200): AuditEntry[] {
  return load().slice(0, limit)
}

/** Extract the best available client IP from a Next.js request. */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
