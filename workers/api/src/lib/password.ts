// workers/api/src/lib/password.ts
// CCSwitch: 统一 PBKDF2 哈希与校验，供管理员后台和同学账号系统共享。

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltStr = btoa(String.fromCharCode(...salt))
  return `pbkdf2:${saltStr}:${hash}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false
  if (storedHash.startsWith('pbkdf2:')) {
    const [, saltStr, hash] = storedHash.split(':')
    const encoder = new TextEncoder()
    const salt = Uint8Array.from(atob(saltStr), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
    const computedHash = btoa(String.fromCharCode(...new Uint8Array(bits)))
    return computedHash === hash
  }
  // 兼容旧版 SHA-256 无盐格式
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(password))
  const computedHash = btoa(String.fromCharCode(...new Uint8Array(hash)))
  return computedHash === storedHash
}
