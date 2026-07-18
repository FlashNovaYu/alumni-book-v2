// @ts-nocheck — Vitest is provided by the workspace test runner, not the shared package runtime.
import { describe, expect, it } from 'vitest'
import { buildMediaSources } from './media'

describe('buildMediaSources', () => {
  it('creates sorted srcset URLs from variants', () => {
    const result = buildMediaSources('/api/files/photos/original.jpg', [
      { key: 'photos/960.webp', contentType: 'image/webp', width: 960, height: 640, kind: '960' },
      { key: 'photos/320.webp', contentType: 'image/webp', width: 320, height: 213, kind: '320' },
    ], 320, 213)
    expect(result.src).toBe('/api/files/photos/320.webp')
    expect(result.srcset).toBe('/api/files/photos/320.webp 320w, /api/files/photos/960.webp 960w')
    expect(result.sizes).toBe('320px')
  })

  it('keeps a legacy URL usable when no metadata exists', () => {
    expect(buildMediaSources('https://cdn.example.test/api/files/photos/a.jpg')).toMatchObject({
      src: 'https://cdn.example.test/api/files/photos/a.jpg',
      srcset: '',
      sizes: '100vw',
    })
  })
})
