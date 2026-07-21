// @ts-nocheck — Vitest is provided by the workspace test runner, not the shared package runtime.
import { describe, expect, it } from 'vitest'
import { buildMediaSources, resolveMediaUrl } from './media'

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

  it('resolves a single derivative URL for lightbox neighbour preloads', () => {
    expect(resolveMediaUrl('/api/files/photos/original.jpg', 'photos/960.webp')).toBe('/api/files/photos/960.webp')
    expect(resolveMediaUrl('https://cdn.example.test/api/files/photos/original.jpg', 'https://img.example.test/960.webp')).toBe('https://img.example.test/960.webp')
  })

  it('selects high-res variant for background when larger width is requested', () => {
    const result = buildMediaSources('/api/files/backgrounds/orig.jpg', [
      { key: 'backgrounds/1920.webp', contentType: 'image/webp', width: 1920, height: 1080, kind: '1920' },
      { key: 'backgrounds/320.webp', contentType: 'image/webp', width: 320, height: 180, kind: '320' },
    ], 1920, 1080)
    expect(result.src).toBe('/api/files/backgrounds/1920.webp')
  })
})
