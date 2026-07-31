import { describe, expect, it } from 'vitest'
import { normalizeFileUrl, normalizeLegacyFileUrls } from '../src/lib/fileUrl'

describe('media file URL normalization', () => {
  it('converts legacy ECS IP file URLs to same-origin paths', () => {
    expect(normalizeFileUrl('http://118.178.88.227/api/files/avatars/example.webp'))
      .toBe('/api/files/avatars/example.webp')
    expect(normalizeFileUrl('https://118.178.88.227/api/files/backgrounds/example.webp'))
      .toBe('/api/files/backgrounds/example.webp')
  })

  it('normalizes legacy IP URLs inside nested media data', () => {
    expect(normalizeLegacyFileUrls({
      avatarUrl: 'http://118.178.88.227/api/files/avatars/example.webp',
      backgroundUrl: 'https://118.178.88.227/api/files/backgrounds/example.webp',
      variants: [{ key: 'avatars/example_320.webp' }],
    })).toEqual({
      avatarUrl: '/api/files/avatars/example.webp',
      backgroundUrl: '/api/files/backgrounds/example.webp',
      variants: [{ key: 'avatars/example_320.webp' }],
    })
  })
})
