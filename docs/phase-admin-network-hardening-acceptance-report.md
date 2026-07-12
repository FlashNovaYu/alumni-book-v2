# 后台网络层加固验收报告

日期：2026-07-12

## 版本与环境

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
