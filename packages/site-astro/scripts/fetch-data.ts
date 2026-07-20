import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeLegacyFileUrls } from '../../../workers/api/src/lib/fileUrl'
import { toPublicStudent } from '../src/utils/publicStudent'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const API_BASE = (process.env.VITE_SSG_API_BASE || '').trim().replace(/\/+$/, '')
if (!API_BASE && process.env.NODE_ENV !== 'test') {
  throw new Error('缺少 VITE_SSG_API_BASE，已拒绝使用未知环境构建静态站点')
}

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
      const data = normalizeLegacyFileUrls(await res.json())
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
  console.log(`Client API base will be ${process.env.VITE_API_BASE_URL || '(same-origin)'}`)

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
      const publicData = path === '/api/students' && Array.isArray(data)
        ? data.map(toPublicStudent)
        : path === '/api/classmates' && Array.isArray(data)
          ? data.map(({ seatNo: _seatNo, dormNo: _dormNo, ...classmate }) => classmate)
        : data
      writeFileSync(join(outDir, `${name}.json`), JSON.stringify(publicData))
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
