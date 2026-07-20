const LEGACY_FILE_URL = /^https:\/\/(?:alumni-book-api\.chenyuhao2263\.workers\.dev|alumni-book\.pages\.dev)(?=\/api\/files\/)/

export function normalizeFileUrl<T extends string | null | undefined>(value: T): T | string {
  if (typeof value !== 'string') return value

  return value.replace(LEGACY_FILE_URL, '')
}

export function normalizeLegacyFileUrls<T>(value: T): T {
  if (typeof value === 'string') return normalizeFileUrl(value) as T
  if (Array.isArray(value)) return value.map(normalizeLegacyFileUrls) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeLegacyFileUrls(child)]),
    ) as T
  }
  return value
}
