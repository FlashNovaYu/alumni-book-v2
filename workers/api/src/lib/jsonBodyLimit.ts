import { HTTPException } from 'hono/http-exception'

const MAX_JSON_BODY_BYTES = 16 * 1024

export type LimitedJsonResult =
  | { status: 'ok'; value: unknown }
  | { status: 'invalid' }
  | { status: 'too-large' }

export async function readLimitedJson(request: Request): Promise<LimitedJsonResult> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    await request.body?.cancel().catch(() => undefined)
    return { status: 'too-large' }
  }

  if (!request.body) return { status: 'invalid' }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { status: 'too-large' }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return { status: 'ok', value: JSON.parse(text) }
  } catch {
    await reader.cancel().catch(() => undefined)
    return { status: 'invalid' }
  }
}

type JsonContext = {
  req: { raw: Request }
  json: (body: unknown, status?: any) => Response
}

type ParseLimitedJsonOptions<T> = {
  fallback?: T
  invalidMessage?: string
  tooLargeMessage?: string
}

/** Parse a JSON route body once, with a streaming limit and consistent JSON errors. */
export async function parseLimitedJson<T = any>(
  c: JsonContext,
  options: ParseLimitedJsonOptions<T> = {},
): Promise<T> {
  const result = await readLimitedJson(c.req.raw)
  if (result.status === 'ok') return result.value as T
  if (result.status === 'invalid' && Object.prototype.hasOwnProperty.call(options, 'fallback')) {
    return options.fallback as T
  }
  const tooLarge = result.status === 'too-large'
  const status = tooLarge ? 413 : 400
  const message = tooLarge
    ? options.tooLargeMessage || 'JSON 请求体超过 16KiB 限制'
    : options.invalidMessage || '无效的 JSON 请求体'
  throw new HTTPException(status, {
    res: c.json({ success: false, message }, status),
  })
}
