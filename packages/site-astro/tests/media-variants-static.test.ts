import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('responsive media source contract', () => {
  it('uses derivative srcset for list thumbnails and keeps originals for lightboxes', () => {
    const albumGrid = readFileSync(resolve(__dirname, '../src/components/AlbumGrid.vue'), 'utf8')
    const photoWall = readFileSync(resolve(__dirname, '../src/components/PhotoWall.vue'), 'utf8')
    expect(albumGrid).toContain(':srcset="getMedia(photo).srcset')
    expect(albumGrid).toContain('getPhotoUrl(lightbox.photos[lightbox.index]?.r2Key)')
    expect(photoWall).toContain(':srcset="photoMedia(photo).srcset')
    expect(photoWall).toContain(':src="photoUrl(photos[lightbox.index])"')
    expect(albumGrid).not.toContain(':src="getPhotoUrl(photo.r2Key)"')
  })
})
