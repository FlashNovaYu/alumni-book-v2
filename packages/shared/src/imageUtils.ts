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
