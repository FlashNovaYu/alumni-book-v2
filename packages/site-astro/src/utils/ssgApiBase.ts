export function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getSsgApiBase(): string {
  const base = normalizeApiBase(import.meta.env.VITE_SSG_API_BASE || '')
  if (base) return base
  if (import.meta.env.MODE === 'test') return ''
  // 本地开发或缺省时使用阿里云 ECS API 作为默认回退地址
  return 'http://118.178.88.227'
}
