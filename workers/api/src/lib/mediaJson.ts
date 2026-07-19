export type StoredMediaVariant = {
  key: string
  contentType: string
  width: number
  height: number
  kind: string
}

/** 读取旧数据兼容的变体元数据；损坏或空值只返回 null。 */
export function parseMediaVariants(raw: unknown): { variants: StoredMediaVariant[] } | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
    const variants = Array.isArray((value as any)?.variants)
      ? (value as any).variants.filter((variant: any) => (
        variant && typeof variant.key === 'string' && variant.key &&
        Number.isFinite(Number(variant.width)) && Number(variant.width) > 0 &&
        Number.isFinite(Number(variant.height)) && Number(variant.height) > 0
      )).map((variant: any) => ({
        key: String(variant.key),
        contentType: String(variant.contentType || 'application/octet-stream'),
        width: Number(variant.width),
        height: Number(variant.height),
        kind: String(variant.kind || ''),
      }))
      : []
    return variants.length ? { variants } : null
  } catch {
    return null
  }
}
