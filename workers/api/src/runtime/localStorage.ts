import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path'

export type LocalStorageOptions = {
  httpMetadata?: {
    contentType?: string
  }
}

export type LocalStorageRange = {
  offset: number
  length: number
} | {
  suffix: number
}

export type LocalStorageObject = {
  body?: ReadableStream<Uint8Array>
  size: number
  httpEtag: string
  httpMetadata?: { contentType?: string }
  range?: LocalStorageRange
  writeHttpMetadata(headers: Headers): void
}

export type LocalStorage = {
  put(key: string, body: ArrayBuffer | ArrayBufferView | Blob | ReadableStream<Uint8Array> | string, options?: LocalStorageOptions): Promise<void>
  get(key: string, options?: { range?: Headers }): Promise<LocalStorageObject | null>
  head(key: string): Promise<LocalStorageObject | null>
  delete(key: string): Promise<void>
  list(prefixOrOptions?: string | { prefix?: string; limit?: number }): Promise<{ objects: Array<{ key: string; size: number; httpEtag: string }> }>
  close(): void
}

type FileMetadata = {
  contentType: string
}

function streamFromBuffer(value: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(value))
      controller.close()
    },
  })
}

async function toBuffer(body: ArrayBuffer | ArrayBufferView | Blob | ReadableStream<Uint8Array> | string): Promise<Buffer> {
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  return Buffer.from(await new Response(body).arrayBuffer())
}

function parseRange(headers: Headers | undefined, size: number): { offset: number; length: number } | null {
  const value = headers?.get('range')
  if (!value || !value.startsWith('bytes=') || value.includes(',')) return null
  const [startText, endText] = value.slice('bytes='.length).split('-', 2)
  if (!startText && !endText) return null
  if (!startText) {
    const suffix = Number(endText)
    if (!Number.isInteger(suffix) || suffix <= 0) return null
    return { offset: Math.max(size - suffix, 0), length: Math.min(suffix, size) }
  }
  const offset = Number(startText)
  const end = endText ? Number(endText) : size - 1
  if (!Number.isInteger(offset) || !Number.isInteger(end) || offset < 0 || end < offset || offset >= size) return null
  return { offset, length: Math.min(end, size - 1) - offset + 1 }
}

function etagFor(buffer: Buffer): string {
  return `"${createHash('sha256').update(buffer).digest('hex')}"`
}

function metadataHeaders(metadata: FileMetadata) {
  return { contentType: metadata.contentType || 'application/octet-stream' }
}

export function createLocalStorage(root: string): LocalStorage {
  const rootPath = resolve(root)

  function safePath(key: string): { normalized: string; filePath: string; metadataPath: string } {
    const normalized = posix.normalize(String(key || '').replaceAll('\\', '/'))
    if (!key || isAbsolute(key) || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.includes('\0')) {
      throw new Error('文件 key 无效')
    }
    const filePath = resolve(rootPath, ...normalized.split('/'))
    const rel = relative(rootPath, filePath)
    if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('文件 key 越界')
    return { normalized, filePath, metadataPath: `${filePath}.meta.json` }
  }

  async function load(key: string, includeBody: boolean, rangeHeaders?: Headers): Promise<LocalStorageObject | null> {
    const paths = safePath(key)
    let buffer: Buffer
    let metadata: FileMetadata
    try {
      buffer = await readFile(paths.filePath)
      metadata = JSON.parse(await readFile(paths.metadataPath, 'utf8')) as FileMetadata
    } catch {
      return null
    }
    const range = rangeHeaders ? parseRange(rangeHeaders, buffer.length) : null
    const bodyBuffer = range ? buffer.subarray(range.offset, range.offset + range.length) : buffer
    const object: LocalStorageObject = {
      size: buffer.length,
      httpEtag: etagFor(buffer),
      httpMetadata: metadataHeaders(metadata),
      ...(includeBody ? { body: streamFromBuffer(bodyBuffer) } : {}),
      ...(range ? { range } : rangeHeaders ? { range: undefined } : {}),
      writeHttpMetadata(headers) {
        headers.set('Content-Type', metadata.contentType || 'application/octet-stream')
      },
    }
    return object
  }

  return {
    async put(key, body, options = {}) {
      const paths = safePath(key)
      const content = await toBuffer(body)
      const metadata: FileMetadata = { contentType: options.httpMetadata?.contentType || 'application/octet-stream' }
      await mkdir(dirname(paths.filePath), { recursive: true })
      const temporaryPath = `${paths.filePath}.${randomUUID()}.tmp`
      await writeFile(temporaryPath, content)
      await rename(temporaryPath, paths.filePath)
      await writeFile(paths.metadataPath, JSON.stringify(metadata), 'utf8')
    },
    async get(key, options) {
      return load(key, true, options?.range)
    },
    async head(key) {
      return load(key, false)
    },
    async delete(key) {
      const paths = safePath(key)
      await Promise.all([
        rm(paths.filePath, { force: true }),
        rm(paths.metadataPath, { force: true }),
      ])
    },
    async list(prefixOrOptions = '') {
      const prefix = typeof prefixOrOptions === 'string' ? prefixOrOptions : (prefixOrOptions.prefix || '')
      const start = prefix ? safePath(prefix).filePath : rootPath
      const objects: Array<{ key: string; size: number; httpEtag: string }> = []
      async function visit(directory: string) {
        let entries
        try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
        for (const entry of entries) {
          const path = resolve(directory, entry.name)
          if (entry.isDirectory()) await visit(path)
          if (!entry.isFile() || entry.name.endsWith('.meta.json')) continue
          const buffer = await readFile(path)
          objects.push({ key: relative(rootPath, path).split(sep).join('/'), size: buffer.length, httpEtag: etagFor(buffer) })
        }
      }
      await visit(start)
      return { objects }
    },
    close() {
      // 本地文件存储没有需要关闭的长期句柄。
    },
  }
}
