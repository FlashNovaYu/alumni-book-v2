export interface CursorValue {
  timestamp: string
  id: string
}

export interface SyncCursorValue {
  position: CursorValue
  boundary: CursorValue
}

type DecodedSyncCursor = { position: CursorValue; boundary?: CursorValue }

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

export function parseCursorTimestamp(value: string): number {
  const sqliteUtc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
  return Date.parse(sqliteUtc ? `${value.replace(' ', 'T')}Z` : value)
}

function isCursorValue(value: any): value is CursorValue {
  return typeof value?.timestamp === 'string'
    && Number.isFinite(parseCursorTimestamp(value.timestamp))
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

export function compareCursorValues(left: CursorValue, right: CursorValue): number {
  const timestampDifference = parseCursorTimestamp(left.timestamp) - parseCursorTimestamp(right.timestamp)
  if (timestampDifference !== 0) return timestampDifference
  return left.id.localeCompare(right.id)
}

function normalizeSyncCursor(value: SyncCursorValue | CursorValue, allowReversed = false): DecodedSyncCursor | null {
  if (isCursorValue(value)) return { position: { timestamp: value.timestamp, id: value.id } }
  const position = (value as SyncCursorValue)?.position
  const boundary = (value as SyncCursorValue)?.boundary
  if (!isCursorValue(position) || (boundary !== undefined && !isCursorValue(boundary))) return null
  if (boundary && !allowReversed && compareCursorValues(position, boundary) > 0) return null
  return {
    position: { timestamp: position.timestamp, id: position.id },
    ...(boundary ? { boundary: { timestamp: boundary.timestamp, id: boundary.id } } : {}),
  }
}

async function signSyncCursor(payload: string, secret: string, slug: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`group-chat-sync-cursor:${slug}:${payload}`))
  return bytesToBase64(new Uint8Array(signature))
}

export async function encodeSyncCursor(value: SyncCursorValue | CursorValue, secret: string, slug: string): Promise<string> {
  const cursor = normalizeSyncCursor(value, true)
  if (!cursor) throw new Error('同步游标无效')
  const payload = bytesToBase64(encoder.encode(JSON.stringify({ cursor })))
  const signature = await signSyncCursor(payload, secret, slug)
  return `${payload}.${signature}`
}

export async function decodeSyncCursor(raw: string | undefined, secret: string, slug: string): Promise<DecodedSyncCursor | null> {
  if (!raw || raw.length > 512) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature || raw.split('.').length !== 2) return null
  const expected = await signSyncCursor(payload, secret, slug)
  if (signature !== expected) return null
  const value = decodeValue(payload)
  return normalizeSyncCursor(value?.cursor)
}
