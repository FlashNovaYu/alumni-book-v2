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

export function appendImageVariants(formData: FormData, variants: GeneratedImageVariant[], prefix: string, target: string) {
  const metadata = variants.filter((variant) => variant.kind !== 'original').map((variant) => {
    const extension = variant.contentType === 'image/webp' ? 'webp' : 'jpg'
    const key = `${prefix}/${target}_${Date.now()}_${crypto.randomUUID()}_${variant.kind}.${extension}`
    formData.append(`variant_${variant.kind}`, new File([variant.blob], `${variant.kind}.${extension}`, { type: variant.contentType }))
    return { key, contentType: variant.contentType, width: variant.width, height: variant.height, kind: variant.kind }
  })
  if (metadata.length) formData.append('variants', JSON.stringify(metadata))
  return metadata
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('图片处理已取消', 'AbortError')
}

async function decodeImage(file: File, signal?: AbortSignal): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; revoke?: () => void }> {
  throwIfAborted(signal)
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    try { throwIfAborted(signal) } catch (error) { bitmap.close(); throw error }
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

export interface SquareCrop {
  x: number
  y: number
  size: number
}

/** Crop a source image to a square file suitable for avatar uploads. */
export async function cropImageToSquare(file: File, crop: SquareCrop, outputSize = 512): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === SVG_TYPE || file.type === 'image/gif') {
    throw new Error('该图片暂不支持裁切，请选择 JPG、PNG 或 WebP')
  }
  if (![crop.x, crop.y, crop.size, outputSize].every(Number.isFinite) || crop.size <= 0 || outputSize <= 0) {
    throw new Error('头像裁切范围无效')
  }

  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null
  const canvas = document.createElement('canvas')
  try {
    decoded = await decodeImage(file)
    const size = Math.min(crop.size, decoded.width, decoded.height)
    const x = Math.min(Math.max(0, crop.x), decoded.width - size)
    const y = Math.min(Math.max(0, crop.y), decoded.height - size)
    const targetSize = Math.max(1, Math.round(outputSize))
    canvas.width = targetSize
    canvas.height = targetSize
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法处理头像图片')
    context.drawImage(decoded.source, x, y, size, size, 0, 0, targetSize, targetSize)

    const contentType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await canvasBlob(canvas, contentType, contentType === 'image/png' ? undefined : 0.9)
    const extension = contentType === 'image/png' ? 'png' : 'jpg'
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar'
    return new File([blob], `${baseName}-cropped.${extension}`, {
      type: contentType,
      lastModified: Date.now(),
    })
  } finally {
    canvas.width = 1
    canvas.height = 1
    const source = decoded?.source
    if (source && 'close' in source && typeof source.close === 'function') source.close()
    decoded?.revoke?.()
  }
}

/** Generate immutable responsive image derivatives in the browser. */
export async function generateImageVariants(file: File, options: ImageVariantOptions = {}): Promise<GeneratedImageVariant[]> {
  if (!file.type.startsWith('image/') || file.type === SVG_TYPE || file.type === 'image/gif') {
    return [{ kind: 'original', blob: file, width: 0, height: 0, contentType: file.type || 'application/octet-stream' }]
  }
  const widths = [...new Set(options.widths || [128, 256, 320, 960])].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
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
      if (!context) { canvas.width = 1; canvas.height = 1; continue }
      context.drawImage(decoded.source, 0, 0, targetWidth, targetHeight)
      try {
        let blob: Blob
        let contentType = 'image/webp'
        try {
          blob = await canvasBlob(canvas, contentType, quality, options.signal)
          throwIfAborted(options.signal)
          if (blob.type && blob.type !== 'image/webp') throw new Error('WebP 编码不可用')
        } catch {
          throwIfAborted(options.signal)
          contentType = 'image/jpeg'
          blob = await canvasBlob(canvas, contentType, quality, options.signal)
          throwIfAborted(options.signal)
        }
        output.push({ kind: String(width) as GeneratedImageVariant['kind'], blob, width: targetWidth, height: targetHeight, contentType })
      } finally {
        canvas.width = 1
        canvas.height = 1
      }
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
  // GIF 动画不能通过单帧 Canvas 重编码，否则会丢失动画帧。
  if (file.type === 'image/gif') return file

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
      const outputTypes = isPng ? ['image/webp', 'image/png'] : ['image/webp', 'image/jpeg']

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

      let outputIndex = 0
      const tryEncode = () => {
        const outputType = outputTypes[outputIndex++]
        if (!outputType) {
          canvas.width = 1
          canvas.height = 1
          return resolve(file)
        }

        canvas.toBlob((blob) => {
          const validType = blob && (blob.type === outputType || (outputType === 'image/jpeg' && blob.type === 'image/jpg'))
          if (validType && blob.size < file.size) {
            canvas.width = 1
            canvas.height = 1
            return resolve(new File([blob], file.name, {
              type: outputType === 'image/jpg' ? 'image/jpeg' : outputType,
              lastModified: Date.now(),
            }))
          }
          tryEncode()
        }, outputType, outputType === 'image/png' ? undefined : quality)
      }

      tryEncode()
    }

    img.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    img.src = objectUrl
  })
}
