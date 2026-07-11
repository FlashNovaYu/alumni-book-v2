const LEGACY_WORKER_ORIGIN = 'https://alumni-book-api.chenyuhao2263.workers.dev'

export function normalizeFileUrl<T extends string | null | undefined>(value: T): T | string {
  if (typeof value !== 'string') return value

  const legacyPrefix = `${LEGACY_WORKER_ORIGIN}/api/files/`
  return value.startsWith(legacyPrefix)
    ? value.slice(LEGACY_WORKER_ORIGIN.length)
    : value
}
