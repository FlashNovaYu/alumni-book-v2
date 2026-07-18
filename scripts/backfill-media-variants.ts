/**
 * 从本地 D1 JSON 导出和图片目录生成响应式图片变体。
 * 默认只输出计划；--execute 会在本地 Wrangler D1/R2 上执行，--remote 才写远程资源。
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const argv = process.argv.slice(2)
const value = (name: string, fallback = '') => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback
const input = value('input')
const output = value('output', 'media-backfill-plan.json')
const assetsDir = value('assets-dir')
const batchSize = Math.max(1, Number(value('batch', '25')))
const retries = Math.max(0, Number(value('retries', '3')))
const dryRun = !argv.includes('--execute') || argv.includes('--dry-run')
const remote = argv.includes('--remote')
const bucket = value('bucket', 'alumni-book-assets')
const database = value('database', 'alumni-book-db')
const wranglerConfig = value('config', 'workers/api/wrangler.toml')
if (!input) { console.error('必须指定本地导出文件：--input=media-export.json'); process.exit(1) }

type Row = {
  id?: string; slug?: string; r2Key?: string; r2_key?: string
  avatarUrl?: string; avatar_url?: string; backgroundUrl?: string; background_url?: string
  media?: any; media_json?: string; info?: any; localPath?: string; filePath?: string; path?: string; file?: string
  width?: number; height?: number; url?: string; photos?: Array<string | Row>
}
type PlanItem = { owner: string; asset: 'avatar' | 'background' | 'photo'; originalKey: string; variants: string[]; sourcePath?: string; width?: number; height?: number; legacyOnly?: boolean }
type ExportData = { students?: Row[]; photos?: Row[]; files?: Record<string, string> }

const fileKey = (url: string) => {
  const marker = '/api/files/'
  const index = url.indexOf(marker)
  return index >= 0 ? url.slice(index + marker.length) : url.replace(/^\/+/, '')
}
const variantKeys = (key: string, ext = 'webp') => {
  const stem = key.replace(/\.[^.]+$/, '')
  return [128, 256, 320, 960].map((width) => `${stem}_${width}.${ext}`)
}
function mediaOf(row: Row) { try { return row.media || JSON.parse(row.media_json || '{}') } catch { return {} } }
function legacyPhotosOf(row: Row): Array<string | Row> {
  if (Array.isArray(row.photos)) return row.photos
  try {
    const info = typeof row.info === 'string' ? JSON.parse(row.info) : row.info
    return Array.isArray(info?.photos) ? info.photos : []
  } catch { return [] }
}
function sourcePath(row: Row, key: string, data: ExportData) {
  const local = row.localPath || row.filePath || row.path || row.file || data.files?.[key] || data.files?.[fileKey(key)]
  if (local) return resolve(local)
  return assetsDir ? resolve(assetsDir, basename(key)) : undefined
}

async function retry<T>(task: () => Promise<T>, label: string): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await task() } catch (error) {
      last = error
      if (attempt < retries) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250 * (attempt + 1)))
    }
  }
  throw new Error(`${label} 失败（重试 ${retries} 次）：${String(last)}`)
}

async function runWrangler(args: string[]) {
  const target = remote ? '--remote' : '--local'
  await execFileAsync('pnpm.cmd', ['--filter', 'worker', 'exec', 'wrangler', ...args, '--config', wranglerConfig, target], { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 })
}

async function encodeVariant(source: string, outputPath: string, width: number, type: 'webp' | 'jpeg') {
  await mkdir(dirname(outputPath), { recursive: true })
  const codec = type === 'webp' ? ['-c:v', 'libwebp', '-q:v', '82'] : ['-c:v', 'mjpeg', '-q:v', '5']
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-vf', `scale='min(${width},iw)':-2`, ...codec, outputPath], { maxBuffer: 2 * 1024 * 1024 })
}

async function executeItem(item: PlanItem, data: ExportData) {
  if (!item.sourcePath) throw new Error(`缺少本地图片：${item.originalKey}（请提供 --assets-dir 或 files/localPath）`)
  const tempDir = resolve('.tmp/media-backfill', `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const variants: Array<{ key: string; contentType: string; width: number; height: number; kind: string; path: string }> = []
  const uploadedKeys: string[] = []
  try {
    for (const width of [128, 256, 320, 960]) {
      const kind = String(width)
      const webpPath = join(tempDir, `${kind}.webp`)
      let contentType = 'image/webp'
      let extension = 'webp'
      try { await encodeVariant(item.sourcePath, webpPath, width, 'webp') } catch {
        extension = 'jpg'; contentType = 'image/jpeg'
        await encodeVariant(item.sourcePath, join(tempDir, `${kind}.jpg`), width, 'jpeg')
      }
      const path = join(tempDir, `${kind}.${extension}`)
      const key = variantKeys(item.originalKey, extension)[[128, 256, 320, 960].indexOf(width)]
      const maxWidth = item.width && item.width > 0 ? Math.min(width, item.width) : width
      variants.push({ key, contentType, width: maxWidth, height: item.height ? Math.max(1, Math.round(item.height * maxWidth / (item.width || width))) : 0, kind, path })
    }
    for (const variant of variants) {
      await retry(() => runWrangler(['r2', 'object', 'put', `${bucket}/${variant.key}`, '--file', variant.path, '--content-type', variant.contentType]), `上传 ${variant.key}`)
      uploadedKeys.push(variant.key)
    }
    const media = item.asset === 'photo' ? { variants: variants.map(({ key, contentType, width, height, kind }) => ({ key, contentType, width, height, kind })) } : (() => {
      const row = (data.students || []).find((candidate) => String(candidate.slug || candidate.id) === item.owner)
      const current = mediaOf(row || {})
      current[item.asset] = { variants: variants.map(({ key, contentType, width, height, kind }) => ({ key, contentType, width, height, kind })) }
      return current
    })()
    const sql = item.asset === 'photo'
      ? `UPDATE photos SET media_json = '${JSON.stringify(media).replace(/'/g, "''")}' WHERE id = '${item.owner.replace(/'/g, "''")}'`
      : `UPDATE students SET media_json = '${JSON.stringify(media).replace(/'/g, "''")}' WHERE slug = '${item.owner.replace(/'/g, "''")}'`
    if (item.legacyOnly) {
      console.warn(`已上传旧 photos 字符串数组的派生文件，但没有独立 photos.id，保留原数组并跳过 D1 元数据写入：${item.originalKey}`)
      return
    }
    const sqlPath = join(tempDir, 'update.sql')
    await writeFile(sqlPath, `${sql};\n`)
    await retry(() => runWrangler(['d1', 'execute', database, '--file', sqlPath]), `更新 D1 ${item.owner}`)
  } catch (error) {
    if (uploadedKeys.length) {
      await Promise.all(uploadedKeys.map((key) => retry(() => runWrangler(['r2', 'object', 'delete', `${bucket}/${key}`]), `清理 ${key}`).catch(() => undefined)))
    }
    throw error
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  const data = JSON.parse(await readFile(input, 'utf8')) as ExportData
  const items: PlanItem[] = []
  for (const student of data.students || []) {
    const media = mediaOf(student)
    for (const asset of ['avatar', 'background'] as const) {
      const source = String(asset === 'avatar' ? (student.avatarUrl || student.avatar_url || '') : (student.backgroundUrl || student.background_url || ''))
      if (source && !media?.[asset]?.variants?.length) {
        const key = fileKey(source)
        items.push({ owner: String(student.slug || student.id), asset, originalKey: key, variants: variantKeys(key), sourcePath: sourcePath(student, key, data), width: student.width, height: student.height })
      }
    }
    for (const [index, legacyPhoto] of legacyPhotosOf(student).entries()) {
      const photo = typeof legacyPhoto === 'string' ? { r2Key: legacyPhoto } : legacyPhoto
      const source = String(photo?.r2Key || photo?.r2_key || photo?.url || '')
      if (!source || mediaOf(photo).variants?.length) continue
      const key = fileKey(source)
      items.push({ owner: String(photo?.id || `${student.slug || student.id}:photo:${index}`), asset: 'photo', originalKey: key, variants: variantKeys(key), sourcePath: sourcePath(photo, key, data), width: photo?.width, height: photo?.height, legacyOnly: !photo?.id })
    }
  }
  for (const photo of data.photos || []) {
    const source = String(photo.r2Key || photo.r2_key || '')
    if (source && !mediaOf(photo)?.variants?.length) items.push({ owner: String(photo.id), asset: 'photo', originalKey: fileKey(source), variants: variantKeys(fileKey(source)), sourcePath: sourcePath(photo, fileKey(source), data), width: photo.width, height: photo.height })
  }
  const batches: PlanItem[][] = []
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize))
  const plan = { source: basename(input), dryRun, remote, retries, batchSize, pending: items.length, expectedR2Objects: items.reduce((sum, item) => sum + item.variants.length, 0), keepOriginal: true, batches }
  await writeFile(output, JSON.stringify(plan, null, 2))
  console.log(`待处理 ${plan.pending} 项；预计新增 ${plan.expectedR2Objects} 个 R2 对象；原图保留。`)
  console.log(`计划已写入 ${output}${dryRun ? '（dry-run）' : ''}`)
  if (dryRun) return
  let completed = 0
  for (const batch of batches) {
    for (const item of batch) {
      await executeItem(item, data)
      completed++
      console.log(`已完成 ${completed}/${items.length}：${item.owner}`)
    }
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
