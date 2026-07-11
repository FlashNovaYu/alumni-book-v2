import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('Worker test environment', () => {
  it('provides a non-empty JWT secret to Miniflare', () => {
    expect(env.JWT_SECRET).toBeTypeOf('string')
    expect(env.JWT_SECRET.trim().length).toBeGreaterThan(0)
  })
})
