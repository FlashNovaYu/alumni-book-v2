export interface CursorValue {
  timestamp: string
  id: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

export function encodeCursor(value: CursorValue): string {
  return bytesToBase64(encoder.encode(JSON.stringify(value)))
}

export function decodeCursor(raw: string | undefined): CursorValue | null {
  if (!raw || raw.length > 512) return null
  const bytes = base64ToBytes(raw)
  if (!bytes) return null

  try {
    const value = JSON.parse(decoder.decode(bytes))
    if (typeof value?.timestamp !== 'string' || typeof value?.id !== 'string' || !value.id) return null
    return { timestamp: value.timestamp, id: value.id }
  } catch {
    return null
  }
}
