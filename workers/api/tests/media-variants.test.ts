import { describe, expect, it } from 'vitest'
import { parseUploadVariants } from '../src/routes/upload'

describe('upload media variant validation', () => {
  it('accepts bounded variant metadata and matching files', () => {
    const form = new FormData()
    form.append('variants', JSON.stringify([{ key: 'photos/album_320.webp', contentType: 'image/webp', width: 320, height: 200, kind: '320' }]))
    form.append('variant_320', new File([new Uint8Array([1, 2])], '320.webp', { type: 'image/webp' }))
    expect(parseUploadVariants(form, 'photo')).toMatchObject({ metadata: [{ key: 'photos/album_320.webp', width: 320, height: 200, kind: '320' }] })
  })

  it('rejects keys outside the upload prefix', () => {
    const form = new FormData()
    form.append('variants', JSON.stringify([{ key: 'misc/escape.webp', contentType: 'image/webp', width: 320, height: 200, kind: '320' }]))
    form.append('variant_320', new File([new Uint8Array([1])], '320.webp', { type: 'image/webp' }))
    expect(parseUploadVariants(form, 'photo')).toEqual({ error: '图片变体元数据无效' })
  })
})
