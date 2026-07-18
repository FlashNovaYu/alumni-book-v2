import assert from 'node:assert/strict'
import test from 'node:test'
import { listAdminAccounts, listAuditLogs } from '../src/api/adminAccounts.ts'
import { fetchGroupChatMessages } from '../src/api/community.ts'
import { listProfileMessages } from '../src/api/messages.ts'
import { normalizePageResult, pageSearchParams } from '../src/api/pagination.ts'
import { RequestLifecycle } from '../src/api/requestLifecycle.ts'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) || null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}

const storage = new MemoryStorage()
storage.setItem('admin_token', 'list-test-token')
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: '' } } })

function jsonResponse(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

async function withFetch(fetchImpl, run) {
  const previous = globalThis.fetch
  globalThis.fetch = fetchImpl
  try { return await run() } finally { globalThis.fetch = previous }
}

test('分页请求首批不超过 50，并将旧数组的满页继续到 page=2', async () => {
  const requests = []
  await withFetch(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    requests.push(url)
    const page = Number(url.searchParams.get('page'))
    return jsonResponse(Array.from({ length: page === 1 ? 50 : 7 }, (_, index) => ({
      id: `account-${page}-${index}`, displayName: `管理员 ${index}`, permissions: [], permissionOverrides: [],
    })))
  }, async () => {
    const first = await listAdminAccounts()
    assert.equal(first.items.length, 50)
    assert.equal(first.total, null)
    assert.equal(first.nextCursor, 'page:2')
    const second = await listAdminAccounts(first.nextCursor)
    assert.equal(second.items.length, 7)
    assert.equal(second.nextCursor, null)
  })

  assert.equal(requests[0].searchParams.get('limit'), '50')
  assert.equal(requests[0].searchParams.get('page'), '1')
  assert.equal(requests[1].searchParams.get('page'), '2')
})

test('PageResult 响应保留服务端游标与真实总数', () => {
  const page = normalizePageResult({ items: [{ id: 'one' }], nextCursor: 'opaque', total: 81 }, 50)
  assert.deepEqual(page, { items: [{ id: 'one' }], nextCursor: 'opaque', total: 81 })
  const query = pageSearchParams(100, 'opaque')
  assert.equal(query.get('limit'), '50')
  assert.equal(query.get('page'), '1')
  assert.equal(query.get('cursor'), 'opaque')
})

test('旧的未分页数组在客户端按 50 条切片且使用真实数组总数', () => {
  const students = Array.from({ length: 1_000 }, (_, index) => ({ id: `student-${index}` }))
  const first = normalizePageResult(students, 50)
  const second = normalizePageResult(students, 50, first.nextCursor)
  assert.equal(first.items.length, 50)
  assert.equal(first.total, 1_000)
  assert.equal(first.nextCursor, 'offset:50')
  assert.equal(second.items[0].id, 'student-50')
})

test('个人留言使用 approved 参数在服务端过滤后再分页', async () => {
  const allMessages = [
    ...Array.from({ length: 50 }, (_, index) => ({ id: `approved-${index}`, isApproved: true })),
    ...Array.from({ length: 10 }, (_, index) => ({ id: `pending-${index}`, isApproved: false })),
  ]

  await withFetch(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    const approved = url.searchParams.get('approved')
    const filtered = approved === '0' ? allMessages.filter((item) => !item.isApproved) : allMessages
    return jsonResponse(filtered.slice(0, Number(url.searchParams.get('limit'))))
  }, async () => {
    const page = await listProfileMessages('pending')
    assert.equal(page.items.length, 10)
    assert.ok(page.items.every((item) => !item.isApproved))
  })
})

test('旧留言接口首个 page 全为已通过时仍可继续取待审核页', async () => {
  const calls = []
  await withFetch(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    calls.push(url)
    const page = Number(url.searchParams.get('page'))
    const data = page === 1
      ? Array.from({ length: 50 }, (_, index) => ({ id: `approved-${index}`, isApproved: true }))
      : Array.from({ length: 10 }, (_, index) => ({ id: `pending-${index}`, isApproved: false }))
    return jsonResponse(data)
  }, async () => {
    const first = await listProfileMessages('pending')
    assert.equal(first.items.length, 0)
    assert.equal(first.nextCursor, 'page:2')
    const second = await listProfileMessages('pending', first.nextCursor)
    assert.equal(second.items.length, 10)
    assert.ok(second.items.every((item) => !item.isApproved))
  })
  assert.equal(calls[0].searchParams.get('approved'), '0')
  assert.equal(calls[1].searchParams.get('page'), '2')
})

test('群聊、管理员与审计 API 都发送 page+limit 并可读取下一页', async () => {
  const seen = []
  await withFetch(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    seen.push(url)
    const length = url.searchParams.get('page') === '1' ? 50 : 1
    if (url.pathname.includes('group-chat')) {
      return jsonResponse(Array.from({ length }, (_, index) => ({ id: `group-${index}`, status: 'hidden' })))
    }
    return jsonResponse(Array.from({ length }, (_, index) => ({ id: `row-${index}` })))
  }, async () => {
    const group = await fetchGroupChatMessages('hidden')
    assert.equal(group.nextCursor, 'page:2')
    const audit = await listAuditLogs({ action: 'test' })
    assert.equal(audit.nextCursor, 'page:2')
    await listAuditLogs({ action: 'test' }, audit.nextCursor)
  })
  assert.ok(seen.every((url) => Number(url.searchParams.get('limit')) <= 50))
  assert.ok(seen.some((url) => url.pathname.includes('audit-logs') && url.searchParams.get('page') === '2'))
})

test('筛选开始新请求会中止旧请求，且陈旧响应不能覆盖新结果', () => {
  const lifecycle = new RequestLifecycle()
  const first = lifecycle.begin()
  const second = lifecycle.begin()
  let displayed = ''

  assert.equal(first.signal.aborted, true)
  assert.equal(lifecycle.commit(first, () => { displayed = '旧筛选' }), false)
  assert.equal(lifecycle.commit(second, () => { displayed = '新筛选' }), true)
  assert.equal(displayed, '新筛选')
  assert.equal(lifecycle.shouldReport(new DOMException('已取消', 'AbortError'), first), false)
  assert.equal(lifecycle.shouldReport(new Error('服务器错误'), second), true)
})
