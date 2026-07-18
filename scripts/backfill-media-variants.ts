/** Build a deterministic media-derivative plan from a local D1 JSON export. */
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

const argv = process.argv.slice(2)
const value = (name: string, fallback = '') => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback
const input = value('input')
const output = value('output', 'media-backfill-plan.json')
const batchSize = Math.max(1, Number(value('batch', '25')))
const retries = Math.max(0, Number(value('retries', '3')))
const dryRun = !argv.includes('--execute') || argv.includes('--dry-run')
if (!input) { console.error('必须指定本地导出文件：--input=media-export.json'); process.exit(1) }

type Row = { id?: string; slug?: string; r2Key?: string; r2_key?: string; avatarUrl?: string; avatar_url?: string; backgroundUrl?: string; background_url?: string; media?: any; media_json?: string }
type PlanItem = { owner: string; asset: 'avatar' | 'background' | 'photo'; originalKey: string; variants: string[] }
const fileKey = (url: string) => url.includes('/api/files/') ? url.split('/api/files/')[1] : url.replace(/^\/+/, '')
const variantKeys = (key: string) => {
  const stem = key.replace(/\.[^.]+$/, '')
  return [128, 256, 320, 960].map((width) => `${stem}_${width}.webp`)
}
function mediaOf(row: Row) { try { return row.media || JSON.parse(row.media_json || '{}') } catch { return {} } }

async function main() {
  const data = JSON.parse(await readFile(input, 'utf8')) as { students?: Row[]; photos?: Row[] }
  const items: PlanItem[] = []
  for (const student of data.students || []) {
    const media = mediaOf(student)
    for (const asset of ['avatar', 'background'] as const) {
      const source = String(asset === 'avatar' ? (student.avatarUrl || student.avatar_url || '') : (student.backgroundUrl || student.background_url || ''))
      if (source && !media?.[asset]?.variants?.length) items.push({ owner: String(student.slug || student.id), asset, originalKey: fileKey(source), variants: variantKeys(fileKey(source)) })
    }
  }
  for (const photo of data.photos || []) {
    const source = String(photo.r2Key || photo.r2_key || '')
    if (source && !mediaOf(photo)?.variants?.length) items.push({ owner: String(photo.id), asset: 'photo', originalKey: fileKey(source), variants: variantKeys(fileKey(source)) })
  }
  const batches: PlanItem[][] = []
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize))
  const plan = { source: basename(input), dryRun, retries, batchSize, pending: items.length, expectedR2Objects: items.reduce((sum, item) => sum + item.variants.length, 0), keepOriginal: true, batches }
  await writeFile(output, JSON.stringify(plan, null, 2))
  console.log(`待处理 ${plan.pending} 项；预计新增 ${plan.expectedR2Objects} 个 R2 对象；原图保留。`)
  console.log(`计划已写入 ${output}${dryRun ? '（dry-run）' : ''}`)
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
