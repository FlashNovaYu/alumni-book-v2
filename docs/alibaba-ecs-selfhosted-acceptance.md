# 阿里云 ECS 自托管迁移验收记录

更新时间：2026-07-20

## 已完成

- 运行定位：阿里云 ECS 为正式商用版本；Cloudflare Worker/Pages/D1/R2 保留为开发测试链路。

- ECS：Alibaba Cloud Linux 3，公网 IP `118.178.88.227`，备案完成前使用 HTTP IP 预发布。
- 部署：rootless Podman + `podman-compose`，aaPanel Nginx 提供静态站点并反向代理 API。
- 数据：新建空 SQLite；不导入 Cloudflare D1/R2 旧数据；上传文件使用 ECS 本地 40G 系统盘目录。
- 应用提交：`307fc7a8fd79c361c4fece790592c000867121e9`。
- 发布证明：公网 `/release.json` 的 `source` 与上述 SHA 精确一致。
- 持久化目录：`/var/lib/alumni-book/data`、`/var/lib/alumni-book/uploads`。
- 运维目录：`/var/backups/alumni-book`；备份与过期会话清理 systemd timer 已启用并完成手动演练。
- 首个主管理员：`owner` 已写入 SQLite，角色为 owner，状态为 active；未读取或记录密码。
- 管理后台登录：已通过公网 `/api/auth/login` 验证，临时密码文件已删除。
- 持久化演练：API 重启后测试同学和主管理员记录仍在，readiness 保持 ready。
- 备份演练：修复服务器脚本换行/执行权限后，手动备份成功；归档包含 SQLite 和上传目录。

## 自动化验证

| 检查 | 结果 |
| --- | --- |
| Worker 测试 | 29 个文件，232 个测试通过 |
| Shared 类型检查 | 通过 |
| Admin 测试、类型检查、构建、同源 API 门禁 | 通过 |
| Site 类型检查 | 0 错误，9 个既有提示 |
| Site 静态测试 | 27 个文件，183 个测试通过 |
| Playwright 浏览器测试 | 66/66 通过 |
| ECS health/readiness | 通过，数据库、文件存储、JWT secret 均 ready |
| ECS IP smoke | 首页、后台、health、readiness、文件 404 全部通过 |
| 专用双账号私聊 smoke | 待执行；未通过前不得标记“正式可用” |

## 正式可用阻断条件

阿里云版本只有同时满足以下条件，才可以把“正式可用”标记为完成：

- 正式域名 HTTPS、HTTP 到 HTTPS 跳转及安全响应头通过；
- `/release.json` 与 `/api/health` 的完整 40 位 release SHA 和预期发布提交一致；
- health、readiness 以及站点、后台静态资源软 404 检查通过；
- 使用两个专用测试账号完成 `scripts/smoke-selfhosted-chat.mjs`，验证首发、同 nonce 幂等、5 秒收件轮询、标记已读和双方未读计数。

私聊 smoke 只允许 `CHAT_SENDER_SLUG`、`CHAT_RECIPIENT_SLUG` 使用 `smoke-` 前缀，或使用 `CHAT_TEST_SLUG_PREFIXES` 显式配置的专用前缀。两个 Token 必须从受保护的环境变量注入，不能写入命令、日志、仓库或验收记录。没有两个专用账号变量时，不得以普通同学账号代替，也不得跳过后宣称验收通过。

```powershell
$env:SELF_HOST_BASE_URL = 'https://正式域名'
$env:EXPECTED_RELEASE_SHA = (git rev-parse HEAD).Trim()
# CHAT_SENDER_SLUG、CHAT_RECIPIENT_SLUG、CHAT_SENDER_TOKEN、CHAT_RECIPIENT_TOKEN
# 由当前受保护会话或 CI Secret 注入；不要在命令历史中写入 Token。
node scripts/smoke-selfhosted-chat.mjs --expected-sha $env:EXPECTED_RELEASE_SHA
```

烟测证据只能保留请求路径、状态码、消息 ID 前 8 位、耗时和 release SHA。脚本不会自动删除消息或账号。需要清理时，管理员必须先生成 SQLite 备份并验证备份可读；生产 API 没有私聊删除接口，因此任何维护 SQL 都必须另行取得明确授权，并记录删除前后目标行数，不能把清理操作并入发布脚本。

当前 API 的 `unreadCount` 按登录账号计算，不向发送方提供收件方已读回执。因此正式验收验证的是：收件方未读数从大于 0 降为 0；发送方会话仍指向同一条最新消息，且发送方自身未读数没有被错误增加。不得把该结果描述为“发送方可见已读”或实时推送。

## 待人工完成

1. 已登录 `/admin/`；继续创建两名 `smoke-` 前缀的专用测试同学，完成双账号私聊 smoke；再验证账号登录、资料编辑、头像/背景上传、相册/照片、留言、群聊和通知。
2. 备案完成后配置域名 A 记录、HTTPS 和正式 `CORS_ORIGIN`；通过域名 smoke 后再决定是否停止 Cloudflare 旧生产。

## 安全边界

- 不记录 JWT secret、管理员密码或 SSH 私钥。
- SQLite、上传目录和 API 8787 端口不直接暴露公网；公网仅经 Nginx 访问。
- 当前没有购买或依赖 OSS；如未来接入 OSS，只替换存储适配层，不改变数据库相对 key。
