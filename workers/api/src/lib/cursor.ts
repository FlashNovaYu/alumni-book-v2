export interface CursorValue {
  timestamp: string
  id: string
}

export interface SyncCursorValue {
  position: CursorValue
  boundary: CursorValue
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

function isCursorValue(value: any): value is CursorValue {
  return typeof value?.timestamp === 'string'
    && Number.isFinite(Date.parse(value.timestamp))
    && typeof value?.id === 'string'
    && Boolean(value.id)
}

function decodeValue(raw: string | undefined): any | null {
  if (!raw || raw.length > 512) return null
  const bytes = base64ToBytes(raw)
  if (!bytes) return null

  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    return null
  }
}

export function decodeCursor(raw: string | undefined): CursorValue | null {
  const value = decodeValue(raw)
  return isCursorValue(value) ? { timestamp: value.timestamp, id: value.id } : null
}

export function encodeSyncCursor(value: SyncCursorValue): string {
  return bytesToBase64(encoder.encode(JSON.stringify(value)))
}

function isAfter(left: CursorValue, right: CursorValue): boolean {
  return left.timestamp > right.timestamp || (left.timestamp === right.timestamp && left.id > right.id)
}

export function decodeSyncCursor(raw: string | undefined): { position: CursorValue; boundary?: CursorValue } | null {
  const value = decodeValue(raw)
  if (isCursorValue(value)) return { position: { timestamp: value.timestamp, id: value.id } }
  if (!isCursorValue(value?.position) || !isCursorValue(value?.boundary)) return null
  if (isAfter(value.position, value.boundary)) return null
  return {
    position: { timestamp: value.position.timestamp, id: value.position.id },
    boundary: { timestamp: value.boundary.timestamp, id: value.boundary.id },
  }
}
