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

## 待人工完成

1. 已登录 `/admin/`；继续创建一名测试同学，验证账号登录、资料编辑、头像/背景上传、相册/照片、留言、群聊、通知和私信。
2. 备案完成后配置域名 A 记录、HTTPS 和正式 `CORS_ORIGIN`；通过域名 smoke 后再决定是否停止 Cloudflare 旧生产。

## 安全边界

- 不记录 JWT secret、管理员密码或 SSH 私钥。
- SQLite、上传目录和 API 8787 端口不直接暴露公网；公网仅经 Nginx 访问。
- 当前没有购买或依赖 OSS；如未来接入 OSS，只替换存储适配层，不改变数据库相对 key。
