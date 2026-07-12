# 同学录多管理员后台升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 将单密码后台升级为具有即时服务端鉴权、审计日志、独立／同学绑定次级管理员和桌面／手机工作台的多管理员后台。

**Architecture:** Worker 以 D1 的管理员账号、单个基础角色和允许／拒绝覆盖为唯一权限真相；管理会话只标识账号。所有受保护请求实时读取账号状态与最终权限，业务写入与审计行用同一批 D1 语句提交。Vue 后台按 /api/auth/me 返回的权限动态展示入口；绑定同学账号通过同源 sessionStorage 的同学会话交换短时管理会话。

**Tech Stack:** Cloudflare Workers、Hono、D1 SQLite、PBKDF2、Vue 3、Vue Router、Vite、Vitest、Playwright。

---

## 文件结构

| 路径 | 职责 |
| --- | --- |
| workers/api/migrations/0012_admin_rbac.sql | 新增管理员、角色、权限覆盖、会话关联与审计表。 |
| workers/api/src/lib/adminAuth.ts | 管理会话、最终权限计算、Hono 鉴权中间件。 |
| workers/api/src/lib/adminAudit.ts | 审计语句和原子 D1 批处理。 |
| workers/api/src/routes/auth.ts | 旧密码初始化、独立管理员登录／改密、同学交换和 me。 |
| workers/api/src/routes/adminAccounts.ts | 主管理员账号、权限、会话撤销和审计 API。 |
| workers/api/src/index.ts | 权限中间件与既有路由保护映射。 |
| workers/api/src/routes/*.ts | 在既有内容写路由上写入审计。 |
| workers/api/tests/admin-rbac.test.ts | 认证、越权、撤权、绑定账号与审计的 Worker 测试。 |
| packages/shared/src/types.ts | 管理员身份、权限、账号和审计共享类型。 |
| packages/admin/src/api/adminAccounts.ts | 后台治理 API 客户端。 |
| packages/admin/src/views/* | 初始化、绑定入口、账号、日志和权限感知工作台。 |
| packages/site-astro/src/components/TopNav.astro | 同学账号可用时显示不含令牌的后台入口。 |

### Task 1: 建立 RBAC 数据库与测试基线

**Files:**
- Create: workers/api/migrations/0012_admin_rbac.sql
- Modify: workers/api/src/db/schema.sql
- Modify: workers/api/tests/db-helper.ts
- Create: workers/api/tests/admin-rbac.test.ts

- [ ] **Step 1: 写缺失表的失败测试**

在 admin-rbac.test.ts 使用现有 env 和 initTestDb：

~~~
it('creates the administrator RBAC tables', async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('admin_accounts', 'admin_roles', 'admin_account_permissions', 'admin_audit_logs')"
  ).all()
  expect(results.map((row: any) => row.name).sort()).toEqual([
    'admin_accounts', 'admin_account_permissions', 'admin_audit_logs', 'admin_roles',
  ])
})
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: FAIL，预期表尚不存在。

- [ ] **Step 3: 添加最小迁移与测试迁移**

在生产迁移、完整 schema 与 testMigrations 中添加相同结构：

~~~
CREATE TABLE admin_accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK(account_type IN ('standalone', 'classmate_linked')),
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  student_slug TEXT UNIQUE,
  password_hash TEXT,
  role_id TEXT NOT NULL REFERENCES admin_roles(id),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  is_owner INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
~~~

补齐 admin_roles、admin_role_permissions、admin_account_permissions、admin_audit_logs；为 student_slug、status、audit actor/time 建索引。预置 owner、content_admin、moderator、operator 四个角色，以及 dashboard.view、moderation.view、moderation.manage、content.manage、notifications.view、notifications.publish、students.manage、site.settings.manage、admins.manage、audit.view 十项权限。

- [ ] **Step 4: 验证迁移结构**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: PASS，四个角色和四张 RBAC 表存在。

- [ ] **Step 5: 提交**

~~~
git add workers/api/migrations/0012_admin_rbac.sql workers/api/src/db/schema.sql workers/api/tests/db-helper.ts workers/api/tests/admin-rbac.test.ts
git commit -m "feat: add administrator RBAC schema"
~~~

### Task 2: 实现权限计算、会话主体和审计批处理

**Files:**
- Create: workers/api/src/lib/adminAuth.ts
- Create: workers/api/src/lib/adminAudit.ts
- Modify: workers/api/tests/admin-rbac.test.ts

- [ ] **Step 1: 写覆盖规则的失败测试**

插入 content_admin 账号，角色拥有 content.manage；插入该账号对 content.manage 的 deny 和 notifications.publish 的 allow。随后禁用账号。

~~~
expect(await getAdminPermissions(env.DB, 'adm_content')).not.toContain('content.manage')
expect(await getAdminPermissions(env.DB, 'adm_content')).toContain('notifications.publish')
await env.DB.prepare("UPDATE admin_accounts SET status = 'disabled' WHERE id = ?").bind('adm_content').run()
expect(await loadActiveAdmin(env.DB, 'adm_content')).toBeNull()
~~~

- [ ] **Step 2: 运行并确认失败**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: FAIL，adminAuth 导入不存在。

- [ ] **Step 3: 实现最小权限库**

在 adminAuth.ts 定义固定权限数组、AdminPermission、AdminPrincipal 和以下接口：

~~~
export async function loadActiveAdmin(db: D1Database, accountId: string): Promise<AdminPrincipal | null>
export async function getAdminPermissions(db: D1Database, accountId: string): Promise<AdminPermission[]>
export function requireAdminSession(c: Context, next: Next): Promise<Response | void>
export function requirePermission(permission: AdminPermission): MiddlewareHandler
export function requireOwner(c: Context, next: Next): Promise<Response | void>
~~~

规则固定为：主管理员拥有所有权限；其他账号依次应用角色权限、deny 覆盖、allow 覆盖；禁用、撤销或过期会话返回中文 401；活跃但无权限返回中文 403。中间件把 AdminPrincipal 存在 c.set('admin', principal)。

在 adminAudit.ts 实现：

~~~
export type AuditInput = {
  action: string; resourceType: string; resourceId: string
  reason?: string | null; before?: unknown; after?: unknown
}
export async function runAuditedBatch(
  db: D1Database, adminId: string, mutations: D1PreparedStatement[], audit: AuditInput
): Promise<void>
~~~

用一次 db.batch 提交 mutations 加审计语句；摘要 JSON 不得包含密码或令牌。

- [ ] **Step 4: 验证权限规则**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: PASS，覆盖顺序为角色、deny、allow，禁用账号无法取得主体。

- [ ] **Step 5: 提交**

~~~
git add workers/api/src/lib/adminAuth.ts workers/api/src/lib/adminAudit.ts workers/api/tests/admin-rbac.test.ts
git commit -m "feat: add admin permission and audit helpers"
~~~

### Task 3: 迁移旧登录并实现独立／绑定两种入口

**Files:**
- Modify: workers/api/src/routes/auth.ts
- Modify: workers/api/src/index.ts
- Modify: workers/api/tests/admin-rbac.test.ts
- Modify: workers/api/tests/security.test.ts

- [ ] **Step 1: 写认证状态机失败测试**

覆盖旧密码初始化、独立登录和同学会话交换：

~~~
POST /api/auth/login { password: 'admin888' } -> { data: { setupToken } }
POST /api/auth/setup { setupToken, username: 'owner', displayName: '陈老师',
  password: 'new-pass-123', confirmPassword: 'new-pass-123' } -> 200
POST /api/auth/login { username: 'owner', password: 'new-pass-123' } -> { data: { token, admin } }
POST /api/auth/classmate-exchange with X-Classmate-Token -> { data: { token, admin } }
~~~

断言 setup token 不能访问 me；绑定账号不能创建 owner；未绑定、禁用和已注销同学会话不能交换；注销后旧管理 token 得到 401。

- [ ] **Step 2: 运行并确认失败**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts tests/security.test.ts

Expected: FAIL，旧 auth 仅接受 password 且不存在 setup/exchange。

- [ ] **Step 3: 重写 auth.ts**

保留当前 HMAC JWT 签名实现，但 payload 只包含 adminAccountId 和会话标识。实现以下端点：

| 端点 | 行为 |
| --- | --- |
| POST /api/auth/login | 没有 admin_accounts 时验证旧密码并返回 10 分钟 setup token；之后验证 username + password。 |
| POST /api/auth/setup | 验证 setup token，创建唯一独立主管理员，撤销旧管理会话。 |
| POST /api/auth/change-password | 验证旧密码和两次新密码，清除 must_change_password。 |
| POST /api/auth/classmate-exchange | 通过 verifyClassmateSession 查找绑定且活跃的非主管理员账号，签发管理会话。 |
| GET /api/auth/me | 返回当前 AdminPrincipal。 |
| POST /api/auth/logout | 撤销当前会话。 |

会话必须写 admin_account_id 与 revoked_at。/verify 复用 requireAdminSession 并返回当前管理员，不再返回仅有 valid 的布尔值。

- [ ] **Step 4: 验证登录安全**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts tests/security.test.ts

Expected: PASS，旧主管理员能初始化一次，独立与绑定次级身份可登录，注销与无权交换均被拒绝。

- [ ] **Step 5: 提交**

~~~
git add workers/api/src/routes/auth.ts workers/api/src/index.ts workers/api/tests/admin-rbac.test.ts workers/api/tests/security.test.ts
git commit -m "feat: migrate admin authentication to named accounts"
~~~

### Task 4: 按能力收紧既有端点并记录审计

**Files:**
- Modify: workers/api/src/index.ts
- Modify: workers/api/src/routes/messages.ts
- Modify: workers/api/src/routes/publicMessages.ts
- Modify: workers/api/src/routes/albums.ts
- Modify: workers/api/src/routes/timeline.ts
- Modify: workers/api/src/routes/adminMail.ts
- Modify: workers/api/src/routes/config.ts
- Modify: workers/api/src/routes/students.ts
- Modify: workers/api/src/routes/upload.ts
- Modify: workers/api/tests/admin-rbac.test.ts

- [ ] **Step 1: 写端点拒绝矩阵失败测试**

使用审核员、运营管理员和主管理员会话：审核员可 approve 留言但得到 403 访问 students、config、admin/stats；运营管理员可创建相册、发送通知但不能审核；主管理员可访问全部。每次成功写操作查询 admin_audit_logs，断言 action、resource 与 actor。

- [ ] **Step 2: 运行并确认当前 adminGuard 过宽**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: FAIL，/api/admin/* 对任意 token 放行且无审计记录。

- [ ] **Step 3: 替换 index.ts 中的通用守卫**

移除 jwtGuard、adminGuard 和“任意管理 token 可写”的 app.use。显式映射：

~~~
/api/students*                 -> requireOwner
/api/config                    -> requireOwner
/api/admin/stats               -> requireOwner
/api/admin/accounts*           -> requireOwner
/api/admin/audit-logs          -> requireOwner
/api/admin/messages*           -> GET 使用 moderation.view；非 GET 使用 moderation.manage
/api/admin/public-messages*    -> GET 使用 moderation.view；非 GET 使用 moderation.manage
/api/admin/mail*               -> GET 使用 notifications.view；非 GET 使用 notifications.publish
/api/albums*, /api/photos*     -> content.manage
/api/timeline/events*          -> content.manage
/api/upload                    -> requireAdminSession, 然后按文件 type 二次判断
~~~

公开 GET /api/students、GET /api/config、GET /api/albums、GET /api/timeline 保持不变。新增 GET /api/admin/workbench，按当前权限只返回待办和运营数字；次级管理员不得再请求或获得 studentCount、recentStudents、topVisited、资料完整度。

- [ ] **Step 4: 在每个写路由执行原子审计**

从 c.get('admin') 获取主体。留言、公共留言、相册／照片、时光轴、邮件单发／群发、配置、学生档案和上传写操作均调用 runAuditedBatch。隐藏、删除、撤回与批量删除从请求体读取非空 reason，空原因返回 400。公共留言将 content_reviews.admin_id 写为 admin.id，reviewed_by 写为 admin.displayName。

上传先写 R2，随后把数据库更新与审计行同批提交；该批失败时删除刚上传的 R2 key。avatar、music、background 需要 students.manage；photo、misc 需要 content.manage。

- [ ] **Step 5: 运行 Worker 回归**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts tests/security.test.ts tests/api.test.ts tests/upload.test.ts

Expected: PASS；次级账号无同学数据读取路径，所有成功管理写入都有审计行。

- [ ] **Step 6: 提交**

~~~
git add workers/api/src/index.ts workers/api/src/routes/messages.ts workers/api/src/routes/publicMessages.ts workers/api/src/routes/albums.ts workers/api/src/routes/timeline.ts workers/api/src/routes/adminMail.ts workers/api/src/routes/config.ts workers/api/src/routes/students.ts workers/api/src/routes/upload.ts workers/api/tests/admin-rbac.test.ts
git commit -m "feat: enforce admin permissions across management APIs"
~~~

### Task 5: 实现主管理员账号与审计 API

**Files:**
- Create: workers/api/src/routes/adminAccounts.ts
- Modify: workers/api/src/index.ts
- Modify: workers/api/tests/admin-rbac.test.ts

- [ ] **Step 1: 写账号生命周期失败测试**

覆盖创建独立审核员、绑定同学运营管理员、更新角色和覆盖、停用撤销会话、重置密码、日志筛选。断言停用或降级唯一主管理员返回 400，次级管理员请求 accounts 或 audit-logs 返回 403。

- [ ] **Step 2: 运行并确认端点不存在**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: FAIL，返回 404。

- [ ] **Step 3: 实现 adminAccountsRoutes**

实现 list、create、update、disable、reset-password、revoke-sessions、list-audit-logs 和 owner-only 的 account-candidates。账号列表为每行返回 canDisable；当目标是唯一主管理员时该值为 false，服务端仍须拒绝绕过 UI 的停用和降级请求。account-candidates 只返回绑定选择所需的 name、slug、avatarUrl，且只允许主管理员访问。创建体固定为：

~~~
type CreateAdminAccount = {
  accountType: 'standalone' | 'classmate_linked'
  displayName: string
  username?: string
  initialPassword?: string
  studentSlug?: string
  roleId: 'content_admin' | 'moderator' | 'operator'
  permissionOverrides: Array<{ permission: AdminPermission; effect: 'allow' | 'deny' }>
}
~~~

独立账号要求唯一 username 和至少 8 位初始密码，写 must_change_password = 1；绑定账号要求已有 student_slug、拒绝密码与 owner 角色。列表 API 永不返回 password_hash 或会话 token。所有写动作通过 runAuditedBatch。

- [ ] **Step 4: 验证账号治理**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: PASS，主管理员可治理，停用立即拒绝旧会话，审计行可按操作者筛选。

- [ ] **Step 5: 提交**

~~~
git add workers/api/src/routes/adminAccounts.ts workers/api/src/index.ts workers/api/tests/admin-rbac.test.ts
git commit -m "feat: add administrator account governance APIs"
~~~

### Task 6: 接入后台身份状态、路由守卫和登录页

**Files:**
- Modify: packages/shared/src/types.ts
- Modify: packages/admin/src/api/client.ts
- Create: packages/admin/src/api/adminAccounts.ts
- Modify: packages/admin/src/main.ts
- Modify: packages/admin/src/views/LoginView.vue
- Create: packages/admin/src/views/AdminSetupView.vue
- Create: packages/admin/src/views/ClassmateEntryView.vue

- [ ] **Step 1: 先写失败的类型使用点**

在 main.ts 导入尚不存在的 fetchCurrentAdmin、adminSetup、exchangeClassmateSession，并注册 /setup、/classmate 路由。

- [ ] **Step 2: 运行并确认类型检查失败**

Run: pnpm --filter admin typecheck

Expected: FAIL，认证 API 和视图不存在。

- [ ] **Step 3: 实现前端身份 API**

在共享类型中添加 AdminPermission、AdminRoleId、AdminIdentity、AdminAccountSummary、AdminAuditLog。client.ts 维护 admin_token，但新增：

~~~
adminLogin(username: string, password: string)
fetchCurrentAdmin()
exchangeClassmateSession()
getCurrentAdmin()
~~~

exchangeClassmateSession 只能从 sessionStorage 读取 classmate_account_token 并作为 X-Classmate-Token 发送，不能写入 URL。登录页改为用户名加密码；首次安装跳 /setup；ClassmateEntryView 无同学 token 时提示先登录，有 token 时交换后跳工作台。路由守卫首次读取 /api/auth/me；403 时刷新身份并跳转第一个有权路由，401 时清 token 并跳登录。

- [ ] **Step 4: 验证构建**

Run: pnpm --filter admin typecheck && pnpm --filter admin build

Expected: PASS。

- [ ] **Step 5: 提交**

~~~
git add packages/shared/src/types.ts packages/admin/src/api/client.ts packages/admin/src/api/adminAccounts.ts packages/admin/src/main.ts packages/admin/src/views/LoginView.vue packages/admin/src/views/AdminSetupView.vue packages/admin/src/views/ClassmateEntryView.vue
git commit -m "feat: add admin account login flows"
~~~

### Task 7: 实现权限感知的混合工作台与手机导航

**Files:**
- Modify: packages/admin/src/views/AdminLayout.vue
- Modify: packages/admin/src/views/DashboardView.vue
- Modify: packages/admin/src/views/MessagesView.vue
- Modify: packages/admin/src/views/MailView.vue
- Modify: packages/admin/src/views/AlbumsView.vue
- Modify: packages/admin/src/views/TimelineEventsView.vue
- Modify: packages/admin/src/main.ts
- Modify: packages/admin/src/styles/admin.css
- Modify: packages/admin/package.json
- Create: packages/admin/tests/permissions-static.test.ts

- [ ] **Step 1: 写权限遗漏的静态失败测试**

静态测试读取 AdminLayout、main、Dashboard；断言学生、设置、账号、审计路由分别检查 students.manage、site.settings.manage、admins.manage、audit.view，且工作台请求 /api/admin/workbench 而非 /api/admin/stats。将 test:static 设置为 tsx tests/permissions-static.test.ts。

- [ ] **Step 2: 运行并确认失败**

Run: pnpm --filter admin test:static

Expected: FAIL，当前侧栏无权限条件、控制台请求旧 stats。

- [ ] **Step 3: 实现动态导航和模块级操作**

以 getCurrentAdmin().permissions 生成“工作台”“内容治理”“内容运营”“仅主管理员”分组；无权模块不渲染、不预取。Dashboard 用 workbench 数据展示“待我处理”、运营摘要和快捷操作，不显示同学资料。MessagesView 的通过、隐藏、置顶、批处理按 moderation.manage 显示，破坏性动作使用必填 reason 对话框。MailView 文案改“通知中心”，保留 /mail URL；相册和时光轴操作只在 content.manage 下可用，删除相册／照片／事件也必须通过必填 reason 对话框提交。

- [ ] **Step 4: 实现手机完整入口**

max-width: 768px 时用“工作台／审核／运营／更多”底部导航替换侧栏。按钮最小 44px，筛选条横向可滚动，模态框具备 role=dialog、标题关联、关闭焦点；无权模块不出现在底栏。

- [ ] **Step 5: 验证前端质量**

Run: pnpm --filter admin test:static && pnpm --filter admin typecheck && pnpm --filter admin build

Expected: PASS。

- [ ] **Step 6: 提交**

~~~
git add packages/admin/package.json packages/admin/tests/permissions-static.test.ts packages/admin/src/views/AdminLayout.vue packages/admin/src/views/DashboardView.vue packages/admin/src/views/MessagesView.vue packages/admin/src/views/MailView.vue packages/admin/src/views/AlbumsView.vue packages/admin/src/views/TimelineEventsView.vue packages/admin/src/main.ts packages/admin/src/styles/admin.css
git commit -m "feat: add role-aware admin workbench"
~~~

### Task 8: 实现主管理员账号与审计界面

**Files:**
- Create: packages/admin/src/views/AdminAccountsView.vue
- Create: packages/admin/src/views/AuditLogView.vue
- Modify: packages/admin/src/api/adminAccounts.ts
- Modify: packages/admin/src/main.ts
- Modify: packages/admin/src/views/AdminLayout.vue
- Modify: packages/admin/src/styles/admin.css
- Modify: packages/admin/tests/permissions-static.test.ts

- [ ] **Step 1: 写页面结构失败测试**

断言账号页有独立／绑定单选、角色选择、权限覆盖、最终权限摘要、停用确认；断言日志页有操作者、动作、日期筛选和只读详情。唯一主管理员的停用按钮必须使用 API 的 canDisable 字段。

- [ ] **Step 2: 运行并确认失败**

Run: pnpm --filter admin test:static

Expected: FAIL，新视图不存在。

- [ ] **Step 3: 实现账号和日志页面**

AdminAccountsView 调用 listAdminAccounts、listAccountCandidates、createAdminAccount、updateAdminAccount、disableAdminAccount、resetAdminPassword。独立账号保存前校验 username 与 password；绑定账号从 account-candidates 选择 studentSlug；显示角色默认、覆盖和最终权限，密码永不回显。新增 /accounts 与 /audit-logs 路由及 owner 元数据。AuditLogView 按 actorId、action、from、to、resourceType 筛选，详情只读展示资源、理由、时间、操作者和前后摘要。

- [ ] **Step 4: 验证**

Run: pnpm --filter admin test:static && pnpm --filter admin typecheck && pnpm --filter admin build

Expected: PASS。

- [ ] **Step 5: 提交**

~~~
git add packages/admin/tests/permissions-static.test.ts packages/admin/src/views/AdminAccountsView.vue packages/admin/src/views/AuditLogView.vue packages/admin/src/api/adminAccounts.ts packages/admin/src/main.ts packages/admin/src/views/AdminLayout.vue packages/admin/src/styles/admin.css
git commit -m "feat: add admin account and audit screens"
~~~

### Task 9: 在同学站点提供安全后台入口

**Files:**
- Modify: workers/api/src/routes/classmateAuth.ts
- Modify: workers/api/tests/admin-rbac.test.ts
- Modify: packages/site-astro/src/api/classmateAuth.ts
- Modify: packages/site-astro/src/components/TopNav.astro
- Modify: packages/site-astro/src/components/AccountCenter.vue
- Create: packages/site-astro/tests/admin-entry-static.test.ts
- Modify: packages/site-astro/package.json

- [ ] **Step 1: 写入口查询失败测试**

测试 GET /api/classmate-auth/admin-entry：无会话 401；未绑定或禁用账号返回 available: false；活跃绑定账号返回 available: true、displayName、permissions，且不返回令牌、账号治理或同学资料权限。静态测试断言链接是相对基路径的 admin/#/classmate，任何 HTML 不包含 classmate token。

- [ ] **Step 2: 运行并确认失败**

Run: pnpm --filter worker exec vitest run tests/admin-rbac.test.ts

Expected: FAIL，入口查询不存在。

- [ ] **Step 3: 实现查询与渲染**

classmateAuth.ts 用 verifyClassmateSession 查询活跃、非主管理员绑定账号，只返回最小入口数据。站点客户端新增 fetchClassmateAdminEntry。TopNav 和 AccountCenter 在已有同学会话时查询；available 为真才显示“管理后台”；链接按现有 href 基路径规则生成 admin/#/classmate。网络失败仅隐藏入口，不能影响同学使用。

- [ ] **Step 4: 运行站点测试**

把 admin-entry-static.test.ts 加入 site package 的 test 脚本。

Run: pnpm --filter site-astro typecheck && pnpm --filter site-astro test

Expected: PASS，入口不泄漏 token，非管理员看不到链接。

- [ ] **Step 5: 提交**

~~~
git add workers/api/src/routes/classmateAuth.ts workers/api/tests/admin-rbac.test.ts packages/site-astro/src/api/classmateAuth.ts packages/site-astro/src/components/TopNav.astro packages/site-astro/src/components/AccountCenter.vue packages/site-astro/tests/admin-entry-static.test.ts packages/site-astro/package.json
git commit -m "feat: add classmate-linked admin entry"
~~~

### Task 10: 完整验收与记录

**Files:**
- Create: docs/admin-rbac-workbench-acceptance.md

- [ ] **Step 1: 写跨视口验收清单**

清单覆盖 1440px 侧栏、768px 工作台、390px 底部导航与无横向溢出；独立主管理员、独立审核员、绑定同学运营管理员三种登录；主管理员停用后次级页面立刻得到 403 并回工作台。

- [ ] **Step 2: 运行 Worker 全量门禁**

Run: pnpm verify:worker

Expected: PASS，包含新增 admin-rbac.test.ts，无 D1 警告。

- [ ] **Step 3: 运行后台与站点门禁**

Run: pnpm verify:admin

Expected: PASS。

Run: pnpm --filter site-astro typecheck && pnpm --filter site-astro test

Expected: PASS。

- [ ] **Step 4: 完成浏览器验收并记录真实结果**

在报告中记录实际命令、日期、视口、通过项和已知限制；不得记录未实际执行的结果。

- [ ] **Step 5: 提交验收报告**

~~~
git add docs/admin-rbac-workbench-acceptance.md
git commit -m "docs: record admin RBAC acceptance"
~~~

## 计划自检

- 规格覆盖：任务 1–5 覆盖 D1、认证、权限、即时撤权、账号与审计；任务 6–9 覆盖后台、手机端、现有业务治理和同学绑定入口；任务 10 覆盖完整门禁。
- 安全边界：Worker 是最终鉴权者；次级管理员无同学、站点设置、账号和日志接口；同学 token 不进入 URL。
- 名称一致性：所有层统一使用 AdminPermission、AdminPrincipal、admin_accounts、admin_audit_logs 和 admin_token。
- 范围控制：不引入外部身份提供商、WebSocket 或同学资料权限改造。
