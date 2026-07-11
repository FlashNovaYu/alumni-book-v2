# Cloudflare Pages 单应用部署稳定性设计

**日期：** 2026-07-11
**状态：** 已获用户口头批准，等待设计文档复核
**范围：** 仅调整生产部署架构、运行时路由、缓存和验证流程；不改变业务功能，不包含后续代码质量重构

## 1. 背景与目标

当前生产链路由 Cloudflare Pages、Pages Advanced Mode `_worker.js`、独立 Cloudflare Worker、D1 和 R2 组成：

```text
浏览器
  ↓
Cloudflare Pages
  ├─ 静态请求 → Pages Assets
  └─ /api/* → _worker.js → 公网 workers.dev → Hono API → D1/R2
```

该结构存在以下问题：

1. 中国大陆访问 `workers.dev` 可能受到网络质量和 DNS 异常影响。
2. API 和 R2 文件需要经过 Pages 与独立 Worker 两层运行时，增加延迟和故障点。
3. 当前仓库没有 `_routes.json`，全局 `_worker.js` 可能让原本免费且不限量的静态资源请求触发 Pages Function。
4. Pages 与 Worker 分别部署，存在版本短暂不一致和配置重复。
5. R2 文件下载缺少完整的 HEAD、长度、边缘缓存和生产 Range 验证流程。

本设计在不购买域名、不购买国内服务器、不迁移数据的前提下，将正式链路收敛为单个 Cloudflare Pages 应用。成功标准如下：

- 用户正式访问只依赖 `alumni-book.pages.dev`。
- 浏览器运行时不再请求公开的 `workers.dev` 地址。
- CSS、JS、字体、构建图片和普通静态页面不触发 Pages Function；为保留动态模板回退，`/student/*` 文档请求属于明确例外。
- API 只触发一次 Pages Function，并直接访问 D1。
- 文件只触发一次 Pages Function，并直接访问 R2。
- 现有管理员、同学账号、资料、留言、邮箱、相册和上传功能保持不变。
- 完整自动测试、构建和部署后烟雾检查全部通过。

## 2. 已确认约束

- 当前没有自定义域名，也不计划为本阶段购买域名。
- 当前不购买或使用中国大陆服务器。
- 不新增 GitHub Pages 生产或备用部署。
- `pages.dev` 继续作为唯一正式入口。
- 现有 D1 数据库和 R2 存储桶原地复用，不复制、不迁移。
- 本阶段不夹带大规模代码质量重构；代码治理在部署稳定后单独设计和实施。
- 工作区已有未提交修改，实施时必须只修改计划列出的文件，不覆盖用户现有工作。

## 3. 方案比较与决策

### 3.1 保持 Pages 到 Worker 的公网代理

只增强缓存和文件响应头，改动最小，但仍然依赖 `workers.dev` 公网域名，不能解决主要链路问题，因此不采用。

### 3.2 Pages 通过 Service Binding 调用独立 Worker

可以消除公网跳转，且 Service Binding 不产生额外请求费用，但仍需维护 Pages 与 Worker 两套部署和运行时配置。它适合作为渐进迁移方案，但不是最终结构。

### 3.3 Worker Static Assets 单应用

由一个 Worker 同时承载静态资源、Hono API、D1 和 R2。运行额度与 Pages 基本相同，但正式入口会迁移到 `workers.dev`，与当前稳定性目标冲突，因此不采用。

### 3.4 Pages 单应用直接绑定 D1/R2

Pages 同时提供静态资源与 Hono API，Function 直接绑定 D1 和 R2。该方案保留 `pages.dev`，移除公网 Worker 依赖，并减少部署层级，因此确定为实施方案。

## 4. 目标架构

```text
浏览器
  ↓
alumni-book.pages.dev
  ├─ HTML / CSS / JS → Pages Assets
  ├─ /api/* → Pages Function 中的 Hono 应用 → D1
  └─ /api/files/* → Pages Function → R2
```

### 4.1 代码边界

- Hono API 的唯一业务实现继续位于 `workers/api/src`。
- 新增轻量 Pages 运行时入口，导入同一个 Hono 应用，不复制路由或认证逻辑。
- 构建阶段将 Pages 入口及其 Hono 依赖打包为部署目录中的 `_worker.js`。
- 独立 Worker 入口继续可用，但不再参与正式 Pages 请求。
- 独立 Worker 的自动部署改为手动应急部署，避免日常提交产生两套正式版本。

### 4.2 路由边界

- `/api/*` 进入 Hono。
- `/student/*` 仅在需要学生模板回退时进入 Pages Function。
- CSS、JS、字体、构建图片和普通静态页面直接由 Pages Assets 提供。
- 通过 `_routes.json` 明确 Function 的包含与排除规则。
- `/student/*` 进入 Function 后先读取对应 Pages Asset；只有资产不存在时才回退到学生通用模板。该文档请求会消耗一次 Function 调用，这是保留现有动态模板能力的有意取舍。
- 公开站点的正式基础路径改为 `/`，管理后台基础路径改为 `/admin/`。
- 旧 `/alumni-book-v2/*` 地址通过兼容跳转映射到新路径，保留已有分享链接的可达性。

## 5. 构建与部署流程

GitHub Actions 使用以下顺序构建和部署：

1. 安装锁定版本的依赖。
2. 运行 Worker 测试。
3. 运行 Admin 类型检查与构建验证。
4. 运行 Site 类型检查、构建、静态测试和 Playwright 性能测试。
5. 使用 `SITE_BASE=/` 构建 Astro 公开站点。
6. 使用 `/admin/` 为基础路径构建管理后台。
7. 将站点和后台产物组装到统一部署目录。
8. 将 Pages 运行时入口打包为部署目录中的 `_worker.js`。
9. 写入已审查的 `_routes.json`、缓存规则和旧路径兼容规则。
10. 使用 Wrangler 部署到现有 `alumni-book` Pages 项目。
11. 对生产 Pages 地址执行烟雾检查。

客户端 `VITE_API_BASE_URL` 保持为空字符串，所有浏览器 API 请求使用同源地址。Astro 构建时的数据源改为当前 Pages 生产地址，使构建过程也不再依赖公开 Worker 域名。部署时，上一版本 Pages 仍可为当前构建提供数据。

## 6. Cloudflare 绑定与秘密配置

Pages 生产环境绑定以下现有资源：

- `DB` → `alumni-book-db` D1 数据库。
- `R2` → `alumni-book-assets` R2 存储桶。
- `JWT_SECRET` → 与现有生产 Worker 相同的秘密值。
- `CORS_ORIGIN` → 正式 Pages 地址；同源请求不依赖 CORS，但保留本地开发和应急 Worker 所需配置。

D1 和 R2 的非秘密绑定写入 Pages Wrangler 配置并纳入版本控制。`JWT_SECRET` 只通过 Cloudflare Pages Secret 或受保护的 CI Secret 配置，绝不写入仓库或工作流日志。

Pages 使用同一个 D1 后，现有管理员会话表和同学会话表保持原样。使用相同 `JWT_SECRET` 可避免管理员 JWT 在迁移后立即失效；即使需要重新登录，也不会影响数据库内容。

## 7. 请求与缓存策略

### 7.1 静态资源

- 带内容哈希的 CSS、JS 和构建资源由 Pages Assets 直接提供。
- CSS、JS、字体、构建图片和普通静态页面请求免费且不限量，不进入 Function。
- 哈希资源使用长期不可变缓存。
- HTML 使用重新验证或短缓存策略，避免部署后长期显示旧页面。

### 7.2 JSON API

- 公开 GET API 保留现有 ETag 与重新验证策略。
- `/api/class-space/overview` 保留短 CDN 缓存与 `stale-while-revalidate`。
- 登录、管理、写操作和隐私数据继续使用 `no-store`。
- 不扩大任何接口的公开范围。

### 7.3 R2 文件

- `/api/files/*` 由 Pages Function 直接读取 R2。
- 保留唯一 R2 key 对应的一年不可变缓存。
- 响应提供正确的 `Content-Type`、`Content-Length`、`ETag`、`Cache-Control` 和 `Accept-Ranges`。
- 支持 HEAD 请求，不返回文件正文。
- 支持 `If-None-Match`，匹配时返回 304。
- 使用 Cloudflare Cache 保存完整的 200 响应，由 Cloudflare 边缘缓存对 Range 请求执行切片并返回 206。
- 缓存不可用或写入失败时直接返回 R2 内容，不能让缓存故障阻断下载。
- 生产烟雾测试验证真实边缘节点的 Range 行为；本地测试只验证应用能够生成可缓存的完整响应和必要响应头。

## 8. 认证与隐私

- 管理后台继续使用 `Authorization: Bearer <token>`。
- 同学账号继续使用 `X-Classmate-Token`。
- 管理员会话数据库校验、同学会话数据库校验和资料可见性过滤逻辑不变。
- 上传接口仍要求管理员 JWT 或指定的同学会话权限。
- R2 文件的公开访问行为保持现状，本阶段不改变文件授权模型。
- 自定义 HTML 的 sandbox 策略和学生页模板行为不变。

## 9. 错误处理与可观测性

- D1、R2 或 `JWT_SECRET` 缺失时，相关请求返回明确的 503 JSON。
- 错误响应不包含秘密、SQL、堆栈或内部绑定详情。
- Hono 全局错误处理保留 `X-Request-Id`，详细错误只写入服务端日志。
- 文件不存在返回 404，文件路径无效返回 400，R2 绑定不可用返回 503。
- JSON API 继续使用统一的 `{ success, data?, message? }` 响应结构。
- 部署后健康检查覆盖静态页面、D1 API 和真实 R2 文件，而不是只检查不访问绑定的浅层健康接口。

## 10. 迁移、回滚与故障边界

### 10.1 迁移顺序

1. 在 Pages 项目配置 D1、R2 和秘密绑定。
2. 在本地和 CI 中完成所有测试与构建。
3. 部署包含 Pages API 的新版本。
4. 执行生产烟雾检查。
5. 验证浏览器运行时不再请求 `workers.dev`。
6. 将独立 Worker 自动部署改为手动应急部署。

### 10.2 回滚

- 构建或上传失败时，现有 Pages 版本不受影响。
- 生产烟雾检查失败时，工作流标记失败并输出上一稳定提交的重新部署说明。
- 独立 Worker 在迁移初期保留，可用于诊断和手动应急，但前端不会自动降级到它。
- 不实现客户端自动切换到 `workers.dev`，避免重新引入 DNS 风险和双链路状态差异。

### 10.3 已接受的剩余风险

- 无自定义域名、无中国大陆服务器时，无法从根本上控制 `pages.dev` 的 DNS 和跨境网络质量。
- Pages 平台级故障仍会影响整个站点；本阶段不部署其他平台的生产镜像。
- 免费计划的动态请求仍受 Workers Free 每日额度和 CPU 限制，但本项目当前规模远低于平台限制。

## 11. 测试与验收

### 11.1 自动测试

必须继续通过：

```text
pnpm verify:worker
pnpm verify:admin
pnpm verify:site
```

新增自动测试覆盖：

- Pages 入口只复用 Hono 应用，不包含复制的业务路由。
- `_routes.json` 只让 API 和必要的学生模板回退进入 Function。
- 静态资源路径被排除在 Function 调用之外。
- 旧 `/alumni-book-v2/*` 地址正确映射到根路径结构。
- R2 文件 GET、HEAD、ETag、304、缓存头和错误状态。
- 缺少 Pages 绑定时返回安全且明确的 503。
- 构建产物中不存在硬编码的生产 `workers.dev` 运行时请求。
- 现有登录、资料编辑、留言、邮箱、相册和上传测试保持通过。

### 11.2 部署后烟雾检查

对 `https://alumni-book.pages.dev` 验证：

1. 首页返回 200。
2. `/api/health` 返回 200。
3. `/api/classmates` 成功读取 D1。
4. `/api/albums` 成功读取相册数据。
5. 从相册响应选择一个真实 R2 key，执行 HEAD 请求并检查长度、类型、ETag 和缓存头。
6. 先用完整 GET 预热文件缓存，再执行 Range 请求；响应必须为 206，并包含正确的 `Content-Range` 和分段 `Content-Length`。
7. 检查生产页面和网络请求不包含公开 Worker 地址。
8. 检查旧路径兼容跳转和 `/admin/` 可达性。

### 11.3 性能验收

- 首页及主要页面继续满足仓库现有性能预算。
- CSS、JS、字体、构建图片和普通静态页面请求不进入 Pages Function；`/student/*` 文档请求是为模板回退保留的明确例外。
- API 请求相较原链路减少一次公网 Worker 跳转。
- R2 文件请求相较原链路减少一次公网 Worker 跳转。
- 不增加首屏 JavaScript 依赖或客户端重试框架。

## 12. 非目标

本阶段明确不包含：

- 购买或绑定自定义域名。
- 部署中国大陆服务器或 CDN。
- 部署 GitHub Pages、EdgeOne、Vercel、Netlify 等生产镜像。
- 更换 D1、R2 或认证系统。
- 重新设计页面或增加业务功能。
- 拆分大型 Vue/Astro 组件、统一全部 API 客户端或全面清除 `any`。
- 与部署无关的格式化、依赖升级和代码清理。

上述代码质量工作将在本设计实施并稳定后，单独编写设计与实施计划。
