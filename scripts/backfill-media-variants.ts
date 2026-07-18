/** 只读优先的媒体变体回填任务器；始终保留原图。 */
import { writeFile } from 'node:fs/promises'

const args = new Set(process.argv.slice(2))
const dryRun = !args.has('--execute') || args.has('--dry-run')
const batchSize = Math.max(1, Number(process.argv.find((v) => v.startsWith('--batch='))?.split('=')[1] || 25))
const retries = Math.max(0, Number(process.argv.find((v) => v.startsWith('--retries='))?.split('=')[1] || 3))
const endpoint = process.env.MEDIA_BACKFILL_URL
if (!dryRun && !endpoint) { console.error('执行回填需要设置 MEDIA_BACKFILL_URL；未提供时请使用 --dry-run。'); process.exit(1) }
type Job = { id: string; kind: 'photo' | 'student'; key: string }
async function loadJobs(): Promise<Job[]> {
  if (!process.env.MEDIA_BACKFILL_JOBS) return []
  const response = await fetch(process.env.MEDIA_BACKFILL_JOBS)
  if (!response.ok) throw new Error(`读取任务失败: HTTP ${response.status}`)
  const payload = await response.json() as { jobs?: Job[] }
  return Array.isArray(payload.jobs) ? payload.jobs : []
}
async function main() {
  const jobs = await loadJobs(); const batches: Job[][] = []
  for (let i = 0; i < jobs.length; i += batchSize) batches.push(jobs.slice(i, i + batchSize))
  const failures: Array<{ job: Job; error: string }> = []
  console.log(`媒体变体回填: ${jobs.length} 项，${batches.length} 批，模式=${dryRun ? 'dry-run' : 'execute'}`)
  if (dryRun) { await writeFile('media-backfill-plan.json', JSON.stringify({ generatedAt: new Date().toISOString(), batches }, null, 2)); return }
  for (const batch of batches) {
    let completed = false
    for (let attempt = 0; attempt <= retries && !completed; attempt++) try {
      const response = await fetch(endpoint!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobs: batch, keepOriginal: true }) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`); completed = true
    } catch (error) { if (attempt === retries) for (const job of batch) failures.push({ job, error: String(error) }) }
  }
  await writeFile('media-backfill-failures.json', JSON.stringify(failures, null, 2)); if (failures.length) process.exitCode = 1
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
