export function normalizeApiBase(apiBase?: string): string {
  return (apiBase || '').replace(/\/$/, '')
}

export function joinApiUrl(apiBase: string, path: string): string {
  const base = normalizeApiBase(apiBase)
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
