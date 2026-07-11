export type ImageFormat = {
  mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  extension: 'png' | 'jpg' | 'gif' | 'webp'
}

const PNG: ImageFormat = { mime: 'image/png', extension: 'png' }
const JPEG: ImageFormat = { mime: 'image/jpeg', extension: 'jpg' }
const GIF: ImageFormat = { mime: 'image/gif', extension: 'gif' }
const WEBP: ImageFormat = { mime: 'image/webp', extension: 'webp' }

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  return signature.every((value, index) => bytes[offset + index] === value)
}

export function detectImageFormat(contents: ArrayBuffer): ImageFormat | null {
  const bytes = new Uint8Array(contents)

  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return JPEG
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return GIF
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return GIF
  if (matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return WEBP

  return null
}

export function validateImageUpload(declaredMime: string, contents: ArrayBuffer): ImageFormat | null {
  const format = detectImageFormat(contents)

  return format?.mime === declaredMime ? format : null
}
