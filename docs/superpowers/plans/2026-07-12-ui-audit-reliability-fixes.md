# UI 审计可靠性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 修复已审计到的鉴权反馈、上传格式、头像、内容边界、导航与无障碍缺陷，并让组合验证可重复运行。

**Architecture:** 前台私有 API 将 401 归一化为会话失效，统一清理缓存并跳回登录入口。Worker 以共享图片签名函数验证两个上传入口；前端对历史坏资源使用首字降级。页面以局部 CSS 截断处理异常内容，保持完整内容仍可在管理详情中查看。

**Tech Stack:** Astro 5、Vue 3、TypeScript、Hono、Cloudflare Workers、Vitest、Playwright。

---

## 文件结构

- 新建 packages/site-astro/src/api/classmateSession.ts：处理同学会话 401。
- 新建 workers/api/src/lib/imageValidation.ts：检测 JPEG、PNG、GIF、WebP 签名并返回规范 MIME/扩展名。
- 新建 workers/api/tests/image-validation.test.ts：验证伪装 HEIC 被拒绝。
- 新建 packages/site-astro/tests/ui-reliability-static.test.ts：覆盖前台/后台源文件约束。
- 修改前台 API、导航、页面和组件：接入会话处理、头像降级、hydration、内容和无障碍修复。
- 修改 Worker 两个上传路由：写入 R2 前先验证图片内容。
- 修改后台仪表盘、学生列表、设置、侧栏和根验证脚本。

### Task 1: 同学会话失效

**Files:**

- Create: packages/site-astro/src/api/classmateSession.ts
- Modify: packages/site-astro/src/api/classSpace.ts
- Modify: packages/site-astro/src/api/postOffice.ts
- Modify: packages/site-astro/src/components/MailboxApp.vue
- Test: packages/site-astro/tests/ui-reliability-static.test.ts

- [ ] **Step 1: 写失败测试**

    it('sends the classmate token to class-space and handles 401 through one helper', () => {
      expect(read('api/classSpace.ts')).toContain("'X-Classmate-Token'")
      expect(read('api/classSpace.ts')).toContain('handleClassmateUnauthorized')
      expect(read('api/postOffice.ts')).toContain('handleClassmateUnauthorized')
      expect(read('components/MailboxApp.vue')).toContain('登录已失效，请重新登录')
    })

- [ ] **Step 2: 确认红灯**

Run: pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts

Expected: FAIL；当前 class-space 请求没有鉴权头，私有邮局接口也会把 401 解析为假空数据。

- [ ] **Step 3: 最小实现**

    // src/api/classmateSession.ts
    import { clearClassmateSession } from '@alumni/shared'

    export const SESSION_EXPIRED_MESSAGE = '登录已失效，请重新登录'

    export function handleClassmateUnauthorized(): never {
      clearClassmateSession()
      if (typeof window !== 'undefined') window.location.assign(import.meta.env.BASE_URL || '/')
      throw new Error(SESSION_EXPIRED_MESSAGE)
    }

classSpace.ts 使用 getClassmateToken() 附加 X-Classmate-Token；postOffice.ts 的读取与写入接口均在明确 401 时调用该函数。Mailbox catch 显示该错误，不再保留空收件箱假象。

- [ ] **Step 4: 确认绿灯**

Run: pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts

Expected: PASS。

- [ ] **Step 5: 提交**

    git add packages/site-astro/src/api/classmateSession.ts packages/site-astro/src/api/classSpace.ts packages/site-astro/src/api/postOffice.ts packages/site-astro/src/components/MailboxApp.vue packages/site-astro/tests/ui-reliability-static.test.ts
    git commit -m "fix: handle expired classmate sessions consistently"

### Task 2: 上传图片签名验证

**Files:**

- Create: workers/api/src/lib/imageValidation.ts
- Create: workers/api/tests/image-validation.test.ts
- Modify: workers/api/src/routes/upload.ts
- Modify: workers/api/src/routes/classmate.ts

- [ ] **Step 1: 写失败测试**

    it('rejects HEIC bytes mislabeled as PNG', () => {
      const heic = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
      expect(validateImageUpload('image/png', 'portrait.png', heic)).toEqual({
        ok: false, message: '图片内容与文件格式不一致'
      })
    })

    it('returns a canonical PNG extension', () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(validateImageUpload('image/png', 'portrait.any', png)).toEqual({
        ok: true, mime: 'image/png', extension: 'png'
      })
    })

- [ ] **Step 2: 确认红灯**

Run: pnpm --filter worker exec vitest run tests/image-validation.test.ts

Expected: FAIL；验证模块不存在。

- [ ] **Step 3: 最小实现**

实现 detectImageFormat(bytes)，仅识别 PNG 的 8 字节签名、JPEG 的 FF D8 FF、GIF87a/GIF89a、以及 RIFF/WEBP。两个路由均读取 await file.arrayBuffer()，验证 file.type 与签名一致，成功时用检测结果的 mime 写 httpMetadata.contentType，用检测结果的 extension 生成 R2 key；失败返回 400，且不执行 R2/D1 写入。

- [ ] **Step 4: 确认绿灯**

Run: pnpm --filter worker exec vitest run tests/image-validation.test.ts tests/security.test.ts

Expected: PASS。

- [ ] **Step 5: 提交**

    git add workers/api/src/lib/imageValidation.ts workers/api/src/routes/upload.ts workers/api/src/routes/classmate.ts workers/api/tests/image-validation.test.ts
    git commit -m "fix: validate uploaded image signatures"

### Task 3: 头像降级与 hydration

**Files:**

- Modify: packages/site-astro/src/components/StudentProfile.vue
- Modify: packages/site-astro/src/components/AccountCenter.vue
- Modify: packages/admin/src/views/StudentsView.vue
- Modify: packages/site-astro/src/pages/yearbook.astro
- Modify: packages/site-astro/tests/ui-reliability-static.test.ts

- [ ] **Step 1: 写失败测试**

    it('defers current-owner detection and supplies avatar fallbacks', () => {
      expect(read('components/StudentProfile.vue')).toContain('const isCurrentOwner = ref(false)')
      expect(read('components/StudentProfile.vue')).toContain('isCurrentOwner.value =')
      expect(read('../admin/src/views/StudentsView.vue')).toContain('@error=')
      expect(read('pages/yearbook.astro')).toContain('mate-avatar-char')
      expect(read('pages/yearbook.astro')).toContain('aspect-ratio: 1')
    })

- [ ] **Step 2: 确认红灯**

Run: pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts

Expected: FAIL；当前用户计算发生在 hydration 前，后台/年度册没有坏图降级。

- [ ] **Step 3: 最小实现**

将 isCurrentOwner 改为 ref(false)，在既有 onMounted 第一段读取 getClassmateStudent 并设置 isCurrentOwner.value。后台学生列表维护 avatarFailedIds，图片 @error 后改渲染姓名首字。年度册 img 添加 style="aspect-ratio: 1"，失败时隐藏 img 并显示相邻初始字 span；账号中心采用同一降级模式。

- [ ] **Step 4: 确认绿灯**

Run: pnpm --filter site-astro typecheck && pnpm --filter admin typecheck && pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts tests/student-profile-lifecycle.test.ts

Expected: PASS。

- [ ] **Step 5: 提交**

    git add packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/AccountCenter.vue packages/admin/src/views/StudentsView.vue packages/site-astro/src/pages/yearbook.astro packages/site-astro/tests/ui-reliability-static.test.ts
    git commit -m "fix: stabilize profile hydration and avatar fallbacks"

### Task 4: 内容边界、设置入口与年度册顶部

**Files:**

- Modify: packages/site-astro/src/pages/timeline.astro
- Modify: packages/site-astro/src/pages/yearbook.astro
- Modify: packages/admin/src/views/DashboardView.vue
- Modify: packages/site-astro/tests/ui-reliability-static.test.ts

- [ ] **Step 1: 写失败测试**

    it('bounds long timeline, yearbook and dashboard content', () => {
      expect(read('pages/timeline.astro')).toContain('-webkit-line-clamp: 6')
      expect(read('pages/yearbook.astro')).toContain('-webkit-line-clamp: 8')
      expect(read('../admin/src/views/DashboardView.vue')).toContain('auditAlerts.slice(0, 12)')
      expect(read('pages/yearbook.astro')).toContain('padding-top: calc(var(--nav-height) + var(--spacing-xl))')
    })

    it('uses the registered settings route', () => {
      const dashboard = read('../admin/src/views/DashboardView.vue')
      expect(dashboard).toContain('to="/settings"')
      expect(dashboard).not.toContain('to="/config"')
    })

- [ ] **Step 2: 确认红灯**

Run: pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts

Expected: FAIL；现有异常内容没有上限，设置入口仍指向不存在的路由。

- [ ] **Step 3: 最小实现**

为 .tl-desc 加入 display: -webkit-box、-webkit-box-orient: vertical、-webkit-line-clamp: 6、overflow: hidden；年度册留言正文使用相同结构但上限 8 行。仪表盘渲染 stats.auditAlerts.slice(0, 12)，当总数超过 12 时显示剩余数量。年度册顶部间距改为 calc(var(--nav-height) + var(--spacing-xl))。快捷入口改为 to="/settings"。

- [ ] **Step 4: 确认绿灯**

Run: pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts && pnpm --filter admin typecheck

Expected: PASS。

- [ ] **Step 5: 提交**

    git add packages/site-astro/src/pages/timeline.astro packages/site-astro/src/pages/yearbook.astro packages/admin/src/views/DashboardView.vue packages/site-astro/tests/ui-reliability-static.test.ts
    git commit -m "fix: bound long dashboard and timeline content"

### Task 5: 导航、表单与移动端无障碍

**Files:**

- Modify: packages/site-astro/src/components/TopNav.astro
- Modify: packages/site-astro/src/components/RosterSearch.vue
- Modify: packages/site-astro/src/components/PublicMessageBoard.vue
- Modify: packages/admin/src/views/StudentsView.vue
- Modify: packages/admin/src/views/SettingsView.vue
- Modify: packages/admin/src/views/AdminLayout.vue
- Modify: packages/site-astro/tests/ui-reliability-static.test.ts

- [ ] **Step 1: 写失败测试**

    it('keeps navigation keyboard-accessible and names audited controls', () => {
      const nav = read('components/TopNav.astro')
      expect(nav).toContain("event.key === 'Escape'")
      expect(nav).toContain('.nav-dropdown:focus-within .dropdown-menu')
      expect(read('components/RosterSearch.vue')).toContain('aria-label="搜索同学"')
      expect(read('components/PublicMessageBoard.vue')).toContain('aria-label="公共留言内容"')
      expect(read('../admin/src/views/AdminLayout.vue')).toContain('aria-label="控制台"')
    })

- [ ] **Step 2: 确认红灯**

Run: pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts

Expected: FAIL；当前下拉菜单只依赖 hover，控件与移动导航缺少可访问名称。

- [ ] **Step 3: 最小实现**

TopNav 在初始化脚本维护菜单开关：Click、Enter、Space 打开/关闭，Escape 与点击外部关闭，并同步 aria-expanded。CSS 添加 .nav-dropdown:focus-within .dropdown-menu、.nav-dropdown.is-open .dropdown-menu 的显示规则。移动菜单与关闭按钮均设为 44px 方形触控目标。搜索、留言控件新增 id/label 或 aria-label；SettingsView 以唯一 id 和 label for 关联现有字段，致谢动态输入用索引 aria-label。后台各 router-link 添加 aria-label 与 title。

- [ ] **Step 4: 确认绿灯**

Run: pnpm --filter site-astro typecheck && pnpm --filter admin typecheck && pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts tests/responsive-vintage-static.test.ts

Expected: PASS。

- [ ] **Step 5: 提交**

    git add packages/site-astro/src/components/TopNav.astro packages/site-astro/src/components/RosterSearch.vue packages/site-astro/src/components/PublicMessageBoard.vue packages/admin/src/views/StudentsView.vue packages/admin/src/views/SettingsView.vue packages/admin/src/views/AdminLayout.vue packages/site-astro/tests/ui-reliability-static.test.ts
    git commit -m "fix: improve navigation and form accessibility"

### Task 6: 组合构建与浏览器回归

**Files:**

- Modify: package.json
- Modify: packages/site-astro/tests/ui-reliability-static.test.ts（仅补充前述缺失断言）

- [ ] **Step 1: 写失败测试**

    it('builds admin assets before the site verification chain', () => {
      const root = fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')
      expect(root).toContain('build:admin')
      expect(root).toContain('verify:site')
    })

- [ ] **Step 2: 确认红灯**

Run: pnpm --filter site-astro exec vitest run tests/ui-reliability-static.test.ts

Expected: FAIL；现有 verify:site 不构建后台，却依赖其 dist 产物。

- [ ] **Step 3: 最小实现**

把根 package.json 的 verify:site 改为先执行 pnpm build:admin，再执行现有 site typecheck、test:with-build 与网络测试；不改变各单独脚本的语义。

- [ ] **Step 4: 全量验证**

Run: pnpm verify:all

Expected: Worker、Admin、Site 的类型检查、构建、静态测试和网络测试全部通过。

- [ ] **Step 5: 浏览器回归与提交**

在 1440×900、800×900、390×844 下验证：过期 token 回首页、菜单 Enter 后可见、年度册打印按钮未遮挡、后台链接到 #/settings、坏头像显示首字、控制台无 hydration mismatch。

    git diff --check
    git add package.json packages/site-astro/tests/ui-reliability-static.test.ts
    git commit -m "test: verify UI reliability fixes"

## 自检

- 会话、上传、头像、hydration、内容边界、导航/表单、移动端和验证链路均有对应任务。
- 只在明确 401 时登出；网络和服务器错误仍保留原页面错误状态。
- 不包含生产 D1/R2 数据写入、图片转码服务或整站视觉重做。

