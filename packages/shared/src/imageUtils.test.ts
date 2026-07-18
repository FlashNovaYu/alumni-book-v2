import { afterEach, describe, expect, it } from 'vitest'
import { generateImageVariants } from './imageUtils'

const originalGlobals = {
  document: globalThis.document,
  createImageBitmap: globalThis.createImageBitmap,
}

afterEach(() => {
  Object.assign(globalThis, originalGlobals)
})

function installCanvas(toBlob: (callback: BlobCallback, type?: string) => void) {
  const canvases: Array<{ width: number; height: number }> = []
  Object.assign(globalThis, {
    document: {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => undefined }),
          toBlob: (callback: BlobCallback, type?: string) => toBlob(callback, type),
        }
        canvases.push(canvas)
        return canvas
      },
    },
  })
  return canvases
}

describe('generateImageVariants', () => {
  it('在 WebP 编码不可用时回退 JPEG，并释放每个 canvas', async () => {
    const canvases = installCanvas((callback, type) => callback(new Blob(['variant'], { type: type === 'image/webp' ? 'image/png' : 'image/jpeg' })))
    Object.assign(globalThis, {
      createImageBitmap: async () => ({ width: 640, height: 480, close: () => undefined }),
    })

    const result = await generateImageVariants(new File(['original'], 'photo.jpg', { type: 'image/jpeg' }), { widths: [320] })
    expect(result.map((item) => item.contentType)).toEqual(['image/jpeg', 'image/jpeg'])
    expect(canvases).toHaveLength(1)
    expect(canvases[0].width).toBe(1)
    expect(canvases[0].height).toBe(1)
  })

  it('取消时抛出 AbortError，并关闭已解码 bitmap 与 canvas 资源', async () => {
    const controller = new AbortController()
    let closed = 0
    const canvases = installCanvas((callback, type) => {
      controller.abort()
      callback(new Blob(['variant'], { type: type || 'image/webp' }))
    })
    Object.assign(globalThis, {
      createImageBitmap: async () => ({ width: 640, height: 480, close: () => { closed++ } }),
    })

    await expect(generateImageVariants(new File(['original'], 'photo.jpg', { type: 'image/jpeg' }), { widths: [320], signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(closed).toBe(1)
    expect(canvases[0].width).toBe(1)
    expect(canvases[0].height).toBe(1)
  })
})
