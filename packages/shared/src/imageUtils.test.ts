import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendImageVariants, cropImageToSquare, generateImageVariants } from './imageUtils'

const originalGlobals = {
  document: globalThis.document,
  createImageBitmap: globalThis.createImageBitmap,
}

afterEach(() => {
  Object.assign(globalThis, originalGlobals)
  vi.unstubAllGlobals()
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

describe('appendImageVariants', () => {
  it('randomUUID 不可用时使用 getRandomValues 生成变体文件标识', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.set(Array.from({ length: values.length }, (_, index) => index))
        return values
      },
    })
    const formData = new FormData()

    const metadata = appendImageVariants(formData, [{
      kind: '128',
      blob: new Blob(['avatar'], { type: 'image/webp' }),
      width: 128,
      height: 128,
      contentType: 'image/webp',
    }], 'avatars', 'student')

    expect(metadata[0].key).toMatch(/^avatars\/student_\d+_00010203-0405-4607-8809-0a0b0c0d0e0f_128\.webp$/)
    expect(formData.get('variant_128')).toBeInstanceOf(File)
  })
})

describe('generateImageVariants', () => {
  it('GIF 仅保留原文件，避免把动画降成单帧变体', async () => {
    const gif = new File(['gif'], 'animated.gif', { type: 'image/gif' })
    const result = await generateImageVariants(gif)
    expect(result).toEqual([{ kind: 'original', blob: gif, width: 0, height: 0, contentType: 'image/gif' }])
  })

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

describe('cropImageToSquare', () => {
  it('按源图裁切矩形生成 512 像素头像并释放临时资源', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback, type?: string) => callback(new Blob(['cropped'], { type: type || 'image/jpeg' })),
    }
    vi.stubGlobal('document', { createElement: () => canvas })
    vi.stubGlobal('Image', class {
      width = 1200
      height = 800
      naturalWidth = 1200
      naturalHeight = 800
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const source = new File(['photo'], 'portrait.jpg', { type: 'image/jpeg', lastModified: 123 })

    const result = await cropImageToSquare(source, { x: 200, y: 0, size: 800 })

    expect(createObjectURL).toHaveBeenCalledWith(source)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 200, 0, 800, 800, 0, 0, 512, 512)
    expect(result).toBeInstanceOf(File)
    expect(result.name).toBe('portrait-cropped.jpg')
    expect(result.type).toBe('image/jpeg')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar')
    expect(canvas.width).toBe(1)
    expect(canvas.height).toBe(1)
  })
})

describe('compressImage', () => {
  function installImage(width = 1200, height = 800) {
    vi.stubGlobal('Image', class {
      width = width
      height = height
      naturalWidth = width
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  }

  function installCompressionCanvas(blobs: Record<string, Blob | null>) {
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined, clearRect: () => undefined }),
        toBlob: (callback: BlobCallback, type?: string) => callback(blobs[type || ''] ?? null),
      }),
    })
  }

  it('优先采用更小的 WebP，并同步更新 MIME 类型', async () => {
    installImage()
    installCompressionCanvas({ 'image/webp': new Blob(['small'], { type: 'image/webp' }) })
    const input = new File([new Uint8Array(600_000)], 'avatar.png', { type: 'image/png' })

    const result = await (await import('./imageUtils')).compressImage(input, 800, 0.82)

    expect(result.type).toBe('image/webp')
    expect(result.size).toBeLessThan(input.size)
  })

  it('WebP 不可用时回退到更小的 PNG，输出更大时保留原文件', async () => {
    installImage()
    installCompressionCanvas({
      'image/webp': new Blob(['unsupported'], { type: 'image/png' }),
      'image/png': new Blob(['png'], { type: 'image/png' }),
    })
    const input = new File([new Uint8Array(600_000)], 'avatar.png', { type: 'image/png' })
    const result = await (await import('./imageUtils')).compressImage(input, 800, 0.82)
    expect(result.type).toBe('image/png')
    expect(result.size).toBeLessThan(input.size)

    installCompressionCanvas({ 'image/webp': new Blob([new Uint8Array(700_000)], { type: 'image/webp' }) })
    const unchanged = await (await import('./imageUtils')).compressImage(input, 800, 0.82)
    expect(unchanged).toBe(input)
  })

  it('GIF、SVG 和小文件保持原文件', async () => {
    const gif = new File(['gif'], 'animated.gif', { type: 'image/gif' })
    const svg = new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' })
    const small = new File(['small'], 'small.jpg', { type: 'image/jpeg' })
    installImage(320, 240)
    expect((await (await import('./imageUtils')).compressImage(gif)).type).toBe('image/gif')
    expect(await (await import('./imageUtils')).compressImage(svg)).toBe(svg)
    expect(await (await import('./imageUtils')).compressImage(small)).toBe(small)
  })
})
