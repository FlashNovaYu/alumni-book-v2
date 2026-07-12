# 后台网络层加固验收报告

日期：2026-07-12

## 预览版本与环境

- 分支：`codex/admin-network-hardening`
- 预览部署源码：`24e80ab`
- 预览部署：`https://0a680fe3.alumni-book.pages.dev`
- 预览别名：`https://admin-network-hardening.alumni-book.pages.dev`
- 验证时生产部署源码：`be673f0`
- 生产环境未在本次任务中更新或回滚。

## 自动化验证

- Worker：12 个测试文件、131 项测试全部通过。
- Admin：7 项网络行为测试全部通过。
- Admin：静态整合契约、类型检查和生产构建通过。
- Admin：构建产物同源 API 门禁通过。
- Site：12 个测试文件、71 项测试全部通过。
- Playwright：47 项浏览器测试全部通过。
- `git diff --check` 通过。

首次全量验证因隔离工作树没有被 Git 跟踪的 `.dev.vars` 而导致 Worker 测试密钥为空；补充与 CI 相同的测试专用配置后，Worker 131 项测试全部通过。Site 默认构建期数据源 `workers.dev` 在本机连续五次连接失败，改用当前 Pages 生产入口作为构建期数据源后，Site 与 Playwright 门禁全部通过。

## 预览 Smoke

- `/`：200，显示新版“青春纪念馆”首页及班级空间、班级信箱入口。
- `/alumni-book-v2/admin/`：200，后台登录界面正常挂载。
- `/api/health`：200。
- 使用无效密码请求 `/api/auth/login`：401，页面显示“密码错误”。
- 浏览器记录的后台登录请求为预览域名同源 `/api/auth/login`。
- 后台 JS/CSS 不包含 `workers.dev` 或绝对 API 地址。
- Google Fonts 仍是后台唯一外部资源；按用户要求留待后台视觉重构完成后处理。

## 行为确认

- 普通请求 15 秒超时，FormData 上传 60 秒超时。
- GET 在网络异常或 502、503、504 时最多重试一次。
- POST、PUT、DELETE 和上传不会自动重试。
- 明确的 HTTP Token 验证失败会回到登录页；纯网络异常保持现有会话。
- Vite 未显式配置 API 地址时默认使用同源请求。
- `verify:admin` 会在每次构建后扫描产物，阻止跨域 API 地址回归。

---

## 最终基线与部署

- 分支：`codex/admin-network-hardening-prod`
- 当前生产 UI 基线：`be673f0`
- 网络优化源码：`04459ca`
- 生产部署：`https://fa823f53.alumni-book.pages.dev`
- 正式入口：`https://alumni-book.pages.dev`
- 最终预览：`https://admin-network-hardening-prod.alumni-book.pages.dev`

第一次预览使用了已经分叉的 `14ef55e` 基线。部署来源检查发现当前生产 `be673f0` 另有公开留言板、信箱和班级空间改动，因此第一次预览没有进入生产。网络优化随后被逐项移植到 `be673f0`，并在第二次预览重新验证。这一检查避免了再次回退界面。

## 自动化验证

- Worker：9 个测试文件、100 项测试全部通过。
- Admin：7 项网络行为测试全部通过。
- Admin：认证整合静态契约、类型检查和生产构建通过。
- Admin：构建产物同源 API 门禁通过。
- Site：12 个测试文件、72 项测试全部通过。
- Playwright：26 项浏览器测试全部通过。
- `git diff --check` 通过。

隔离工作树使用与 CI 相同的、被 Git 忽略的开发测试密钥。Site 构建期数据从当前 Pages 正式入口读取，避免本机直接访问 `workers.dev` 失败。

## 防界面回退验证

发布前，第二预览与原生产的以下公开页面 JS/CSS 资源清单逐项一致：

- 首页
- 公开留言页
- 班级空间页

发布后，正式入口与第二预览的首页、公开留言页、班级空间页、后台页和 `/api/health` 响应 SHA256 全部一致。公开站点 UI 没有被后台网络改动替换。

## 生产 Smoke

- `/`：200。
- `/alumni-book-v2/messages/`：200。
- `/alumni-book-v2/class-space/`：200。
- `/alumni-book-v2/admin/`：200。
- `/api/health`：200。
- 无效后台密码：401，页面显示“密码错误”。
- 浏览器记录的登录请求为 `https://alumni-book.pages.dev/api/auth/login`。
- 后台 JS/CSS 不包含 `workers.dev` 或绝对 API 地址。
- Google Fonts 仍是后台唯一外部资源；按用户要求留待视觉重构完成后处理。

## 已生效的网络规则

- 默认使用 Pages 同源 API；仅显式设置 `VITE_API_BASE_URL` 时连接其他开发后端。
- 普通请求超时为 15 秒，FormData 上传超时为 60 秒。
- GET 在网络异常或 502、503、504 时最多重试一次。
- POST、PUT、DELETE 和上传不会自动重试，避免重复写入。
- 明确的 HTTP Token 验证失败会返回登录页；纯网络异常不会误删会话。
- `verify:admin` 构建后扫描产物，阻止 `workers.dev` 或绝对 API 地址重新进入后台包。
