# 管理后台运营体验优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 完成历史投稿、相册、时光轴、学生预览、操作日志、工作台和站点设置七项后台体验优化。

**Architecture:** Worker 为时光轴排序、工作台统计和站点基本资料提供明确的受权限保护契约。后台继续以 Vue 视图调用这些契约；公开站点只在后端确认管理员会话仍有效时绕过前端登录重定向。审计表结构不变，日志页面用纯函数将现有摘要显示为中文。

**Tech Stack:** Vue 3、Astro 5、TypeScript、Hono、Cloudflare D1、Vitest、Node 测试。

---

## 文件结构

- 修改 packages/shared/src/types.ts：新增 SiteIdentityConfig，并使 SiteConfig 必填 identity。
- 修改 workers/api/src/index.ts：公开与管理配置读接口返回 identity；工作台把公共群聊改为运营概览；给管理时光轴读接口增加 content.manage 权限。
- 修改 workers/api/src/routes/config.ts：校验 identity 的类型与长度。
- 修改 workers/api/src/routes/timeline.ts：增加管理专用完整事件读取与同日期重排序。
- 修改 workers/api/tests/admin-rbac.test.ts：测试工作台统计和时光轴排序。
- 修改 packages/admin/src/views/MessagesView.vue：删除历史投稿、支持从工作台直接打开公共群聊。
- 修改 packages/admin/src/views/AlbumsView.vue：恢复已存在过的拖放上传区。
- 修改 packages/admin/src/views/TimelineEventsView.vue：按日期分组、原生拖放排序、编辑抽屉。
- 新建 packages/admin/src/utils/auditSummary.ts：无副作用中文摘要函数。
- 新建 packages/admin/tests/audit-summary.test.ts：覆盖摘要函数。
- 修改 packages/admin/src/views/AuditLogView.vue 与 SettingsView.vue：使用摘要器与 identity 表单。
- 修改 packages/admin/package.json 与 packages/admin/tests/network.test.ts：纳入后台验证。
- 修改 packages/site-astro/src/layouts/MainLayout.astro、components/AppFooter.astro 和 tests/classmate-auth-static.test.ts：管理员预览守卫和站点资料消费。

### Task 1: 先定义 Worker 行为测试

**Files:**

- Modify: workers/api/tests/admin-rbac.test.ts

- [ ] **Step 1: 在创建命名主管理员的测试之后，添加工作台新统计的失败测试。**

~~~ts
it('将公共群聊作为运营统计而非审核待办，并持久化站点基本资料', async () => {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, client_nonce) VALUES ('pm_operations_group', 'test_init', '群聊同学', '今天的公共群聊', 'visible', 'chat:operations')",
  ).run()

  const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
  }), env, createExecutionContext())
  const token = (await login.json() as any).data.token

  const initialConfig = await worker.fetch(new Request('http://localhost/api/config'), env, createExecutionContext())
  expect((await initialConfig.json() as any).data.identity).toMatchObject({
    siteName: '同学录', className: '', classYear: '', shareDescription: '',
  })
  const saveConfig = await worker.fetch(new Request('http://localhost/api/config', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ identity: { siteName: '高三一班同学录', className: '高三一班', classYear: '2026 届', shareDescription: '记录青春' } }),
  }), env, createExecutionContext())
  expect(saveConfig.status).toBe(200)

  const response = await worker.fetch(new Request('http://localhost/api/admin/workbench', {
    headers: { Authorization: 'Bearer ' + token },
  }), env, createExecutionContext())
  const body = await response.json() as any

  expect(body.data.todos).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'public-messages' }),
  ]))
  expect(body.data.summary).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'group-chat-today', label: '今日公共群聊', to: '/messages?tab=group', value: expect.any(Number) }),
  ]))
  expect(body.data.summary.find((item: any) => item.id === 'group-chat-today').value).toBeGreaterThanOrEqual(1)
})
~~~

- [ ] **Step 2: 添加历史公共投稿删除与审计的回归测试。**

~~~ts
it('删除历史公共投稿时保留原因和审计记录', async () => {
  await env.DB.prepare(
    "INSERT INTO public_messages (id, author_slug, author_name, content, status, client_nonce) VALUES ('pm_operations_legacy', 'test_init', '历史投稿同学', '需要删除的历史投稿', 'approved', 'legacy:operations')",
  ).run()
  const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
  }), env, createExecutionContext())
  const token = (await login.json() as any).data.token

  const response = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_operations_legacy', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ reason: '重复投稿' }),
  }), env, createExecutionContext())
  expect(response.status).toBe(200)
  expect(await env.DB.prepare("SELECT id FROM public_messages WHERE id = 'pm_operations_legacy'").first()).toBeNull()
  expect(await env.DB.prepare("SELECT action, reason FROM admin_audit_logs WHERE resource_id = 'pm_operations_legacy' ORDER BY created_at DESC").first())
    .toMatchObject({ action: 'public_message.delete', reason: '重复投稿' })
})
~~~

- [ ] **Step 3: 在同一文件中添加完整读取、排序成功和跨日期排序失败的测试。**

~~~ts
it('仅持久化同日期事件的完整排序', async () => {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO timeline_events (id, title, event_date, sort_order) VALUES ('tle_operations_a', '同日事件一', '2023-06-20', 0)"),
    env.DB.prepare("INSERT INTO timeline_events (id, title, event_date, sort_order) VALUES ('tle_operations_b', '同日事件二', '2023-06-20', 1)"),
    env.DB.prepare("INSERT INTO timeline_events (id, title, event_date, sort_order) VALUES ('tle_operations_c', '跨日事件', '2023-06-21', 0)"),
  ])
  const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
  }), env, createExecutionContext())
  const token = (await login.json() as any).data.token

  const list = await worker.fetch(new Request('http://localhost/api/admin/timeline/events', {
    headers: { Authorization: 'Bearer ' + token },
  }), env, createExecutionContext())
  expect((await list.json() as any).data).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'tle_operations_a', eventDate: '2023-06-20', sortOrder: 0 }),
  ]))

  const reordered = await worker.fetch(new Request('http://localhost/api/timeline/events/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ eventDate: '2023-06-20', ids: ['tle_operations_b', 'tle_operations_a'] }),
  }), env, createExecutionContext())
  expect(reordered.status).toBe(200)

  const invalid = await worker.fetch(new Request('http://localhost/api/timeline/events/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ eventDate: '2023-06-20', ids: ['tle_operations_a', 'tle_operations_c'] }),
  }), env, createExecutionContext())
  expect(invalid.status).toBe(400)
})
~~~

- [ ] **Step 4: 运行测试，确认新增契约在实现前失败。**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: FAIL；工作台仍返回 public-messages 待办，管理时光轴读取和排序路径为 404。历史投稿删除测试应通过，证明只需补前端调用。

- [ ] **Step 5: 确认失败原因只来自新增契约。**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts --reporter=verbose

Expected: 原有 RBAC 测试通过；新增两个测试失败。

- [ ] **Step 6: 提交测试基线。**

~~~bash
git add workers/api/tests/admin-rbac.test.ts
git commit -m "test: define admin operations behavior"
~~~

### Task 2: 实现站点基本资料与正确的工作台统计

**Files:**

- Modify: packages/shared/src/types.ts
- Modify: workers/api/src/index.ts
- Modify: workers/api/src/routes/config.ts
- Test: workers/api/tests/admin-rbac.test.ts

- [ ] **Step 1: 在共享类型中声明站点基本资料，并让 SiteConfig 拥有该字段。**

~~~ts
export interface SiteIdentityConfig {
  siteName: string
  className: string
  classYear: string
  shareDescription: string
}

export interface SiteConfig {
  particles: Record<string, { enabled: boolean; preset: string }>
  footer: { copyright: string; beian: string; beianUrl: string }
  preface: { title: string; subtitle: string; content: string }
  acknowledgments: Acknowledgment[]
  typography: { fontFamily: string; fontSize: number }
  identity: SiteIdentityConfig
  museum?: MuseumThemeConfig
}
~~~

- [ ] **Step 2: 在 index.ts 的公开和管理配置响应中加入同一兼容默认值。**

~~~ts
identity: config.identity || {
  siteName: '同学录',
  className: '',
  classYear: '',
  shareDescription: '',
},
~~~

将它加入两处 data 对象，位置紧邻 typography 与 museum。公开 GET 和管理 GET 都必须返回该字段。

- [ ] **Step 3: 在 configRoutes.put 中校验 identity。**

~~~ts
if (body.identity !== undefined) {
  const identity = body.identity
  const keys = ['siteName', 'className', 'classYear', 'shareDescription'] as const
  if (!identity || typeof identity !== 'object' || keys.some((key) => typeof identity[key] !== 'string')) {
    return c.json({ success: false, message: 'identity 配置格式不正确' }, 400)
  }
  if (identity.siteName.trim().length > 60 || identity.className.trim().length > 80 || identity.classYear.trim().length > 40 || identity.shareDescription.trim().length > 160) {
    return c.json({ success: false, message: '站点基本资料长度超出限制' }, 400)
  }
}
~~~

- [ ] **Step 4: 用真实公共群聊标识替换错误的待审核查询。**

~~~ts
const [profileMessages, groupChatToday] = await Promise.all([
  c.env.DB.prepare('SELECT COUNT(*) AS count FROM messages WHERE is_approved = 0').first<{ count: number }>(),
  c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM public_messages WHERE client_nonce IS NOT NULL AND client_nonce NOT LIKE 'legacy:%' AND date(created_at, '+8 hours') = date('now', '+8 hours')",
  ).first<{ count: number }>(),
])
todos.push({ id: 'profile-messages', label: '个人留言待审核', count: profileMessages?.count || 0, to: '/messages' })
summary.push({ id: 'group-chat-today', label: '今日公共群聊', value: groupChatToday?.count || 0, to: '/messages?tab=group' })
~~~

- [ ] **Step 5: 运行 Worker 测试并提交。**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: PASS。

~~~bash
git add packages/shared/src/types.ts workers/api/src/index.ts workers/api/src/routes/config.ts workers/api/tests/admin-rbac.test.ts
git commit -m "feat: add site identity and correct chat workbench summary"
~~~

### Task 3: 实现管理时光轴完整读取和同日期排序

**Files:**

- Modify: workers/api/src/index.ts
- Modify: workers/api/src/routes/timeline.ts
- Test: workers/api/tests/admin-rbac.test.ts

- [ ] **Step 1: 在 index.ts 的管理路由中增加内容管理权限。**

~~~ts
app.use('/api/admin/timeline/*', requirePermission('content.manage'))
~~~

将此中间件放在通用 /api/admin 会话中间件之后、timelineRoutes 注册之前。

- [ ] **Step 2: 添加管理专用格式化器和完整读取路由。**

~~~ts
function formatAdminTimelineEvent(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    eventDate: row.event_date,
    photoR2Key: row.photo_r2_key || null,
    isMilestone: !!row.is_milestone,
    eventType: row.event_type || 'class_event',
    sortOrder: Number(row.sort_order || 0),
  }
}

timelineRoutes.get('/admin/timeline/events', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM timeline_events ORDER BY event_date DESC, sort_order ASC, id ASC',
  ).all()
  return c.json({ success: true, data: (results || []).map(formatAdminTimelineEvent) })
})
~~~

- [ ] **Step 3: 在动态 :id 路由之前添加排序写入路由。**

~~~ts
timelineRoutes.put('/timeline/events/reorder', async (c) => {
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await c.req.json().catch(() => ({})) as { eventDate?: unknown; ids?: unknown }
  const eventDate = typeof body.eventDate === 'string' ? body.eventDate : ''
  const ids = Array.isArray(body.ids) && body.ids.every((id) => typeof id === 'string') ? body.ids as string[] : []
  if (!eventDate || ids.length === 0 || new Set(ids).size !== ids.length) {
    return c.json({ success: false, message: '排序参数无效' }, 400)
  }
  const placeholders = ids.map(() => '?').join(',')
  const rows = await c.env.DB.prepare(
    'SELECT id, event_date, sort_order FROM timeline_events WHERE id IN (' + placeholders + ')',
  ).bind(...ids).all<any>()
  if ((rows.results || []).length !== ids.length || (rows.results || []).some((row: any) => row.event_date !== eventDate)) {
    return c.json({ success: false, message: '只能调整同一日期的完整事件顺序' }, 400)
  }
  const before = (rows.results || []).map((row: any) => ({ id: row.id, sortOrder: row.sort_order }))
  const mutations = ids.map((id, sortOrder) => c.env.DB.prepare(
    'UPDATE timeline_events SET sort_order = ? WHERE id = ?',
  ).bind(sortOrder, id))
  await runAuditedBatch(c.env.DB, admin.id, mutations, {
    action: 'timeline_event.reorder', resourceType: 'timeline_event', resourceId: eventDate,
    before, after: { eventDate, ids },
  })
  return c.json({ success: true })
})
~~~

- [ ] **Step 4: 运行排序测试并确认无效请求没有写入。**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: PASS；跨日期请求返回 400，且数据库中两个同日期事件维持成功排序后的顺序。

- [ ] **Step 5: 提交时光轴 Worker 功能。**

~~~bash
git add workers/api/src/index.ts workers/api/src/routes/timeline.ts workers/api/tests/admin-rbac.test.ts
git commit -m "feat: add sortable admin timeline events"
~~~

### Task 4: 实现审核、相册和时光轴后台交互

**Files:**

- Modify: packages/admin/src/views/MessagesView.vue
- Modify: packages/admin/src/views/AlbumsView.vue
- Modify: packages/admin/src/views/TimelineEventsView.vue
- Modify: packages/admin/tests/network.test.ts

- [ ] **Step 1: 在 MessagesView 处理群聊页签 query，并删除历史投稿。**

~~~ts
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const messageType = ref<MessageType>(route.query.tab === 'group' ? 'group' : 'profile')
watch(() => route.query.tab, (tab) => {
  const next: MessageType = tab === 'group' ? 'group' : 'profile'
  if (messageType.value !== next) changeMessageType(next)
})

async function removeLegacy(id: string) {
  const reason = window.prompt('请输入删除原因：')?.trim()
  if (!reason) return
  processing.value = true
  try {
    await adminFetch('/api/admin/public-messages/' + id, { method: 'DELETE', body: JSON.stringify({ reason }) })
    legacyMessages.value = legacyMessages.value.filter((message) => message.id !== id)
    showToast('success', '历史投稿已删除')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '删除失败')
  } finally {
    processing.value = false
  }
}
~~~

在历史投稿的动作区添加按钮：

~~~vue
<button v-if="canManage" class="btn-danger btn-sm" :disabled="processing" @click="removeLegacy(message.id)">删除</button>
~~~

- [ ] **Step 2: 恢复相册拖放上传的统一文件入口。**

~~~ts
const fileInput = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

function triggerFileInput() { fileInput.value?.click() }
function handleFileSelect(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (files) void uploadFiles(files)
}
function handleFileDrop(event: DragEvent) {
  isDragOver.value = false
  const files = event.dataTransfer?.files
  if (files) void uploadFiles(files)
}
async function uploadFiles(files: FileList) {
  if (!files.length || !uploadAlbum.value) return
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', await compressImage(file, 1280, 0.8))
      formData.append('type', 'photo')
      formData.append('albumId', uploadAlbum.value.id)
      await adminFetch('/api/upload', { method: 'POST', body: formData, headers: {} })
    }
    await loadAlbums()
    alert('上传成功')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
~~~

用 upload-dropzone 包裹隐藏 file input，绑定 dragover、dragenter、dragleave、drop 和 click；恢复提交 0528292 的虚线边框、高亮、上传中样式，并将关闭按钮设为 :disabled="uploading"。

- [ ] **Step 3: 重写时光轴页面为日期组和原生拖拽。**

~~~ts
const draggedId = ref<string | null>(null)
const groupedEvents = computed(() => {
  const groups = new Map<string, Event[]>()
  for (const event of events.value) groups.set(event.eventDate, [...(groups.get(event.eventDate) || []), event])
  return [...groups.entries()].map(([eventDate, items]) => ({ eventDate, items }))
})
async function load() {
  const response = await adminFetch<{ data?: Event[] }>('/api/admin/timeline/events')
  events.value = response.data || []
}
async function reorderGroup(eventDate: string, targetId: string) {
  const items = groupedEvents.value.find((group) => group.eventDate === eventDate)?.items || []
  const from = items.findIndex((event) => event.id === draggedId.value)
  const to = items.findIndex((event) => event.id === targetId)
  if (from < 0 || to < 0 || from === to) return
  const ordered = [...items]
  const [moved] = ordered.splice(from, 1)
  ordered.splice(to, 0, moved)
  await adminFetch('/api/timeline/events/reorder', {
    method: 'PUT', body: JSON.stringify({ eventDate, ids: ordered.map((event) => event.id) }),
  })
  await load()
}
~~~

模板按 groupedEvents 渲染。卡片设置 draggable="true"，并使用 @dragstart、@dragover.prevent、@drop 调用 reorderGroup。新增编辑抽屉状态 editingId，原有 title、eventDate、description、photoR2Key、isMilestone 和 eventType 表单同时用于新增和编辑；网络失败时不清空表单。

- [ ] **Step 4: 在 network.test.ts 添加后台静态断言。**

~~~ts
expect(read('../src/views/MessagesView.vue')).toContain('removeLegacy')
expect(read('../src/views/MessagesView.vue')).toContain('/api/admin/public-messages/')
expect(read('../src/views/AlbumsView.vue')).toContain('upload-dropzone')
expect(read('../src/views/AlbumsView.vue')).toContain('handleFileDrop')
expect(read('../src/views/TimelineEventsView.vue')).toContain('/api/admin/timeline/events')
expect(read('../src/views/TimelineEventsView.vue')).toContain('/api/timeline/events/reorder')
expect(read('../src/views/TimelineEventsView.vue')).toContain('draggable="true"')
~~~

- [ ] **Step 5: 运行后台测试、类型检查并提交。**

Run: pnpm --filter admin test && pnpm --filter admin typecheck

Expected: PASS。

~~~bash
git add packages/admin/src/views/MessagesView.vue packages/admin/src/views/AlbumsView.vue packages/admin/src/views/TimelineEventsView.vue packages/admin/tests/network.test.ts
git commit -m "feat: improve moderation album and timeline workflows"
~~~

### Task 5: 人性化审计日志并扩展设置表单

**Files:**

- Create: packages/admin/src/utils/auditSummary.ts
- Create: packages/admin/tests/audit-summary.test.ts
- Modify: packages/admin/src/views/AuditLogView.vue
- Modify: packages/admin/src/views/SettingsView.vue
- Modify: packages/admin/package.json

- [ ] **Step 1: 写摘要函数失败测试。**

~~~ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeAuditLog } from '../src/utils/auditSummary'

test('将相册更新转换为中文字段摘要', () => {
  const summary = summarizeAuditLog({
    action: 'album.update', resource_type: 'album', resource_id: 'album_internal_id', reason: null,
    before_summary: JSON.stringify({ title: '旧相册' }),
    after_summary: JSON.stringify({ title: '毕业旅行', coverR2Key: 'photos/cover.jpg', featured: true }),
  } as any)
  assert.equal(summary.title, '更新了相册「毕业旅行」')
  assert.equal(summary.detail, '修改了：相册名称、封面照片、精选状态')
})

test('未知旧日志不泄露内部动作和资源 ID', () => {
  const summary = summarizeAuditLog({ action: 'future.action', resource_type: 'future_resource', resource_id: 'secret_id', reason: null } as any)
  assert.equal(summary.title, '完成了一项管理操作')
  assert.equal(summary.detail, null)
})
~~~

- [ ] **Step 2: 实现摘要纯函数，且不回传原始代码。**

~~~ts
const actionTitles: Record<string, string> = {
  'album.create': '创建了相册', 'album.update': '更新了相册', 'album.delete': '删除了相册',
  'photo.update': '更新了照片信息', 'photo.delete': '删除了照片', 'file.upload': '上传了文件',
  'timeline_event.create': '创建了时光轴事件', 'timeline_event.update': '更新了时光轴事件',
  'timeline_event.reorder': '调整了时光轴事件顺序', 'timeline_event.delete': '删除了时光轴事件',
  'public_message.delete': '删除了历史公共投稿', 'message.delete': '删除了个人留言',
  'site_config.update': '更新了站点设置',
}
const fieldLabels: Record<string, string> = {
  title: '相册名称', description: '描述', coverR2Key: '封面照片', featured: '精选状态',
  eventDate: '日期', eventType: '事件类型', isMilestone: '里程碑', photoR2Key: '事件照片',
  siteName: '站点名称', className: '班级名称', classYear: '届别', shareDescription: '分享摘要',
}
~~~

实现 parseObject，只返回 JSON 对象或 null。summarizeAuditLog 的 title 使用 actionTitles 和 after.title；detail 只列出 fieldLabels 中的字段；未知记录固定返回“完成了一项管理操作”和 null。

- [ ] **Step 3: 在 AuditLogView 只渲染摘要。**

~~~vue
<li v-for="log in logs" :key="log.id">
  <div class="log-heading"><strong>{{ summaryOf(log).title }}</strong><time>{{ formatDate(log.created_at) }}</time></div>
  <p v-if="summaryOf(log).detail" class="resource">{{ summaryOf(log).detail }}</p>
  <p v-if="summaryOf(log).reason">原因：{{ summaryOf(log).reason }}</p>
</li>
~~~

导入 summarizeAuditLog 并定义 const summaryOf = summarizeAuditLog。删除 pretty 函数、details、pre、动作标签和资源 ID 行。

- [ ] **Step 4: 在 SettingsView 初始化、加载和编辑 identity。**

~~~ts
const defaultIdentity = { siteName: '同学录', className: '', classYear: '', shareDescription: '' }
const config = ref<SiteConfig>({
  particles: {}, footer: { copyright: '', beian: '', beianUrl: '' },
  preface: { title: '', subtitle: '', content: '' }, acknowledgments: [],
  typography: { fontFamily: 'default', fontSize: 15 }, identity: { ...defaultIdentity },
  museum: { ...defaultMuseumConfig },
})
// 读取成功时使用：identity: { ...defaultIdentity, ...res.data.identity }
~~~

在前言卡片前新增“站点基本资料”卡片。四个输入分别绑定 config.identity.siteName、className、classYear、shareDescription；使用中文 label 和 maxlength 60、80、40、160。

- [ ] **Step 5: 将摘要测试纳入脚本、运行并提交。**

~~~json
"test": "node tests/community-static.mjs && node tests/network-integration-static.mjs && pnpm run test:network && tsx --test tests/audit-summary.test.ts"
~~~

Run: pnpm --filter admin test && pnpm --filter admin typecheck

Expected: PASS。

~~~bash
git add packages/admin/src/utils/auditSummary.ts packages/admin/tests/audit-summary.test.ts packages/admin/src/views/AuditLogView.vue packages/admin/src/views/SettingsView.vue packages/admin/package.json
git commit -m "feat: humanize audit logs and extend site settings"
~~~

### Task 6: 实现验证过的管理员预览和站点资料消费

**Files:**

- Modify: packages/site-astro/src/layouts/MainLayout.astro
- Modify: packages/site-astro/src/components/AppFooter.astro
- Modify: packages/site-astro/tests/classmate-auth-static.test.ts

- [ ] **Step 1: 先添加管理员预览与资料消费的失败静态断言。**

~~~ts
it('允许有效管理员会话预览且不把令牌写入 URL', () => {
  const layout = read('layouts/MainLayout.astro')
  expect(layout).toContain("sessionStorage.getItem('admin_token')")
  expect(layout).toContain('/api/auth/verify')
  expect(layout).toContain("Authorization: 'Bearer ' + adminToken")
  expect(layout).not.toContain('previewToken')
})

it('同步站点名称、分享摘要和页脚资料', () => {
  const layout = read('layouts/MainLayout.astro')
  const footer = read('components/AppFooter.astro')
  expect(layout).toContain('identity.shareDescription')
  expect(layout).toContain('[data-site-footer]')
  expect(footer).toContain('data-site-footer')
})
~~~

- [ ] **Step 2: 在 MainLayout 的前置区读取构建时配置，并将同步守卫改为后端验证管理员令牌。**

~~~astro
---
const apiBase = import.meta.env.VITE_API_BASE_URL || ''
const buildApiBase = import.meta.env.VITE_WORKER_URL || 'https://alumni-book.pages.dev'
let siteConfig = {
  identity: { siteName: '同学录', className: '', classYear: '', shareDescription: '同学录 · 青春回忆' },
  footer: { copyright: '同学录 · 青春回忆' },
}
try {
  const response = await fetch(buildApiBase + '/api/config')
  if (response.ok) siteConfig = { ...siteConfig, ...(await response.json()).data }
} catch {}
const classLabel = [siteConfig.identity.className, siteConfig.identity.classYear].filter(Boolean).join(' · ')
const footerText = [classLabel, siteConfig.footer.copyright].filter(Boolean).join(' · ') || '同学录 · 青春回忆'
---
<script define:vars={{ apiBase }}>
  (async function () {
    document.documentElement.classList.add('js')
    const path = window.location.pathname
    const isHome = path === '/' || path.endsWith('/index.html') || path.endsWith('/alumni-book-v2/')
    const isExempt = isHome || path.includes('/admin/') || path.includes('/404')
    if (!isExempt && !sessionStorage.getItem('classmate_account_token')) {
      const adminToken = sessionStorage.getItem('admin_token')
      if (adminToken) {
        try {
          const response = await fetch(apiBase + '/api/auth/verify', { headers: { Authorization: 'Bearer ' + adminToken } })
          if (response.ok) return
        } catch {}
      }
      window.location.replace(path.includes('/alumni-book-v2/') ? '/alumni-book-v2/' : '/')
    }
  })()
</script>
~~~

- [ ] **Step 3: 在同一布局中同时输出构建期元信息和运行时更新逻辑。**

~~~ts
fetch(apiBase + '/api/config')
  .then((response) => response.ok ? response.json() : null)
  .then((payload) => {
    const config = payload?.data
    const identity = config?.identity
    if (!identity) return
    if (identity.siteName) document.title = identity.siteName
    const description = document.querySelector('meta[name="description"]')
    if (description && identity.shareDescription) description.setAttribute('content', identity.shareDescription)
    const footer = document.querySelector('[data-site-footer]')
    if (footer) {
      const classLabel = [identity.className, identity.classYear].filter(Boolean).join(' · ')
      footer.textContent = [classLabel, config.footer?.copyright].filter(Boolean).join(' · ') || '同学录 · 青春回忆'
    }
  })
  .catch(() => undefined)
~~~

在 head 内输出：

~~~astro
<title>{siteConfig.identity.siteName || '同学录'}</title>
<meta name="description" content={siteConfig.identity.shareDescription || '同学录 · 青春回忆'} />
~~~

将 AppFooter 改为接收 initialText 属性：

~~~astro
---
interface Props { initialText?: string }
const { initialText = '同学录 · 青春回忆' } = Astro.props
---
<p class="footer-text" data-site-footer>{initialText}</p>
~~~

在 MainLayout 以 <AppFooter initialText={footerText} /> 传入构建期页脚；保留脚本中的 fetch，使后台保存后的后续页面访问可以同步客户端标题、摘要和页脚。构建时使用 VITE_WORKER_URL，因此下一次站点构建生成的社交元信息也会使用最新设置。

- [ ] **Step 4: 运行站点验证。**

Run: pnpm --filter site-astro typecheck && pnpm --filter site-astro test:with-build

Expected: PASS。

- [ ] **Step 5: 提交公开站点改动。**

~~~bash
git add packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/components/AppFooter.astro packages/site-astro/tests/classmate-auth-static.test.ts
git commit -m "feat: allow verified admin previews on public site"
~~~

### Task 7: 执行完整验证和手动冒烟

**Files:**

- Modify: 无
- Test: 前述所有测试文件

- [ ] **Step 1: 运行仓库完整验证。**

Run: pnpm verify:all

Expected: Worker、后台和站点的测试、类型检查和构建均 PASS。

- [ ] **Step 2: 对最终差异运行空白检查。**

Run: git diff --check HEAD~6..HEAD

Expected: 无输出。

- [ ] **Step 3: 在本地管理员会话进行受限冒烟。**

~~~text
1. 在相册上传弹窗分别点击选择和拖入两张图片，确认均上传成功。
2. 在时光轴拖动两个同日期事件，刷新后确认顺序不变；将日期改至另一组后确认不能跨组拖动。
3. 从学生管理点击预览，确认有效管理员不被重定向；注销后同一 URL 回首页。
4. 删除一条历史公共投稿，确认原因必填、列表移除，日志显示中文动作与原因。
5. 打开工作台，确认个人留言仍是待办，公共群聊显示为今日运营统计。
~~~

- [ ] **Step 4: 检查最终工作区。**

Run: git status --short

Expected: 为空；所有实现和测试已由前述任务提交。

- [ ] **Step 5: 仅在手动冒烟发现问题时，先为问题写失败测试，再以最小改动修正并重复本任务的 Step 1 至 Step 4。**
