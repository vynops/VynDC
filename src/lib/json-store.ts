import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'

export function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600)
    try {
      fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8')
      fs.fsyncSync(descriptor)
    } finally { fs.closeSync(descriptor) }
    for (let attempt = 0; attempt < 6; attempt++) {
      try { fs.renameSync(temporary, file); break }
      catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(code) || attempt === 5) throw error
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1))
      }
    }
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

export function withStoreLock<T>(name: string, operation: () => T): T {
  const file = path.join(process.cwd(), 'data', `${name}.lock`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file)) {
    let createdAt: number
    try {
      const lock = readJson<{ createdAt: number }>(file, { createdAt: Date.now() })
      createdAt = Number.isFinite(lock.createdAt) ? lock.createdAt : fs.statSync(file).mtimeMs
    } catch { createdAt = fs.statSync(file).mtimeMs }
    if (Date.now() - createdAt > 60_000) fs.unlinkSync(file)
  }
  const descriptor = fs.openSync(file, 'wx', 0o600)
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ createdAt: Date.now() }))
    return operation()
  } finally {
    fs.closeSync(descriptor)
    fs.unlinkSync(file)
  }
}