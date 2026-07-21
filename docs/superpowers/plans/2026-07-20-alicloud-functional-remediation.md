# 阿里云同学录功能与商用运行时修复方案

> **执行说明：** 本方案按任务逐项执行，每个任务都必须先补失败/回归验证，再实施最小修改；执行时不得覆盖工作区既有未提交改动，也不得输出或提交任何服务器凭据。

**目标：** 修复阿里云新版同学录的私聊不可用、收件不可见、发布不可追溯、静态资源软 404、HTTP 明文传输和数据初始化缺口，使真实双账号业务烟测与商用发布门禁全部通过。

**架构：** 保留现有 Astro/Vue 前端、Hono API、SQLite/D1 兼容层和本地文件存储。先建立可追溯、可回滚的 HTTPS 原子发布链路，再修复同学信箱的请求生命周期和消息可见性，最后补齐双账号线上验收与内容初始化；不进行无关重构。

**技术栈：** Astro 5、Vue 3、Hono、TypeScript、Vitest、Playwright、Node.js 22、SQLite/better-sqlite3、Podman、Nginx、阿里云 ECS。

---

## 当前基线与不可变约束

- 当前线上入口：`http://118.178.88.227`。
- 当前线上 `/release.json` 为 `source: local`，不能作为提交证明；修复完成前不得宣称线上对应某个 SHA。
- 当前线上基础接口：`/api/health`、`/api/readiness` 正常；未授权私聊接口返回 401，说明路由存在但未完成认证型业务验收。
- 当前线上内容统计基线：46 名同学、仅 6 人完成度大于 0、0 个头像、1 个空相册、0 张照片、47 条时间轴记录、0 个 owner 页面。
- 工作区已有修改和未跟踪部署脚本均属于用户资产；执行时只新增计划中明确的文件，禁止 `git reset --hard`、覆盖或清理用户改动。
- 服务器密码、JWT secret、管理员密码、SSH 私钥和测试账号密码只通过环境变量/密码管理器传入，禁止写入计划、日志、测试输出或 Git。

## 修复优先级

| 优先级 | 问题 | 通过标准 |
|---|---|---|
| P0 | HTTP 明文登录、部署脚本明文服务器凭据 | HTTPS 强制跳转；凭据轮换完成；仓库与构建产物不含秘密 |
| P1 | 私聊请求永久挂起、首发消息不显示、收件不滚动、无双账号验收 | 发送/同步有超时和可取消状态；新会话和已有会话均可发送；第二账号可在验收窗口内看到消息 |
| P1 | 前后端版本漂移、release 无 SHA、非原子上传 | `/release.json` 与 API 健康接口返回同一完整 SHA；发布可回滚 |
| P1 | Nginx 将缺失资源返回首页 HTML | 缺失资源/未知路径返回正确 404；合法站点路由仍可访问 |
| P1/P2 | 线上内容近空、相册/头像不可用 | 完成内容初始化清单并通过管理员与同学端验收 |
| P2 | 登录表单语义、安全响应头、附件/已读回执/实时推送限制 | 低风险体验缺口有明确实现或明确产品非目标，不再被误认为已支持 |

---

### Task 1：撤销泄露凭据并建立安全部署入口

**Files:**

- Modify: `deploy_frontend.js`
- Create: `scripts/verify-deployment-secrets.mjs`
- Test: `scripts/verify-deployment-secrets.test.mjs`
- Docs: `docs/deployment-runbook.md`

- [ ] **Step 1: 为当前泄露脚本写失败检查**

  在 `scripts/verify-deployment-secrets.test.mjs` 中读取 `deploy_frontend.js`，断言源码不包含 `password:`、`privateKey:`、`BEGIN OPENSSH PRIVATE KEY`、`JWT_SECRET`、`ADMIN_PASSWORD`；测试必须在当前工作区先失败并报告发现了明文密码字段。

- [ ] **Step 2: 轮换服务器凭据，不从仓库读取旧值**

  通过服务器控制台或受控 SSH 操作轮换该脚本中曾出现的登录凭据；轮换完成后用无副作用的 `ssh -o BatchMode=yes` 验证新凭据可用，禁止把值写回仓库或命令输出。

- [ ] **Step 3: 将部署脚本改为环境变量加密凭据**

  `deploy_frontend.js` 只读取以下变量，并在缺失时立即失败：

  ```js
  const config = {
    host: process.env.DEPLOY_HOST,
    port: Number(process.env.DEPLOY_PORT || 22),
    username: process.env.DEPLOY_USER,
    privateKey: process.env.DEPLOY_PRIVATE_KEY,
  }
  for (const [name, value] of Object.entries(config)) {
    if (!value || (name === 'port' && !Number.isInteger(value))) {
      throw new Error(`缺少部署变量：${name}`)
    }
  }
  ```

  脚本不得打印连接配置，不得支持密码字段回退。

- [ ] **Step 4: 加入仓库秘密扫描门禁**

  `scripts/verify-deployment-secrets.mjs` 扫描 `deploy_frontend.js`、`scripts/`、`deploy/` 和 Git 已跟踪文本文件；发现密码键、私钥头、常见 token 键或 20 字符以上疑似凭据时退出 1。只输出文件路径和键名，不输出匹配内容。

- [ ] **Step 5: 验证并记录**

  运行：

  ```powershell
  node scripts/verify-deployment-secrets.mjs
  node --test scripts/verify-deployment-secrets.test.mjs
  git grep -n -I -E "password:|BEGIN (RSA|OPENSSH) PRIVATE KEY|JWT_SECRET=" -- ':!pnpm-lock.yaml'
  ```

  预期：扫描和测试通过；最后一个命令无输出。

---

### Task 2：启用 HTTPS、强制安全响应头并保留 HTTP 兼容跳转

**Files:**

- Modify: `deploy/nginx-ecs.conf`
- Modify: `deploy/nginx.conf`
- Modify: `packages/site-astro/public/_headers`
- Create: `packages/site-astro/public/robots.txt`
- Test: `scripts/smoke-selfhosted.mjs`, `scripts/smoke-selfhosted.test.mjs`

- [ ] **Step 1: 先准备并验证证书**

  在 aaPanel/Nginx 中为正式域名配置证书；证书路径只存在服务器配置，不进入 Git。用 `nginx -t` 验证证书链、域名和配置有效后再启用 HSTS。

- [ ] **Step 2: 增加 HTTP 到 HTTPS 的 301 跳转**

  ECS IP 预发布配置保留 80 端口并拒绝真实登录；备案后的 aaPanel 正式域名 server 块必须由面板生成证书路径，并将 HTTP 请求统一改写为 HTTPS。仓库中的 IP 预发布配置只保留：

  ```nginx
  server {
    listen 80;
    server_name 118.178.88.227;
    return 403;
  }
  ```

  aaPanel 生成的正式域名 HTTP server 块必须使用 `return 301 https://$host$request_uri;`；正式域名和证书路径属于服务器部署输入，不写入仓库模板。IP 入口在证书未覆盖时只能作为受控预发布入口，不得承载真实登录。

- [ ] **Step 3: 在 HTTPS server 块加入安全头**

  两份 Nginx 配置的 HTTPS server 块统一加入：

  ```nginx
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
  add_header Content-Security-Policy "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
  ```

  仅在 HTTPS 已验证且不再需要 HTTP 回退后，才把 HSTS 改为包含 `includeSubDomains` 的正式值。

- [ ] **Step 4: 使 robots.txt 真正返回文本**

  `packages/site-astro/public/robots.txt` 内容固定为：

  ```text
  User-agent: *
  Disallow: /admin/
  Disallow: /api/
  ```

  `llms.txt` 若不提供则必须返回 404，不得返回首页 HTML。

- [ ] **Step 5: 扩展线上安全 smoke**

  `scripts/smoke-selfhosted.mjs` 增加 HTTPS 基址检查、HTTP 301 检查、`robots.txt` Content-Type 检查、安全响应头检查；测试使用环境变量 `$env:SELF_HOST_BASE_URL` 提供的 HTTPS 地址，不把 HTTP IP 当商用通过标准。

---

### Task 3：修复 Nginx 静态资源和未知路由的软 404

**Files:**

- Modify: `deploy/nginx-ecs.conf`
- Modify: `deploy/nginx.conf`
- Test: `scripts/smoke-selfhosted.mjs`
- Test: `packages/site-astro/tests/pages-deployment-static.test.ts`

- [ ] **Step 1: 为资产路径写失败 smoke**

  对以下请求断言状态码和类型：

  ```text
  GET /assets/does-not-exist.js       -> 404
  GET /admin/assets/does-not-exist.js -> 404
  GET /this-route-should-not-exist    -> 404
  GET /robots.txt                     -> 200 text/plain
  GET /llms.txt                       -> 404 或 text/plain
  ```

- [ ] **Step 2: 增加资产专用 404 location**

  在通用 `location /` 之前加入：

  ```nginx
  location ^~ /assets/ { try_files $uri =404; }
  location ^~ /admin/assets/ { try_files $uri =404; }
  ```

  这样缺失 JS/CSS 不会被改写为 HTML。

- [ ] **Step 3: 将公开站点未知路径改为 404**

  站点是 Astro 静态页面，不需要把所有未知路径回退为首页；将公开 location 改为：

  ```nginx
  location / {
    try_files $uri $uri/ /404.html =404;
  }
  ```

  `/admin/` 仍保留后台 SPA fallback，但 `/admin/assets/` 由前一步优先处理。

- [ ] **Step 4: 验证页面路由不回归**

  对 `/`、`/roster/`、`/album/`、`/timeline/`、`/mailbox/`、`/admin/` 运行 200/重定向检查；对不存在路径和资源运行 404 检查。

---

### Task 4：让发布产物和 API 版本可精确追溯

**Files:**

- Modify: `scripts/build-selfhosted.mjs`
- Modify: `scripts/smoke-selfhosted.mjs`
- Modify: `workers/api/src/runtime/nodeEnv.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `docker-compose.yml`
- Modify: `deploy/alumni-book-api.service`
- Test: `scripts/build-selfhosted.test.mjs`
- Test: `scripts/smoke-selfhosted.test.mjs`
- Test: `workers/api/src/runtime/node-runtime.test.ts`

- [ ] **Step 1: 先锁定完整 SHA**

  `build-selfhosted.mjs` 不再接受 `process.env.RELEASE_SHA || 'local'`，而是：

  ```js
  const releaseSha = String(process.env.RELEASE_SHA || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(releaseSha)) {
    throw new Error('RELEASE_SHA 必须是完整 40 位提交 SHA')
  }
  ```

  `release.json` 至少包含 `source`, `target`, `apiBase`, `builtAt`；`source` 必须为完整 SHA。

- [ ] **Step 2: 将 SHA 注入 Node API**

  `NodeRuntimeConfig` 和 `NodeRuntimeEnv` 增加 `RELEASE_SHA: string`；`createNodeRuntime()` 从 `RELEASE_SHA` 读取并在缺失时失败。`/api/health` 返回：

  ```json
  `releaseSha` 字段直接返回 `c.env.RELEASE_SHA`，响应必须满足 `typeof releaseSha === 'string' && /^[0-9a-f]{40}$/i.test(releaseSha)`。
  ```

  不返回任何 secret。

- [ ] **Step 3: 统一 Compose 环境变量**

  `docker-compose.yml` 从 `deploy/.env` 读取 `RELEASE_SHA`，并在部署前检查它与构建目录 `release.json.source` 相等；API 容器和静态文件不得分别使用不同 SHA。

- [ ] **Step 4: 改为 staging + 原子切换**

  部署脚本先上传到 `/www/wwwroot/releases/${releaseSha}/`，执行完整 smoke 后，再原子更新 `/www/wwwroot/alumni-book` 符号链接；旧 release 保留至少 2 个版本用于回滚。禁止直接覆盖当前生效目录。

- [ ] **Step 5: 强化 smoke 的版本收敛检查**

  `smoke-selfhosted.mjs` 接收 `--expected-sha`，同时检查：

  ```text
  /release.json.source === expectedSha
  /api/health.data.releaseSha === expectedSha
  ```

  任一不等立即失败。

---

### Task 5：修复私聊请求超时、取消和失败状态

**Files:**

- Modify: `packages/site-astro/src/api/classmateRequest.ts`
- Modify: `packages/site-astro/src/api/inbox.ts`
- Modify: `packages/site-astro/src/composables/useInbox.ts`
- Modify: `packages/site-astro/src/composables/useVisibilityPolling.ts`
- Test: `packages/site-astro/tests/inbox-resilience.test.ts`
- Test: `packages/site-astro/tests/mailbox-chat-flow.spec.ts`

- [ ] **Step 1: 添加失败测试覆盖超时**

  `inbox-resilience.test.ts` 使用永不 resolve 的 mock fetch，断言 15 秒（测试中注入 20ms）后抛出 `ApiRequestError`，错误状态为可重试，并且外部 `AbortSignal` 能立即中止请求。

- [ ] **Step 2: 在请求客户端中合并外部取消与超时**

  `requestClassmateApi` 增加 `timeoutMs?: number`，默认 15,000；实现必须保留调用方 signal：

  ```ts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const forwardAbort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', forwardAbort, { once: true })
  try {
    const res = await fetch(url, { ...requestOptions, signal: controller.signal, headers })
    // 保持现有 JSON、401 和 ApiRequestError 处理
  } catch (error) {
    if (controller.signal.reason === 'timeout') throw new ApiRequestError('请求超时，请稍后重试', 408)
    throw error
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
  ```

- [ ] **Step 3: 让轮询拥有相同的超时边界**

  `useVisibilityPolling` 增加 `timeoutMs`，默认 15,000；`useInbox` 传入相同值。超时必须进入既有 `error` 和退避路径，而不是永久占用 `controller`。

- [ ] **Step 4: 确保发送状态必然恢复**

  `send()` 和 `retry()` 使用 `try/finally` 设置 `sending.value = false`；无论成功、HTTP 错误、网络错误还是超时，都必须恢复输入框，并留下 `failed` 消息和“重试发送”。

- [ ] **Step 5: 运行测试**

  ```powershell
  pnpm --filter site-astro exec vitest run tests/inbox-resilience.test.ts
  pnpm --filter site-astro exec playwright test tests/mailbox-chat-flow.spec.ts --workers=1
  ```

---

### Task 6：修复新会话首发消息和收件展示

**Files:**

- Modify: `packages/site-astro/src/composables/useInbox.ts`
- Modify: `packages/site-astro/src/components/DirectConversationView.vue`
- Test: `packages/site-astro/tests/mailbox-chat-flow.spec.ts`
- Test: `packages/site-astro/tests/chat-rework-static.test.ts`

- [ ] **Step 1: 添加新会话首发回归测试**

  Playwright 流程必须覆盖：选择未建立会话的同学 → 输入消息 → mock 首发成功 → 断言发送中的消息立即可见 → 断言返回后会话出现在左侧 → 断言消息变为已发送；再覆盖首发 503 和超时，断言失败消息与重试按钮可见。

- [ ] **Step 2: 让临时会话同步当前视图**

  将 `setMessages` 改为根据当前活动会话或临时收件人更新 `messages`，而不是只检查 `selectedConversation`：

  ```ts
  function setMessages(conversationId: string, items: DirectInboxMessage[]) {
    const sorted = sortByCreatedAt(items)
    histories.set(conversationId, sorted)
    const pendingId = selectedConversation.value?.id || (selectedRecipient.value ? `pending-${selectedRecipient.value.slug}` : null)
    if (conversationId === pendingId) messages.value = sorted
  }
  ```

  首发成功后保留现有会话归并逻辑，确保临时 ID 不残留。

- [ ] **Step 3: 加入消息列表自动滚动规则**

  `DirectConversationView.vue` 声明 `const log = ref<HTMLElement | null>(null)`，监听 `messages`：只有当用户原本位于底部 96px 范围内，或消息为当前用户刚发送的消息时，才在 `nextTick()` 后设置 `log.scrollTop = log.scrollHeight`；用户阅读历史消息时不抢夺滚动位置，并显示“跳到最新消息”按钮。

- [ ] **Step 4: 区分“同步中”和“发送中”**

  连接状态文案改为：发送操作使用按钮/消息状态“发送中”，后台轮询使用“同步中”；禁止每次收件轮询都显示“发送中”。

- [ ] **Step 5: 验证既有会话和切换隔离**

  保留并运行现有已有会话、重试、切换会话、历史加载失败测试，确保异步发送不会覆盖另一位同学的消息。

---

### Task 7：补齐真实双账号线上业务验收

**Files:**

- Create: `scripts/smoke-selfhosted-chat.mjs`
- Create: `scripts/smoke-selfhosted-chat.test.mjs`
- Modify: `docs/alibaba-ecs-selfhosted-acceptance.md`
- Modify: `docs/deployment-runbook.md`

- [ ] **Step 1: 只允许专用测试账号**

  脚本要求 `CHAT_SENDER_SLUG`、`CHAT_RECIPIENT_SLUG`、`CHAT_SENDER_TOKEN`、`CHAT_RECIPIENT_TOKEN` 通过环境变量提供；如果 slug 不以 `smoke-` 或专用测试前缀开头，脚本立即退出，禁止误写真实同学会话。

- [ ] **Step 2: 实现幂等发送与收件检查**

  流程固定为：发送方 GET 会话列表 → 首发带唯一 `clientNonce` → 重复同一 nonce 验证不重复写入 → 收件方在 5 秒轮询窗口内 GET/sync 看到消息 → 收件方标记已读 → 发送方再次读取会话列表确认未读数变化。

- [ ] **Step 3: 记录无敏感信息的证据**

  输出只包含请求路径、状态码、消息 ID 前 8 位、耗时和 release SHA；禁止输出 Token、密码、完整消息正文或服务器路径。

- [ ] **Step 4: 明确清理流程**

  测试账号和测试消息必须在专用 SQLite 备份后由管理员受控清理；若生产 API 没有私聊删除接口，执行服务器维护 SQL 前必须取得明确授权，并保留删除前后行数证明。

- [ ] **Step 5: 把双账号烟测设为发布阻断**

  `docs/alibaba-ecs-selfhosted-acceptance.md` 只有在双账号烟测、release SHA、HTTPS、health/readiness、静态资源 404 全部通过后，才能把“正式可用”标记为完成。

---

### Task 8：完成内容初始化并验证核心业务功能

**Files:**

- Create: `scripts/bootstrap-selfhosted-content.mjs`
- Create: `scripts/bootstrap-selfhosted-content.test.mjs`
- Modify: `workers/api/src/db/seed.sql`（只增加幂等、无凭据的基础数据）
- Modify: `docs/alibaba-ecs-selfhosted-acceptance.md`

- [ ] **Step 1: 先生成只读缺口报告**

  脚本读取公开 API 或只读 SQLite 查询，输出：同学总数、完成度分布、头像数、相册数、照片数、时间轴数、owner 数；当前基线必须被记录为 46/6/0/1/0/47/0，避免把“空数据库”误判为功能完成。

- [ ] **Step 2: 定义内容初始化清单**

  管理员逐项确认：

  - 每名同学至少完成姓名、头像、个人简介或明确选择暂不公开；
  - 至少一个相册包含真实照片并能打开原图/缩略图；
  - 时间轴照片引用存在；
  - owner 页面只对明确授权的同学启用；
  - 手机端 roster、profile、album、timeline、yearbook 均能加载。

- [ ] **Step 3: 只允许幂等初始化**

  初始化脚本必须使用固定 ID 和 `INSERT ... ON CONFLICT DO UPDATE`，执行前提供 `--dry-run`，执行后重新查询统计；不得导入 Cloudflare 旧数据，不得覆盖管理员已编辑内容。

- [ ] **Step 4: 验证上传和文件服务**

  使用专用测试图片完成头像、背景、相册照片上传；从上传响应的 `r2Key` 拼出 `/api/files/${r2Key}`，验证正确 Content-Type、ETag、Range 和 immutable 缓存；测试对象写入失败时数据库不留下孤儿引用。

---

### Task 9：补齐低风险体验与已知限制声明

**Files:**

- Modify: `packages/site-astro/src/components/ClassmateLoginBook.vue`
- Modify: `packages/site-astro/src/components/DirectConversationView.vue`
- Modify: `docs/phase-14-chat-rework-acceptance-report.md`
- Test: `packages/site-astro/tests/classmate-auth-static.test.ts`
- Test: `packages/site-astro/tests/chat-rework-static.test.ts`

- [ ] **Step 1: 将登录容器改为语义化 form**

  把当前 `.login-form` `div` 改为 `<form @submit.prevent="handleLogin">`，按钮使用 `type="submit"`，删除两个输入框重复的 `@keydown.enter`；保留现有校验和错误文案。验证键盘 Enter、浏览器密码管理器和点击按钮行为一致。

- [ ] **Step 2: 统一错误可见性**

  登录错误和私聊错误均使用 `role="alert"`，超时明确显示“请求超时，请稍后重试”，失败消息保留“重试发送”。

- [ ] **Step 3: 明确附件、已读回执和实时推送范围**

  在验收文档中把三项拆成独立产品决策：

  - 若本期实现附件：增加上传 API、大小/MIME 校验、消息附件字段和双账号测试；
  - 若本期不实现：界面不暗示支持，并在用户可见说明中写明“当前仅支持文字私聊”；
  - 已读回执与 WebSocket/推送同理，不得把 5 秒轮询描述为实时通信。

- [ ] **Step 4: 移动端回归**

  在 390×844 和 430×932 视口验证：输入框可用、发送按钮不被键盘遮挡、长消息换行、自动滚动、返回信箱、错误提示不溢出。

---

## 统一验证门禁

每个任务完成后运行对应的最小测试；全部任务合并前运行：

```powershell
pnpm verify:worker
pnpm verify:shared
pnpm verify:admin
pnpm verify:site
pnpm verify:all
node scripts/smoke-selfhosted.mjs --base-url $env:SELF_HOST_BASE_URL --expected-sha $env:RELEASE_SHA
node scripts/smoke-selfhosted-chat.mjs --base-url $env:SELF_HOST_BASE_URL
```

最终线上验收必须同时证明：

1. HTTP 访问 301 到 HTTPS，HTTPS 访问成功且安全头存在；
2. `/release.json.source`、`/api/health.data.releaseSha`、构建提交三者相等；
3. 缺失资源和未知路径返回 404，不返回首页 HTML；
4. 同学 A 能登录、首发、重试并看到已发送状态；
5. 同学 B 能在轮询窗口内收到消息、打开历史并标记已读；
6. 断网/超时后 UI 可恢复，输入框不会永久禁用；
7. 头像、背景、相册照片、时间轴、群聊、通知、账号改密均通过真实账号或专用测试账号验收；
8. 生产数据统计达到已确认的内容初始化目标；
9. 工作区用户既有改动未被覆盖，Git 历史和部署日志不含凭据。

## 执行顺序

1. Task 1、Task 2：先消除凭据和明文传输风险。
2. Task 3、Task 4：建立正确 404、版本证明和原子发布。
3. Task 5、Task 6：修复私聊发送/接收核心链路并补回归测试。
4. Task 7：使用专用双账号执行真实线上烟测。
5. Task 8：完成内容初始化，验证相册、头像和个人页。
6. Task 9：补齐表单语义、错误体验和已知限制说明。
7. 通过统一验证门禁后，才允许再次发布阿里云正式入口。
