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
