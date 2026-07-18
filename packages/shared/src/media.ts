import type { MediaAsset, MediaVariant } from './types'

function toUrl(source: string, key: string): string {
  if (/^(?:https?:)?\/\//.test(key) || key.startsWith('/')) return key
  const marker = '/api/files/'
  const index = source.indexOf(marker)
  if (index >= 0) return `${source.slice(0, index + marker.length)}${key.replace(/^\/+/, '')}`
  return key
}

/** Build responsive image attributes while retaining compatibility with a bare R2 key. */
export function buildMediaSources(
  src: string | null | undefined,
  variants: MediaVariant[] | null | undefined = [],
  width?: number,
  height?: number,
): MediaAsset {
  const original = String(src || '')
  const valid = (variants || [])
    .filter((variant) => variant && Number.isFinite(variant.width) && variant.width > 0 && variant.key)
    .slice()
    .sort((a, b) => a.width - b.width)
  const srcset = valid.map((variant) => `${toUrl(original, variant.key)} ${variant.width}w`).join(', ')
  const smallest = valid[0]
  return {
    src: smallest ? toUrl(original, smallest.key) : toUrl(original, original),
    srcset,
    sizes: width && width > 0 ? `${Math.round(width)}px` : '100vw',
    width: width || smallest?.width,
    height: height || (smallest?.height || undefined),
    variants: valid.length ? valid : undefined,
  }
}
