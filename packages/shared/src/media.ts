import type { MediaAsset, MediaVariant } from './types'

export function resolveMediaUrl(source: string, key: string): string {
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
  const srcset = valid.map((variant) => `${resolveMediaUrl(original, variant.key)} ${variant.width}w`).join(', ')
  let selectedVariant: MediaVariant | undefined
  if (valid.length > 0) {
    if (width && width > 0) {
      selectedVariant = valid.find((v) => v.width >= width) || valid[valid.length - 1]
    } else {
      selectedVariant = valid[valid.length - 1]
    }
  }
  const chosenUrl = selectedVariant ? resolveMediaUrl(original, selectedVariant.key) : resolveMediaUrl(original, original)
  return {
    src: chosenUrl,
    srcset,
    sizes: width && width > 0 ? `${Math.round(width)}px` : '100vw',
    width: width || selectedVariant?.width,
    height: height || (selectedVariant?.height || undefined),
    variants: valid.length ? valid : undefined,
  }
}
