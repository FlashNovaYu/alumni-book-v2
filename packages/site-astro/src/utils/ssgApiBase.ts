export function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getSsgApiBase(): string {
  const base = normalizeApiBase(import.meta.env.VITE_SSG_API_BASE || 'http://118.178.88.227')
  return base
}
