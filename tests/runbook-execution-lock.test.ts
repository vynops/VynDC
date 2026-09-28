import assert from 'node:assert/strict'
import test from 'node:test'
import { withRunbookExecutionLock } from '../src/lib/runbook-execution-lock.ts'

test('serializes overlapping runbook operations', async () => {
  const events: string[] = []
  let releaseFirst!: () => void
  const first = withRunbookExecutionLock(async () => {
    events.push('first-start')
    await new Promise<void>(resolve => { releaseFirst = resolve })
    events.push('first-end')
  })
  const second = withRunbookExecutionLock(async () => { events.push('second') })

  await Promise.resolve()
  assert.deepEqual(events, ['first-start'])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(events, ['first-start', 'first-end', 'second'])
})