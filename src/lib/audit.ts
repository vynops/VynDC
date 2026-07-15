/**
 * audit.ts — Lightweight audit log
 * Writes to data/audit-log.json (newest-first, capped at MAX_ENTRIES).
 * All writes are synchronous-but-non-blocking via setImmediate to avoid
 * slowing down API responses.
 */
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'

export interface AuditEntry {
  ts: string      // ISO-8601 timestamp
  actor: string   // user email, 'anonymous', or 'system'
  action: string  // dot-notation e.g. 'login.success', 'incident.resolve'
  detail: string  // human-readable description
  ip: string      // client IP
}

const AUDIT_FILE  = path.join(process.cwd(), 'data', 'audit-log.json')
const MAX_ENTRIES = 1000

function load(): AuditEntry[] {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return []
    return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) as AuditEntry[]
  } catch { return [] }
}

/** Write an audit entry. Fire-and-forget — does not block the caller. */
export function writeAudit(entry: Omit<AuditEntry, 'ts'>): void {
  setImmediate(() => {
    try {
      const dir = path.dirname(AUDIT_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const log = load()
      log.unshift({ ts: new Date().toISOString(), ...entry })
      if (log.length > MAX_ENTRIES) log.splice(MAX_ENTRIES)
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(log, null, 2), 'utf8')
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
