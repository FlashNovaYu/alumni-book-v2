# 后台网络层加固验收报告

日期：2026-07-12

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
