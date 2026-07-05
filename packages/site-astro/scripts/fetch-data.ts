import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const API_BASE =
  process.env.VITE_WORKER_URL ||
  process.env.VITE_API_BASE_URL ||
  'https://alumni-book-api.chenyuhao2263.workers.dev'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJSON(path: string, retries = 4, delay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal })
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      return (data as any).data || data
    } catch (e: any) {
      if (attempt === retries) {
        throw e
      }
      console.warn(`  Fetch ${path} failed (attempt ${attempt + 1}/${retries + 1}): ${e.message}. Retrying in ${delay}ms...`)
      await sleep(delay)
      delay *= 2
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function main() {
  const outDir = join(__dirname, '..', 'public', 'data')
  mkdirSync(outDir, { recursive: true })

  console.log(`Fetching SSG data from ${API_BASE}`)
  console.log(`Client API base will be ${process.env.VITE_API_BASE_URL || '(default worker)'}`)

  const endpoints = [
    { path: '/api/students', required: true },
    { path: '/api/classmates', required: true },
    { path: '/api/config', required: true },
    { path: '/api/albums', required: false, fallback: [] },
    { path: '/api/timeline', required: false, fallback: [] },
  ]

  for (const { path, required, fallback } of endpoints) {
    const name = path.replace('/api/', '')
    try {
      const data = await fetchJSON(path)
      writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data))
      console.log(`  Fetched ${name}`)
    } catch (e: any) {
      console.error(`  Failed to fetch ${name}: ${e.message}`)
      if (required) {
        console.error(`❌ Critical data fetch failed: ${name}. Aborting build to prevent deploying empty site.`)
        process.exit(1)
      } else {
        writeFileSync(join(outDir, `${name}.json`), JSON.stringify(fallback))
      }
    }
  }

  console.log('Data fetch complete')
}

main().catch(e => { console.error(e); process.exit(1) })
