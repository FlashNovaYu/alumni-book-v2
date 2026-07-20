export function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getSsgApiBase(): string {
  const base = normalizeApiBase(import.meta.env.VITE_SSG_API_BASE || '')
  if (!base && import.meta.env.MODE !== 'test') {
    throw new Error('缺少 VITE_SSG_API_BASE；请显式指定阿里云或 Cloudflare 开发 API 地址')
  }
  return base
}
