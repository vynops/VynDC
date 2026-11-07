import { randomBytes } from 'node:crypto'
import { closeSync, openSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const envPath = join(process.cwd(), '.env.local')
const contents = [
  '# Generated automatically by VynDC. Keep this file private.',
  `VYNDC_SECRET=${randomBytes(32).toString('hex')}`,
  'VYNDC_ADMIN_EMAIL=admin@vyndc.local',
  'VYNDC_ADMIN_PASSWORD=changeme',
  '',
].join('\n')

let descriptor
try {
  descriptor = openSync(envPath, 'wx', 0o600)
  writeFileSync(descriptor, contents, 'utf8')
  console.log('Created .env.local. Initial sign-in: admin@vyndc.local / changeme; you will be required to change this password.')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('Preserved existing .env.local.')
} finally {
  if (descriptor !== undefined) closeSync(descriptor)
}