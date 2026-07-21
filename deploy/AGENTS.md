# 自托管部署局部说明

本文件适用于 `deploy/`。同时继承仓库根目录的规则。部署任务还应按需读取 `docs/deployment-runbook.md`、`docs/operations-data-recovery.md` 和 `docs/alibaba-ecs-selfhosted-acceptance.md`。

## 正式环境基线

- 阿里云 ECS 是正式商用环境；Cloudflare 仅作开发测试。
- ECS 使用 Alibaba Cloud Linux 3、rootless Podman、`podman-compose` 和 aaPanel Nginx。
- API 为 Node.js 22 + Hono，公网只经 Nginx `/api/` 访问。
- SQLite、上传和备份目录是持久数据；重启或重建容器不得删除它们。
- 服务器环境文件必须保持权限 `600`。禁止读取或输出其中的 `JWT_SECRET`、管理员密码等敏感值。

## 构建与发布

- 自托管发布使用根脚本 `pnpm build:selfhosted -- --api-base <正式入口>`，并设置准确的 `RELEASE_SHA`。
- SSG 数据源必须显式设置；浏览器端 `VITE_API_BASE_URL` 保持空字符串。
- 不直接覆盖当前静态目录；遵循 runbook 的 release 目录、原子切换和回滚流程。
- 发布前确认工作区和目标提交，避免把未提交文件或不同 SHA 的 API/静态产物混入发布。

## 验收与安全

- 至少验证公开 `release.json`、health/readiness 和 `node scripts/smoke-selfhosted.mjs --base-url <入口>`。
- HTTP 200 只证明入口响应；正式验收还要证明 API/静态 SHA 一致和受影响业务流程可用。
- 未获得明确授权时，不执行生产写入、清理测试账号/消息、维护 SQL、数据库恢复或停用旧环境。
- 修改部署脚本时先运行对应脚本测试和安全检查；只有完整发布任务才运行 `pnpm verify:all`。
