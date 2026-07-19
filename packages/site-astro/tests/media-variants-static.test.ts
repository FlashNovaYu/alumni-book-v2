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

  it('passes student background media and neighbour preload through shared helpers', () => {
    const albumGrid = readFileSync(resolve(__dirname, '../src/components/AlbumGrid.vue'), 'utf8')
    const photoWall = readFileSync(resolve(__dirname, '../src/components/PhotoWall.vue'), 'utf8')
    const profile = readFileSync(resolve(__dirname, '../src/components/StudentProfile.vue'), 'utf8')
    const classSpaceAlbum = readFileSync(resolve(__dirname, '../src/components/ClassSpaceAlbumRail.vue'), 'utf8')
    const classSpaceTimeline = readFileSync(resolve(__dirname, '../src/components/ClassSpaceTimelineRail.vue'), 'utf8')
    const timeline = readFileSync(resolve(__dirname, '../src/pages/timeline.astro'), 'utf8')
    expect(profile).toContain('student.value.media?.background?.variants')
    expect(profile).toContain(':srcset="avatarMedia.srcset')
    expect(albumGrid).toContain('resolveMediaUrl')
    expect(photoWall).toContain('resolveMediaUrl')
    expect(classSpaceAlbum).toContain('buildMediaSources')
    expect(classSpaceTimeline).toContain('buildMediaSources')
    expect(timeline).toContain('buildMediaSources')
  })
})
