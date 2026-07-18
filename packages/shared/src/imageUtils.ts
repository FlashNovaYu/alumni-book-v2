/**
 * 前端 Canvas 缩略图生成工具
 * 将图片文件缩放为指定宽度的缩略图
 */
export function createThumbnail(file: File, maxWidth = 200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = maxWidth / img.width
      const canvas = document.createElement('canvas')
      canvas.width = maxWidth
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      }, file.type, quality)
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = url
  })
}

export interface GeneratedImageVariant {
  kind: 'original' | '128' | '256' | '320' | '960'
  blob: Blob
  width: number
  height: number
  contentType: string
}

export interface ImageVariantOptions {
  signal?: AbortSignal
  widths?: number[]
  quality?: number
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('图片处理已取消', 'AbortError')
}

async function decodeImage(file: File, signal?: AbortSignal): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; revoke?: () => void }> {
  throwIfAborted(signal)
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    throwIfAborted(signal)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Image load failed'))
      element.src = url
    })
    throwIfAborted(signal)
    return { source: image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height, revoke: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number | undefined, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, type, quality)
  })
}

/** Generate immutable responsive image derivatives in the browser. */
export async function generateImageVariants(file: File, options: ImageVariantOptions = {}): Promise<GeneratedImageVariant[]> {
  if (!file.type.startsWith('image/') || file.type === SVG_TYPE) {
    return [{ kind: 'original', blob: file, width: 0, height: 0, contentType: file.type || 'application/octet-stream' }]
  }
  const widths = (options.widths || [128, 256, 320, 960]).filter((value) => Number.isFinite(value) && value > 0)
  const quality = options.quality ?? 0.82
  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null
  try {
    decoded = await decodeImage(file, options.signal)
    const output: GeneratedImageVariant[] = [{ kind: 'original', blob: file, width: decoded.width, height: decoded.height, contentType: file.type }]
    for (const width of widths) {
      throwIfAborted(options.signal)
      const ratio = Math.min(1, width / decoded.width)
      const targetWidth = Math.max(1, Math.round(decoded.width * ratio))
      const targetHeight = Math.max(1, Math.round(decoded.height * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const context = canvas.getContext('2d')
      if (!context) continue
      context.drawImage(decoded.source, 0, 0, targetWidth, targetHeight)
      let blob: Blob
      let contentType = 'image/webp'
      try {
        blob = await canvasBlob(canvas, contentType, quality, options.signal)
        if (blob.type && blob.type !== 'image/webp') throw new Error('WebP 编码不可用')
      } catch {
        contentType = 'image/jpeg'
        blob = await canvasBlob(canvas, contentType, quality, options.signal)
      }
      output.push({ kind: String(width) as GeneratedImageVariant['kind'], blob, width: targetWidth, height: targetHeight, contentType })
      canvas.width = 1
      canvas.height = 1
    }
    return output
  } catch {
    if (options.signal?.aborted) throw new DOMException('图片处理已取消', 'AbortError')
    return [{ kind: 'original', blob: file, width: decoded?.width || 0, height: decoded?.height || 0, contentType: file.type }]
  } finally {
    const source = decoded?.source
    if (source && 'close' in source && typeof source.close === 'function') source.close()
    decoded?.revoke?.()
  }
}

const SVG_TYPE = 'image/svg+xml'
const MAX_ORIG_SIZE = 500 * 1024

/** 压缩并缩放图片，用于上传前预处理 */
export async function compressImage(
  file: File,
  maxWidth = 1600,
  quality = 0.8
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === SVG_TYPE) return file

  return new Promise((resolve, _reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }, 30000)

    img.onload = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(objectUrl)

      if (img.width <= maxWidth && file.size < MAX_ORIG_SIZE) {
        return resolve(file)
      }

      const isPng = file.type === 'image/png'
      const outputType = isPng ? 'image/png' : 'image/jpeg'

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(file)

      const ratio = Math.min(1, maxWidth / img.width)
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)

      if (isPng) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file)
          const compressed = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          })
          resolve(compressed)
        },
        outputType,
        isPng ? undefined : quality
      )
    }

    img.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    img.src = objectUrl
  })
}
