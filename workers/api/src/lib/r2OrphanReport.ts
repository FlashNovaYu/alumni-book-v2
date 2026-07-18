export type R2OrphanReport = {
  objectCount: number
  referencedCount: number
  orphanCount: number
  orphanKeys: string[]
}

function toR2Key(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.trim()
  const marker = '/api/files/'
  return normalized.includes(marker)
    ? normalized.slice(normalized.indexOf(marker) + marker.length)
    : normalized.replace(/^\/+/, '')
}

/** 纯计算只读报告；不会调用任何 R2 写入或删除 API。 */
export function buildR2OrphanReport(references: unknown[], objects: string[]): R2OrphanReport {
  const referencedKeys = new Set(
    references.map(toR2Key).filter((key): key is string => Boolean(key)),
  )
  const objectKeys = [...new Set(objects.filter(Boolean))]
  const orphanKeys = objectKeys.filter((key) => !referencedKeys.has(key)).sort()

  return {
    objectCount: objectKeys.length,
    referencedCount: referencedKeys.size,
    orphanCount: orphanKeys.length,
    orphanKeys,
  }
}

/** 使用只读 D1 查询和 R2.list 分页生成孤儿报告。 */
export async function scanR2Orphans(db: D1Database, r2: R2Bucket, prefix = ''): Promise<R2OrphanReport> {
  const [students, albums, photos, timeline] = await db.batch([
    db.prepare('SELECT avatar_url, music_url, background_url FROM students'),
    db.prepare('SELECT cover_r2_key FROM albums'),
    db.prepare('SELECT r2_key FROM photos'),
    db.prepare('SELECT photo_r2_key FROM timeline_events'),
  ])
  const referenceValues = [
    ...(students.results || []).flatMap((row: any) => [row.avatar_url, row.music_url, row.background_url]),
    ...(albums.results || []).map((row: any) => row.cover_r2_key),
    ...(photos.results || []).map((row: any) => row.r2_key),
    ...(timeline.results || []).map((row: any) => row.photo_r2_key),
  ]
  const references = referenceValues
    .map(toR2Key)
    .filter((key): key is string => Boolean(key))
    .filter((key) => !prefix || key.startsWith(prefix))

  const objects: string[] = []
  let cursor: string | undefined
  do {
    const page = await r2.list({ prefix: prefix || undefined, cursor, limit: 1000 })
    objects.push(...page.objects.map((object) => object.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return buildR2OrphanReport(references, objects)
}
