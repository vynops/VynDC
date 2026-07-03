import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadOncall, saveOncall, type Shift } from '@/lib/oncall-store'
import { randomUUID } from 'crypto'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadOncall())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json() as Partial<Shift>
    if (!body.userEmail || !body.startTime || !body.endTime) {
      return NextResponse.json({ error: 'userEmail, startTime, endTime required' }, { status: 400 })
    }
    const store = loadOncall()
    const shift: Shift = {
      id: body.id ?? randomUUID(),
      name: body.name ?? 'On-Call Shift',
      userEmail: body.userEmail,
      userName: body.userName ?? body.userEmail,
      startTime: body.startTime,
      endTime: body.endTime,
      timezone: body.timezone ?? 'UTC',
    }
    // Replace if id exists, otherwise push
    const idx = store.shifts.findIndex(s => s.id === shift.id)
    if (idx >= 0) store.shifts[idx] = shift
    else store.shifts.push(shift)
    saveOncall(store)
    return NextResponse.json(shift)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const store = loadOncall()
  store.shifts = store.shifts.filter(s => s.id !== id)
  saveOncall(store)
  return NextResponse.json({ ok: true })
}
