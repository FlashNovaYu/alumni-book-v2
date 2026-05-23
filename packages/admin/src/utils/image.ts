/**
 * 压缩并缩放图片，用于上传前预处理。
 * 原图通常 3-10MB，压缩后约 100-500KB，大幅提升加载速度。
 */
const SVG_TYPE = 'image/svg+xml'
const MAX_ORIG_SIZE = 500 * 1024

export async function compressImage(
  file: File,
  maxWidth = 1600,
  quality = 0.8
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === SVG_TYPE) return file

  return new Promise((resolve, _reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    // 防止 Promise 永远挂起
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

      // PNG 保持透明，其他格式转 JPEG
      const isPng = file.type === 'image/png'
      const outputType = isPng ? 'image/png' : 'image/jpeg'

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(file)

      const ratio = Math.min(1, maxWidth / img.width)
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)

      // PNG 需要透明背景
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
