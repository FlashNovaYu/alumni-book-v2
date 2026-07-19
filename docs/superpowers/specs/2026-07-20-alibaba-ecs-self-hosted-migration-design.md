# 阿里云 ECS 自托管迁移设计说明

## 目标

将当前 `alumni-book-v2` 从 Cloudflare Pages/Workers + D1 + R2 迁移到一台阿里云 ECS。迁移只保留代码和功能，不导入 Cloudflare 现有数据；ECS 使用全新的空数据库和空上传目录。

备案完成前，ECS 以 `http://118.178.88.227` 作为预发布访问地址。备案完成后再绑定域名、启用 HTTPS，并将生产 CORS 来源切换为正式域名。

## 已确认的目标环境

- 系统：Alibaba Cloud Linux 3
- 资源：2 vCPU、约 1.8 GiB 内存、1 GiB Swap、40 GiB 系统盘
- 登录：`admin` 用户，具备免密码 `sudo`
- 部署：Docker Compose
- API：Node.js 22 + Hono Node 适配器
- 数据库：SQLite，持久化到 `/var/lib/alumni-book/data/alumni.sqlite`
- 文件：ECS 本地持久化目录 `/var/lib/alumni-book/uploads`
- Web：Nginx 提供静态文件并反向代理 `/api`

## 运行时结构

```text
浏览器
  ├─ /                 → Nginx → Astro 静态站点
  ├─ /admin/           → Nginx → Vue 管理后台静态文件
  └─ /api/*            → Nginx → Node/Hono API
                                  ├─ SQLite
                                  └─ 本地上传目录
```

Node API 保留当前 Hono 路由、鉴权、RBAC、限流、聊天、留言、通知和文件接口。Cloudflare Worker 的 `fetch` 入口改为 Node HTTP 入口；Cloudflare 的 D1/R2 绑定改为本地适配器。

## 适配范围

### 数据库

使用现有 20 个 SQLite 迁移创建新库，不执行任何旧数据导入。D1 风格的 `prepare/bind/all/first/run/batch` 接口由本地 SQLite 适配器提供，以保持现有业务路由的查询结构。

初始化内容为空，仅创建表、索引、触发器、系统角色和权限基线。首次启动通过受保护的初始化命令创建新的主管理员，不在源码或镜像中写入密码。

### 文件存储

将 R2 适配为本地文件存储：

- 数据库存储相对 key，例如 `avatars/example.png`；
- 实际路径固定在 `/var/lib/alumni-book/uploads` 下；
- 读取前拒绝绝对路径和路径穿越；
- 保留原有 Content-Type、Content-Length、ETag 和 Range 响应行为；
- 上传继续执行 MIME、扩展名、文件大小和图片内容校验；
- 不允许通过接口读取上传目录以外的文件。

### Cloudflare 专属能力

- `executionCtx.waitUntil` 改为 Node 中的异步后台任务或直接等待；
- Cloudflare Cache API 公共缓存改为 Nginx/应用层的明确缓存头，不引入第二个缓存服务；
- Worker Cron 改为宿主机定时任务，定期调用清理函数；
- Cloudflare Pages Functions 不再参与生产请求处理；
- Wrangler 仅保留本地测试或迁移前历史用途，不作为 ECS 发布工具。

## 容器与目录

Docker Compose 至少包含：

- `api`：Node 22 API 服务；
- `web`：Nginx，包含站点和后台构建产物，并代理 API。

宿主机目录：

- `/opt/alumni-book/app`：发布代码或构建上下文；
- `/var/lib/alumni-book/data`：SQLite 数据库；
- `/var/lib/alumni-book/uploads`：用户上传文件；
- `/var/backups/alumni-book`：轮换备份；
- `/var/log/alumni-book`：受限日志目录。

数据库和上传目录使用 Docker volume 或明确的 bind mount，容器重建不能丢失内容。

## 配置与安全

生产配置仅通过服务器环境文件注入：

- `JWT_SECRET`
- `CORS_ORIGIN`
- `DATABASE_PATH`
- `UPLOAD_ROOT`
- `MAX_UPLOAD_BYTES`

预发布阶段 `CORS_ORIGIN` 使用 `http://118.178.88.227`。域名备案完成后切换为 HTTPS 正式域名并重新构建前端。

ECS 安全组只开放 SSH、HTTP、HTTPS；SQLite、上传目录和 Node 内部端口不暴露公网。SSH 保留密钥登录，部署使用 `admin` + `sudo`，不需要把私钥放到服务器。

## 分阶段实施与验证

1. **服务器基线**：安装 Docker、Compose、Git 和必要构建工具；验证版本、磁盘、内存和防火墙规则。
2. **运行时适配**：实现 Node 入口、SQLite 适配器、本地文件适配器和定时清理入口；验证 API 单元测试。
3. **空库初始化**：执行全部迁移，创建系统角色和新的主管理员；验证 `/api/health`、`/api/readiness` 和登录。
4. **静态构建**：以 ECS API 和 IP 预发布地址构建站点与后台；验证 Nginx 路由、同源 API、管理后台和静态资源。
5. **功能验收**：验证同学登录、资料编辑、头像/背景上传、相册、留言、公共群聊、私信、通知、RBAC、限流和文件 Range 请求。
6. **运维验收**：验证备份恢复演练、磁盘空间告警、定时会话清理、容器重启后的数据持久性。
7. **域名切换**：备案完成后配置 DNS、HTTPS、正式 CORS 和前端 API 地址；完成域名 smoke test 后再考虑停止 Cloudflare 生产。

## 资源约束与回滚

当前 ECS 仅有约 30 GiB 可用空间。上传限制、日志轮换和备份轮换必须在上线前启用。第一阶段不保存 Cloudflare 旧数据，因此回滚方式是保留 Cloudflare 现有生产并恢复 DNS；ECS 的新数据不与旧 Cloudflare 数据合并。

## 验收标准

- ECS 通过 IP 可访问公开站点和管理后台；
- `/api/health` 返回成功，`/api/readiness` 的数据库、文件存储和密钥检查均为 ready；
- 新主管理员可以登录并修改密码；
- 空库可以通过后台创建同学、上传头像和创建相册；
- 上传文件只能通过应用接口读取，支持正常 GET、HEAD 和 Range；
- 所有现有 Worker API 测试和前端构建/静态测试通过；
- Docker 重启、主机重启后数据库和上传文件仍存在；
- 备案完成后域名 HTTPS smoke test 通过。
