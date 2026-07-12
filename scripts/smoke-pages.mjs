const baseUrl = (process.env.PAGES_BASE_URL || 'https://alumni-book.pages.dev').replace(/\/$/, '')
const expectedSha = process.env.PAGES_EXPECTED_SHA || ''

if (!/^[0-9a-f]{40}$/i.test(expectedSha)) {
  throw new Error('PAGES_EXPECTED_SHA 必须是完整提交 SHA')
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function request(path, init = {}, attempts = 6) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: init.redirect || 'follow',
        ...init,
        signal: AbortSignal.timeout(15000),
      })
      if (response.status >= 400) throw new Error(`HTTP ${response.status}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(attempt * 2000)
    }
  }
  throw lastError
}

function expectStatus(response, expected, label) {
  if (!expected.includes(response.status)) {
    throw new Error(`${label} 返回 ${response.status}，预期 ${expected.join('/')}`)
  }
}

const release = await request('/release.json')
const releaseBody = await release.json()
if (releaseBody.source !== expectedSha) {
  throw new Error(`线上发布 SHA 为 ${releaseBody.source || '缺失'}，预期 ${expectedSha}`)
}

const home = await request('/')
expectStatus(home, [200], '首页')
const homeHtml = await home.text()
if (homeHtml.includes('alumni-book-api.chenyuhao2263.workers.dev')) {
  throw new Error('首页仍包含公开 Worker 地址')
}

const health = await request('/api/health')
expectStatus(health, [200], '健康检查')

const classmates = await request('/api/classmates')
expectStatus(classmates, [200], '同学列表')

const albumsResponse = await request('/api/albums')
expectStatus(albumsResponse, [200], '相册 API')
const albumsBody = await albumsResponse.json()
const albums = albumsBody.data || []
const r2Keys = albums
  .flatMap(album => [album.coverR2Key, ...(album.photos || []).map(photo => photo.r2Key)])
  .filter(Boolean)
if (r2Keys.length === 0) throw new Error('线上相册没有可用于 R2 烟雾测试的文件')

let filePath
let head
for (const r2Key of r2Keys) {
  const encodedKey = String(r2Key).split('/').map(encodeURIComponent).join('/')
  const candidatePath = `/api/files/${encodedKey}`
  try {
    head = await request(candidatePath, { method: 'HEAD' }, 1)
    filePath = candidatePath
    break
  } catch {}
}
if (!head || !filePath) throw new Error('线上相册没有可访问的 R2 文件')
expectStatus(head, [200], 'R2 HEAD')
for (const header of ['content-type', 'content-length', 'etag', 'accept-ranges', 'cache-control']) {
  if (!head.headers.get(header)) throw new Error(`R2 HEAD 缺少 ${header}`)
}

await request(filePath, { headers: { Range: 'bytes=0-0' } })
const range = await request(filePath, { headers: { Range: 'bytes=0-0' } })
expectStatus(range, [206], 'R2 Range')
if (!range.headers.get('content-range')) throw new Error('R2 Range 缺少 Content-Range')
if (range.headers.get('content-length') !== '1') throw new Error('R2 Range 分段长度不是 1')

const legacy = await request('/alumni-book-v2/roster/', { redirect: 'manual' })
expectStatus(legacy, [301, 302, 307, 308], '旧路径跳转')
if (!legacy.headers.get('location')?.endsWith('/roster/')) {
  throw new Error('旧路径没有映射到 /roster/')
}

const admin = await request('/admin/')
expectStatus(admin, [200], '管理后台')

console.log(`Pages smoke checks passed for ${baseUrl}`)
