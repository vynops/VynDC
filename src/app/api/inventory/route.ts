import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSettings } from '@/lib/settings-store'
import fs from 'fs'
import path from 'path'

export interface InventoryEntry {
  hostname: string
  role?: string
  model?: string
  serial?: string
  vendor?: string
  purchaseDate?: string
  warrantyExpiry?: string
  costUsd?: number
  location?: string
}

function loadInventory(): InventoryEntry[] {
  const settingsPath = getSettings().cmdbInventoryFile
  const defaultPath = path.join(process.cwd(), 'data', 'inventory.json')
  const filePath = settingsPath || defaultPath

  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as InventoryEntry[]
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadInventory())
}
