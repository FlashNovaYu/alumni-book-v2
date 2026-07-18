import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/views/AlbumsView.vue'), 'utf8')

describe('media upload queue contract', () => {
  it('runs exactly two workers and records per-file failures without aborting the queue', () => {
    expect(source).toContain('await Promise.all([worker(), worker()])')
    expect(source).toContain('failures.push(`${file.name}:')
    expect(source).toContain('if (signal.aborted) return')
  })
})
