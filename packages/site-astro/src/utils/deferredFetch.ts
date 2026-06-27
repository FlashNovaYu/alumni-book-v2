export function runWhenIdle(task: () => void, timeout = 2500) {
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(task, { timeout })
  } else {
    window.setTimeout(task, timeout)
  }
}

/**
 * 极简深度比较，支持对象和数组对比
 */
export function isDeepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true

  if (
    typeof obj1 !== 'object' ||
    obj1 === null ||
    typeof obj2 !== 'object' ||
    obj2 === null
  ) {
    return false
  }

  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) return false

  for (const key of keys1) {
    if (!keys2.includes(key)) return false
    if (!isDeepEqual(obj1[key], obj2[key])) return false
  }

  return true
}

export async function fetchJsonIfChanged(url: string, etagKey: string, customHeaders: Record<string, string> = {}) {
  if (typeof window === 'undefined') {
    const res = await fetch(url, { headers: customHeaders })
    return { changed: true, data: await res.json() }
  }

  const headers: Record<string, string> = { ...customHeaders }
  const oldEtag = sessionStorage.getItem(`etag_${etagKey}`)
  const cachedData = sessionStorage.getItem(`data_${etagKey}`)

  if (oldEtag && cachedData) {
    headers['If-None-Match'] = oldEtag
  }

  try {
    const res = await fetch(url, { headers })
    if (res.status === 304 && cachedData) {
      return { changed: false, data: JSON.parse(cachedData) }
    }

    const newEtag = res.headers.get('ETag')
    const data = await res.json()

    if (newEtag) {
      sessionStorage.setItem(`etag_${etagKey}`, newEtag)
      sessionStorage.setItem(`data_${etagKey}`, JSON.stringify(data))
    }

    return { changed: true, data }
  } catch (e) {
    if (cachedData) {
      return { changed: false, data: JSON.parse(cachedData) }
    }
    throw e;
  }
}
