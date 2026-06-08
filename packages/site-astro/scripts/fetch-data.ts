import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const API_BASE =
  process.env.VITE_WORKER_URL ||
  process.env.VITE_API_BASE_URL ||
  'https://alumni-book-api.chenyuhao2263.workers.dev'

async function fetchJSON(path: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal })
    const data = await res.json()
    return (data as any).data || data
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const outDir = join(__dirname, '..', 'public', 'data')
  mkdirSync(outDir, { recursive: true })

  console.log(`Fetching SSG data from ${API_BASE}`)
  console.log(`Client API base will be ${process.env.VITE_API_BASE_URL || '(default worker)'}`)

  const endpoints = [
    { path: '/api/students', fallback: [] },
    { path: '/api/classmates', fallback: [] },
    { path: '/api/config', fallback: { preface: {}, footer: {}, particles: {}, acknowledgments: [], typography: {} } },
    { path: '/api/albums', fallback: [] },
  ]

  for (const { path, fallback } of endpoints) {
    const name = path.replace('/api/', '')
    try {
      const data = await fetchJSON(path)
      writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data))
      console.log(`  Fetched ${name}`)
    } catch (e: any) {
      console.error(`  Failed to fetch ${name}: ${e.message}`)
      writeFileSync(join(outDir, `${name}.json`), JSON.stringify(fallback))
    }
  }

  console.log('Data fetch complete')
}

main().catch(e => { console.error(e); process.exit(1) })
