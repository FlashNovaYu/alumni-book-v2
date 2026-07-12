# 全面代码审查与稳定化整改实施计划

> **面向执行代理：** 必须使用 `executing-plans` 技能逐项执行本计划。每一步使用复选框跟踪；所有生产代码修改必须遵循测试先行。

**目标：** 在保持现有产品能力和明确确认的群聊滚动穿透行为不变的前提下，修复审查发现的问题，移除 GSAP 与无引用大型依赖，降低 Worker 查询成本，并让全部现有测试真正进入默认质量门禁。

**架构：** 整改按“契约保护 → 最小实现 → 局部验证”分为部署/滚动、安全、数据权限、后台治理、共享工具、依赖清理和完整门禁七个独立批次。Worker 新增纯函数模块表达 viewer 到 audience 的映射，公开站点继续使用 Vue、Astro 原生 View Transitions、CSS 动画和浏览器 IntersectionObserver，不引入新的动画库。

**技术栈：** pnpm workspace、Astro 5、Vue 3、TypeScript、Hono、Cloudflare Workers/D1/R2、Vitest、Playwright、CSS Animations。

---

## 文件职责与变更地图

- `packages/site-astro/tests/chat-rework-static.test.ts`：群聊滚动穿透与历史加载静态契约。
- `packages/site-astro/tests/deployment-safety-static.test.ts`：本地准备脚本不得发布生产的契约。
- `packages/site-astro/tests/security-hardening-static.test.ts`：前言、时光轴、iframe 与依赖边界的安全契约。
- `packages/site-astro/tests/student-profile-lifecycle.test.ts`：专属模板文件 URL 与照片墙生命周期契约。
- `packages/site-astro/tests/animation-ownership.test.ts`：GSAP、React 示例和动画所有权契约。
- `packages/site-astro/src/components/GroupChatStage.vue`：原生嵌套滚动与群聊视图。
- `scripts/prepare-pages-deploy.mjs`：只生成统一 Pages 部署目录，不执行发布。
- `packages/site-astro/src/components/PrefaceWall.vue`：纯文本前言渲染。
- `packages/site-astro/src/pages/timeline.astro`：安全嵌入时光轴初始 JSON。
- `packages/site-astro/src/components/StudentProfile.vue`：iframe 权限与专属模板 URL 替换。
- `workers/api/src/lib/studentAudience.ts`：viewer、audience 与资料过滤的纯函数边界。
- `workers/api/src/index.ts`：每次请求只解析一次 viewer，并复用过滤函数。
- `workers/api/tests/student-audience.test.ts`：纯 audience 映射和隐私过滤测试。
- `workers/api/tests/security.test.ts`：真实 API audience 响应测试。
- `packages/admin/src/views/MessagesView.vue`：历史投稿完整治理操作。
- `packages/admin/tests/permissions-static.test.mjs`：后台权限感知治理契约。
- `packages/shared/src/utils.ts`、`packages/shared/src/index.ts`：移除无消费者的 Vite 专属 API 客户端。
- `packages/admin/src/components/CalendarDatePicker.vue`、`packages/site-astro/src/components/CalendarDatePicker.vue`：只读日期组件，删除不可达手输逻辑。
- `packages/site-astro/src/components/PhotoWall.vue`：CSS stagger 动画和灯箱。
- `packages/site-astro/src/components/ui/*`、`packages/site-astro/src/utils/cn.ts`：删除无入口的 React 示例死代码。
- 根与各包 `package.json`、`pnpm-lock.yaml`：质量门禁与依赖收敛。

### 任务 1：保护群聊滚动穿透与生产部署边界

**文件：**
- 修改：`packages/site-astro/tests/chat-rework-static.test.ts`
- 修改：`packages/site-astro/tests/deployment-safety-static.test.ts`
- 修改：`packages/site-astro/src/components/GroupChatStage.vue`
- 修改：`scripts/prepare-pages-deploy.mjs`

- [ ] **步骤 1：先把群聊测试改成用户确认的穿透契约**

将原先要求 `overscroll-behavior-y: contain` 的断言替换为：

```ts
expect(stage).toMatch(/\.chat-log\s*\{[^}]*overscroll-behavior-y:\s*auto;/)
expect(stage).toMatch(/\.chat-log\s*\{[^}]*touch-action:\s*pan-y;/)
expect(stage).not.toContain("addEventListener('wheel'")
expect(stage).not.toContain("addEventListener('touchmove'")
expect(stage).not.toContain('window.scrollBy')
```

- [ ] **步骤 2：为准备脚本补充失败关闭契约**

在 `deployment-safety-static.test.ts` 新增：

```ts
it('Pages 准备脚本只准备产物且发现旧 Worker 域名立即失败', () => {
  const prepare = read('scripts/prepare-pages-deploy.mjs')

  expect(prepare).toContain('throw new Error(`生产产物仍包含公开 Worker 地址：${file}`)')
  expect(prepare).not.toContain('replaceAll(')
  expect(prepare).not.toContain("'pages', 'deploy'")
  expect(prepare).not.toContain("'--branch', 'main'")
  expect(prepare).not.toContain("'--commit-dirty=true'")
})
```

- [ ] **步骤 3：运行两个测试并确认因当前实现失败**

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/chat-rework-static.test.ts tests/deployment-safety-static.test.ts
```

预期：至少两项失败；群聊仍包含手工 wheel/touch 转发，准备脚本仍自动替换并调用 Pages deploy。

- [ ] **步骤 4：删除群聊手工滚动转发，只保留原生 CSS 穿透**

从 `GroupChatStage.vue` 删除 `lastTouchY`、`handleWheel`、`handleTouchStart`、`handleTouchMove`，并删除挂载/卸载中的三个原生监听器。保留：

```css
.chat-log {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  height: clamp(360px, 52vh, 540px);
  overflow-y: auto;
  overscroll-behavior-y: auto;
  touch-action: pan-y;
}
```

- [ ] **步骤 5：恢复准备脚本的失败关闭行为**

将扫描逻辑恢复为：

```js
if (readFileSync(file, 'utf8').includes(forbiddenHost)) {
  throw new Error(`生产产物仍包含公开 Worker 地址：${file}`)
}
```

删除文件末尾的 `wrangler pages deploy` 调用和发布日志；同步删除不再使用的 `writeFileSync` import。

- [ ] **步骤 6：运行测试确认通过**

运行同步骤 3；预期两个测试文件全部通过。

- [ ] **步骤 7：检查该批次差异**

```powershell
git diff --check -- packages/site-astro/src/components/GroupChatStage.vue scripts/prepare-pages-deploy.mjs packages/site-astro/tests/chat-rework-static.test.ts packages/site-astro/tests/deployment-safety-static.test.ts
```

预期：无空白错误，且不修改群聊数据流函数。

- [ ] **步骤 8：提交滚动与部署边界修复**

```powershell
git add packages/site-astro/tests/chat-rework-static.test.ts packages/site-astro/tests/deployment-safety-static.test.ts packages/site-astro/src/components/GroupChatStage.vue scripts/prepare-pages-deploy.mjs
git commit -m "fix: preserve native chat scrolling and deployment guard"
```

### 任务 2：关闭前端 XSS 与 iframe 同源能力

**文件：**
- 创建：`packages/site-astro/tests/security-hardening-static.test.ts`
- 修改：`packages/site-astro/src/components/PrefaceWall.vue`
- 修改：`packages/site-astro/src/pages/timeline.astro`
- 修改：`packages/site-astro/src/components/StudentProfile.vue`

- [ ] **步骤 1：创建失败的前端安全契约**

创建测试：

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = (path: string) => readFileSync(resolve(__dirname, '../src', path), 'utf8')

describe('公开站点 HTML 注入边界', () => {
  it('前言以文本渲染并用 CSS 保留换行', () => {
    const source = src('components/PrefaceWall.vue')
    expect(source).toContain('<p class="preface-content">{{ prefaceContent }}</p>')
    expect(source).toContain('white-space: pre-line')
    expect(source).not.toContain('v-html')
  })

  it('时光轴安全序列化内联 JSON', () => {
    const source = src('pages/timeline.astro')
    expect(source).toContain('function serializeForHtmlScript')
    expect(source).toContain("'<': '\\\\u003c'")
    expect(source).toContain('set:html={serializedItems}')
    expect(source).not.toContain('set:html={JSON.stringify(items)}')
  })

  it('专属模板允许脚本但不拥有同源权限', () => {
    const source = src('components/StudentProfile.vue')
    expect(source).toContain('sandbox="allow-scripts"')
    expect(source).not.toContain('allow-same-origin')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

```powershell
pnpm --filter site-astro exec vitest run tests/security-hardening-static.test.ts
```

预期：三项均失败。

- [ ] **步骤 3：把前言改成纯文本**

模板与脚本改为：

```vue
<p class="preface-content">{{ prefaceContent }}</p>
```

```ts
const prefaceContent = computed(() => config.value.preface?.content || '')
```

样式加入：

```css
.preface-content {
  white-space: pre-line;
}
```

- [ ] **步骤 4：安全序列化时光轴初始数据**

在 Astro frontmatter 中增加：

```ts
function serializeForHtmlScript(value: unknown) {
  const escaped: Record<string, string> = {
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
  }
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => escaped[character])
}

const serializedItems = serializeForHtmlScript(items)
```

并改为：

```astro
<script id="timeline-data" type="application/json" set:html={serializedItems}></script>
```

- [ ] **步骤 5：收紧 iframe sandbox**

```vue
sandbox="allow-scripts"
```

- [ ] **步骤 6：运行安全测试和现有隐私测试**

```powershell
pnpm --filter site-astro exec vitest run tests/security-hardening-static.test.ts tests/privacy-static.test.ts tests/student-profile-lifecycle.test.ts
```

预期：全部通过。

- [ ] **步骤 7：提交前端安全边界修复**

```powershell
git add packages/site-astro/tests/security-hardening-static.test.ts packages/site-astro/src/components/PrefaceWall.vue packages/site-astro/src/pages/timeline.astro packages/site-astro/src/components/StudentProfile.vue
git commit -m "fix: harden public HTML rendering boundaries"
```

### 任务 3：数据 audience 模块化、隐私过滤与 N+1 消除

**文件：**
- 创建：`workers/api/src/lib/studentAudience.ts`
- 创建：`workers/api/tests/student-audience.test.ts`
- 修改：`workers/api/src/index.ts`
- 修改：`workers/api/tests/security.test.ts`

- [ ] **步骤 1：先写纯 audience 失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { audienceForStudent, filterStudentForAudience } from '../src/lib/studentAudience'

describe('student audience', () => {
  it('根据一次解析的 viewer 推导每名学生的 audience', () => {
    expect(audienceForStudent({ kind: 'public' }, 'alice')).toBe('public')
    expect(audienceForStudent({ kind: 'admin' }, 'alice')).toBe('admin')
    expect(audienceForStudent({ kind: 'classmate', slug: 'alice' }, 'alice')).toBe('owner')
    expect(audienceForStudent({ kind: 'classmate', slug: 'bob' }, 'alice')).toBe('classmates')
  })

  it('只向本人和管理员返回账号内部元数据', () => {
    const student = {
      slug: 'alice',
      accountStatus: 'active',
      accountLastLoginAt: '2026-07-12 12:00:00',
      info: { phone: '1', visibility: { phone: 'classmates' } },
    }
    expect(filterStudentForAudience(student, 'public')).not.toHaveProperty('accountStatus')
    expect(filterStudentForAudience(student, 'classmates')).not.toHaveProperty('accountLastLoginAt')
    expect(filterStudentForAudience(student, 'owner')).toMatchObject({ accountStatus: 'active' })
    expect(filterStudentForAudience(student, 'admin')).toMatchObject({ accountLastLoginAt: '2026-07-12 12:00:00' })
  })
})
```

- [ ] **步骤 2：扩展真实 API 隐私测试**

在现有匿名与同学 token 用例中加入：

```ts
expect(pubData.data.accountStatus).toBeUndefined()
expect(pubData.data.accountLastLoginAt).toBeUndefined()
expect(lisiData.data.accountStatus).toBeUndefined()
expect(lisiData.data.accountLastLoginAt).toBeUndefined()
expect(ownerData.data.accountStatus).toBeDefined()
```

- [ ] **步骤 3：运行测试确认模块尚不存在**

```powershell
pnpm --filter worker exec vitest run tests/student-audience.test.ts tests/security.test.ts
```

预期：新测试因模块不存在而失败；API 新断言也失败。

- [ ] **步骤 4：创建纯 audience 模块**

```ts
export type StudentViewer =
  | { kind: 'public' }
  | { kind: 'admin' }
  | { kind: 'classmate'; slug: string }

export type StudentAudience = 'public' | 'classmates' | 'owner' | 'admin'

export function audienceForStudent(viewer: StudentViewer, studentSlug: string): StudentAudience {
  if (viewer.kind === 'admin') return 'admin'
  if (viewer.kind === 'classmate') return viewer.slug === studentSlug ? 'owner' : 'classmates'
  return 'public'
}

export function filterStudentForAudience<T extends { info?: Record<string, unknown> }>(
  student: T,
  audience: StudentAudience,
) {
  const info = { ...(student.info || {}) }
  const visibility = (info.visibility || {}) as Record<string, string>
  for (const key of ['qq', 'wechat', 'phone', 'email', 'address', 'weibo']) {
    const level = visibility[key] || 'classmates'
    if (level === 'owner' && audience !== 'owner' && audience !== 'admin') delete info[key]
    if (level === 'hidden' && audience !== 'admin') delete info[key]
    if (level === 'classmates' && audience === 'public') delete info[key]
  }

  const filtered: Record<string, unknown> = { ...student, info }
  if (audience === 'public' || audience === 'classmates') {
    delete filtered.accountStatus
    delete filtered.accountLastLoginAt
  }
  return filtered
}
```

- [ ] **步骤 5：在 Worker 中每次请求只解析一次 viewer**

新增：

```ts
async function resolveStudentViewer(c: any): Promise<StudentViewer> {
  const adminToken = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
  if (adminToken) {
    try {
      const session = await c.env.DB.prepare(
        `SELECT admin_account_id FROM admin_sessions
         WHERE token = ? AND revoked_at IS NULL AND julianday(expires_at) > julianday('now')`
      ).bind(adminToken).first() as { admin_account_id: string } | null
      const admin = session ? await loadActiveAdmin(c.env.DB, session.admin_account_id) : null
      if (admin && !admin.mustChangePassword && hasPermission(admin, 'students.manage')) return { kind: 'admin' }
    } catch {}
  }

  const classmateToken = c.req.header('X-Classmate-Token')
  if (classmateToken) {
    const slug = await verifyClassmateSession(c.env.DB, classmateToken)
    if (slug) return { kind: 'classmate', slug }
  }
  return { kind: 'public' }
}
```

列表路由改为：

```ts
const viewer = await resolveStudentViewer(c)
const students = (results || [])
  .map(formatStudent)
  .map(student => filterStudentForAudience(student, audienceForStudent(viewer, student.slug)))
```

单学生路由同样只调用一次 `resolveStudentViewer`。删除旧 `determineAudience` 和内联 `filterStudentForAudience`。

- [ ] **步骤 6：运行 Worker 相关测试和类型检查**

```powershell
pnpm --filter worker exec vitest run tests/student-audience.test.ts tests/security.test.ts tests/api.test.ts
pnpm --filter worker exec tsc --noEmit
```

预期：全部通过。

- [ ] **步骤 7：提交 viewer 解析与隐私过滤修复**

```powershell
git add workers/api/src/lib/studentAudience.ts workers/api/src/index.ts workers/api/tests/student-audience.test.ts workers/api/tests/security.test.ts
git commit -m "fix: resolve student audience once per request"
```

### 任务 4：恢复后台历史投稿治理能力

**文件：**
- 修改：`packages/admin/src/views/MessagesView.vue`
- 验证：`packages/admin/tests/permissions-static.test.mjs`

- [ ] **步骤 1：确认现有契约失败**

```powershell
pnpm --filter admin test:static
```

预期：`permissions-static.test.mjs` 因缺少 `togglePublicHide` 等函数失败。

- [ ] **步骤 2：扩充历史投稿类型与展示**

```ts
interface LegacyMessage {
  id: string
  authorSlug: string
  authorName: string
  content: string
  status: 'pending' | 'approved' | 'rejected' | 'hidden'
  reviewReason?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  featured: boolean
  pinned: boolean
  createdAt: string
}
```

模板加入审核人、置顶/精选状态和操作按钮：

```vue
<span v-if="message.reviewedBy">审核人：{{ message.reviewedBy }}</span>
<button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="togglePublicPin(message.id, !message.pinned)">{{ message.pinned ? '取消置顶' : '置顶' }}</button>
<button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="togglePublicFeature(message.id, !message.featured)">{{ message.featured ? '取消精选' : '精选' }}</button>
<button v-if="canManage && message.status !== 'pending'" class="btn-secondary btn-sm" :disabled="processing" @click="togglePublicHide(message.id, message.status !== 'hidden')">{{ message.status === 'hidden' ? '恢复' : '隐藏' }}</button>
<button v-if="canManage" class="btn-danger btn-sm" :disabled="processing" @click="removePublic(message.id)">删除</button>
```

- [ ] **步骤 3：实现四个最小操作函数**

```ts
async function togglePublicHide(id: string, hidden: boolean) {
  const reason = hidden ? window.prompt('请输入隐藏原因：')?.trim() : ''
  if (hidden && !reason) return
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/hide`, { method: 'PUT', body: JSON.stringify({ hidden, reason }) })
    const item = legacyMessages.value.find(message => message.id === id)
    if (item) item.status = hidden ? 'hidden' : 'approved'
    showToast('success', hidden ? '已隐藏' : '已恢复')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '操作失败')
  } finally { processing.value = false }
}

async function togglePublicPin(id: string, pinned: boolean) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) })
    const item = legacyMessages.value.find(message => message.id === id)
    if (item) item.pinned = pinned
    showToast('success', pinned ? '已置顶' : '已取消置顶')
  } catch (error) { showToast('error', error instanceof Error ? error.message : '操作失败') }
  finally { processing.value = false }
}

async function togglePublicFeature(id: string, featured: boolean) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/feature`, { method: 'PUT', body: JSON.stringify({ featured }) })
    const item = legacyMessages.value.find(message => message.id === id)
    if (item) item.featured = featured
    showToast('success', featured ? '已精选' : '已取消精选')
  } catch (error) { showToast('error', error instanceof Error ? error.message : '操作失败') }
  finally { processing.value = false }
}

async function removePublic(id: string) {
  const reason = window.prompt('请输入删除原因：')?.trim()
  if (!reason) return
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) })
    legacyMessages.value = legacyMessages.value.filter(message => message.id !== id)
    showToast('success', '历史投稿已删除')
  } catch (error) { showToast('error', error instanceof Error ? error.message : '删除失败') }
  finally { processing.value = false }
}
```

删除被 `removePublic` 取代的 `removeLegacy`，避免两个删除入口。

- [ ] **步骤 4：运行后台测试、类型检查与构建**

```powershell
pnpm --filter admin test:static
pnpm --filter admin test
pnpm --filter admin typecheck
pnpm --filter admin build
```

预期：全部通过。

- [ ] **步骤 5：提交后台治理恢复**

```powershell
git add packages/admin/src/views/MessagesView.vue packages/admin/tests/permissions-static.test.mjs
git commit -m "fix: restore legacy message governance controls"
```

### 任务 5：修复专属模板 URL，精简共享包与日期组件

**文件：**
- 修改：`packages/site-astro/tests/student-profile-lifecycle.test.ts`
- 修改：`packages/site-astro/tests/ui-reliability-static.test.ts`
- 修改：`packages/site-astro/src/components/StudentProfile.vue`
- 修改：`packages/shared/src/utils.ts`
- 修改：`packages/shared/src/index.ts`
- 修改：`packages/admin/src/components/CalendarDatePicker.vue`
- 修改：`packages/site-astro/src/components/CalendarDatePicker.vue`

- [ ] **步骤 1：先补 URL 与只读日期契约**

在 `student-profile-lifecycle.test.ts` 加入：

```ts
expect(profile).toContain("if (value.startsWith('/api/files/')) return joinApiUrl(props.apiBase, value)")
expect(profile).toContain("return joinApiUrl(props.apiBase, `/api/files/${value.replace(/^\\/+/, '')}`)")
```

在 `ui-reliability-static.test.ts` 对两个日期组件加入：

```ts
expect(source).toContain('readonly')
expect(source).not.toContain('@input="handleInput"')
expect(source).not.toContain('@blur="handleBlur"')
expect(source).not.toContain('@keyup.enter="handleEnter"')
expect(source).not.toContain('function validateAndCommitInput')
```

- [ ] **步骤 2：运行测试和共享包类型检查验证失败**

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts tests/ui-reliability-static.test.ts
pnpm --filter @alumni/shared typecheck
```

预期：站点新断言失败；共享包报 `ImportMeta.env` 类型错误。

- [ ] **步骤 3：统一专属模板文件 URL 解析**

导入 `joinApiUrl`，并替换旧 `getPhotoUrl`：

```ts
function resolveFileUrl(value: string) {
  if (!value) return ''
  if (/^https?:\/\//.test(value)) return value
  if (value.startsWith('/api/files/')) return joinApiUrl(props.apiBase, value)
  return joinApiUrl(props.apiBase, `/api/files/${value.replace(/^\/+/, '')}`)
}
```

模板变量使用 `resolveFileUrl`。

- [ ] **步骤 4：删除未使用的共享 apiFetch**

从 `packages/shared/src/utils.ts` 删除 `API_BASE` 与整个 `apiFetch` 函数；`index.ts` 改为：

```ts
export { getSessionName, setSessionName, clearSession, escapeHtml, formatDate, getClassmateToken, setClassmateSession, getClassmateStudent, clearClassmateSession } from './utils'
```

- [ ] **步骤 5：删除日期组件不可达输入逻辑**

两个组件都删除三个模板监听和以下函数：

```ts
function handleInput(e: Event) { /* 删除 */ }
function handleBlur() { /* 删除 */ }
function handleEnter() { /* 删除 */ }
function validateAndCommitInput() { /* 删除 */ }
```

- [ ] **步骤 6：运行局部测试与三个包类型检查**

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts tests/ui-reliability-static.test.ts
pnpm --filter @alumni/shared typecheck
pnpm --filter site-astro typecheck
pnpm --filter admin typecheck
```

预期：全部通过。

- [ ] **步骤 7：提交 URL、共享包与日期组件精简**

```powershell
git add packages/site-astro/tests/student-profile-lifecycle.test.ts packages/site-astro/tests/ui-reliability-static.test.ts packages/site-astro/src/components/StudentProfile.vue packages/shared/src/utils.ts packages/shared/src/index.ts packages/admin/src/components/CalendarDatePicker.vue packages/admin/src/views/StudentEditView.vue packages/site-astro/src/components/CalendarDatePicker.vue packages/site-astro/src/components/SelfEditPanel.vue
git commit -m "refactor: simplify shared and date utilities"
```

### 任务 6：用 CSS 替代 GSAP，并删除无引用 React 示例依赖

**文件：**
- 修改：`packages/site-astro/tests/animation-ownership.test.ts`
- 修改：`packages/site-astro/src/components/PhotoWall.vue`
- 删除：`packages/site-astro/src/components/ui/tubelight-navbar.tsx`
- 删除：`packages/site-astro/src/components/ui/demo.tsx`
- 删除：`packages/site-astro/src/utils/cn.ts`
- 修改：`packages/site-astro/package.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：先扩展依赖与源码契约**

在 `animation-ownership.test.ts` 加入：

```ts
it('全仓站点运行时不再依赖 GSAP 或闲置 React 导航示例', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(siteRoot, '../package.json'), 'utf8'))
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const name of ['gsap', 'framer-motion', 'lucide-react', 'lucide-vue-next', 'react', 'react-dom', '@types/react', '@types/react-dom', 'clsx', 'tailwind-merge']) {
    expect(dependencies[name]).toBeUndefined()
  }
  expect(fs.existsSync(path.join(siteRoot, 'components/ui/tubelight-navbar.tsx'))).toBe(false)
  expect(fs.existsSync(path.join(siteRoot, 'components/ui/demo.tsx'))).toBe(false)
  expect(fs.existsSync(path.join(siteRoot, 'utils/cn.ts'))).toBe(false)
  const photoWall = read('components/PhotoWall.vue')
  expect(photoWall).not.toContain("import('gsap')")
  expect(photoWall).toContain('@keyframes photo-item-enter')
  expect(photoWall).toContain('prefers-reduced-motion: reduce')
})
```

- [ ] **步骤 2：运行测试验证失败**

```powershell
pnpm --filter site-astro exec vitest run tests/animation-ownership.test.ts
```

预期：依赖、死文件和照片墙 GSAP 断言失败。

- [ ] **步骤 3：把照片墙入场改为 CSS stagger**

模板根项改为：

```vue
<div
  v-for="(photo, idx) in photos"
  :key="photo"
  class="photo-item"
  :style="{ '--photo-index': idx }"
  @click="openLightbox(idx)"
>
```

删除 `photoWallRoot`、`gsapCtx`、`disposed` 和动态 import；挂载只保留：

```ts
onMounted(() => { isMounted.value = true })
```

加入：

```css
.photo-item {
  animation: photo-item-enter 450ms var(--ease-out-quart) both;
  animation-delay: min(calc(var(--photo-index) * 80ms), 480ms);
}

@keyframes photo-item-enter {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .photo-item { animation: none; }
}
```

- [ ] **步骤 4：删除死文件与依赖**

用补丁删除三个无引用文件，然后运行：

```powershell
pnpm --filter site-astro remove gsap framer-motion lucide-react lucide-vue-next react react-dom clsx tailwind-merge
pnpm --filter site-astro remove --save-dev '@types/react' '@types/react-dom'
```

- [ ] **步骤 5：验证源码、清单与锁文件无 GSAP**

```powershell
rg -n "gsap@|\bgsap\b|ScrollTrigger" packages/site-astro/src packages/site-astro/package.json pnpm-lock.yaml
```

预期：命令退出码 1（无匹配）。测试与性能审计文案中的禁止词不在该搜索范围。

- [ ] **步骤 6：运行动画、生命周期、类型和构建测试**

```powershell
pnpm --filter site-astro exec vitest run tests/animation-ownership.test.ts tests/student-profile-lifecycle.test.ts tests/performance-static.test.ts
pnpm --filter site-astro typecheck
pnpm --filter site-astro build
node scripts/perf-budget.mjs
```

预期：全部通过，构建产物不生成 GSAP、React 或 Framer Motion chunk。

- [ ] **步骤 7：提交动画依赖清理**

```powershell
git add packages/site-astro/tests/animation-ownership.test.ts packages/site-astro/src/components/PhotoWall.vue packages/site-astro/package.json pnpm-lock.yaml
git add -u packages/site-astro/src/components/ui packages/site-astro/src/utils/cn.ts
git commit -m "perf: replace GSAP with native CSS motion"
```

### 任务 7：补齐默认质量门禁并升级兼容安全补丁

**文件：**
- 修改：`package.json`
- 修改：`packages/admin/package.json`
- 修改：`packages/site-astro/package.json`
- 修改：`packages/site-astro/tests/ui-reliability-static.test.ts`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：先让质量门禁测试要求完整脚本**

在 `ui-reliability-static.test.ts` 加入：

```ts
it('默认质量门禁包含共享类型和所有现有站点测试', () => {
  const root = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'))
  const site = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
  const admin = JSON.parse(readFileSync(resolve(__dirname, '../../admin/package.json'), 'utf8'))

  expect(root.scripts['verify:all']).toContain('verify:shared')
  expect(admin.scripts.test).toContain('test:static')
  for (const file of ['museum-viewmodels.test.ts', 'public-ui-feedback-static.test.ts', 'security-hardening-static.test.ts']) {
    expect(site.scripts.test).toContain(file)
  }
  for (const file of ['navigation-marker-direction.spec.ts', 'roster-pagination.spec.ts']) {
    expect(site.scripts['test:perf-network']).toContain(file)
  }
})
```

- [ ] **步骤 2：运行测试验证脚本当前不完整**

```powershell
pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts
```

预期：新用例失败。

- [ ] **步骤 3：补齐根、后台和站点脚本**

根脚本加入：

```json
"verify:shared": "pnpm --filter @alumni/shared typecheck",
"verify:all": "pnpm verify:worker && pnpm verify:shared && pnpm verify:admin && pnpm verify:site"
```

后台 `test` 在开头加入：

```json
"test": "pnpm run test:static && node tests/community-static.mjs && node tests/network-integration-static.mjs && pnpm run test:network && tsx --test tests/audit-summary.test.ts"
```

站点显式列表加入三个 Vitest 和两个 Playwright 文件。

- [ ] **步骤 4：升级兼容补丁依赖**

```powershell
pnpm --filter worker up hono@^4.12.29
pnpm --filter site-astro up hono@^4.12.29
pnpm --filter admin up --save-dev vite@^6.4.3
```

不运行 `pnpm audit --fix --force`，不升级 Astro 主版本。

- [ ] **步骤 5：运行脚本契约和依赖审计**

```powershell
pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts
pnpm audit --prod --audit-level high
```

预期：脚本契约通过；高危结果只剩需要 Astro 6 的 Astro 公告，不再包含 Hono 或 Vite。

- [ ] **步骤 6：提交质量门禁与补丁依赖更新**

```powershell
git add package.json packages/admin/package.json packages/site-astro/package.json packages/site-astro/tests/ui-reliability-static.test.ts workers/api/package.json pnpm-lock.yaml
git commit -m "test: run complete workspace quality gates"
```

### 任务 8：完整验证、性能复测与最终审查

**文件：**
- 不新增生产文件；仅验证当前工作树。

- [ ] **步骤 1：运行完整质量门禁**

```powershell
pnpm verify:all
```

预期：Worker、共享包、后台、站点静态和全部 Playwright 测试通过。

- [ ] **步骤 2：运行 Pages 准备验证但禁止部署**

```powershell
pnpm prepare:pages
```

预期：只生成 `deploy/`，输出 `Pages deployment prepared`，不出现 `Deploying to Cloudflare Pages`。

- [ ] **步骤 3：验证依赖与构建产物**

```powershell
rg -n "gsap@|framer-motion@|react-dom@" pnpm-lock.yaml
Get-ChildItem packages/site-astro/dist/assets -File | Where-Object { $_.Name -match 'gsap|scrolltrigger|framer|react' }
node scripts/perf-budget.mjs
```

预期：前两项无匹配；性能预算全部通过。

- [ ] **步骤 4：重新采样首页性能**

启动本地预览，通过 Chrome DevTools 冷启动 trace 记录 LCP 与 CLS。验收阈值：LCP 小于 2.5 秒、CLS 小于 0.1；同时与审查基线 216ms/0 比较并解释本机波动，不以单次微小差异判定退化。

- [ ] **步骤 5：做最终差异审查**

```powershell
git diff --check
git diff --stat HEAD~1
git status --short
```

逐项核对设计文档十个章节；确认空文件 `{` 未被修改，且没有覆盖任务外用户改动。

- [ ] **步骤 6：记录剩余风险**

最终交付明确说明：Astro 5 的两项高危公告需要独立主版本迁移；旧版 `admin888` 初始化兼容仍保留；其余已确认问题均有测试证据。
