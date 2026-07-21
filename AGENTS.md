# AGENTS.md

本文件只保留整个仓库都适用的规则。进入具体目录工作时，再读取该目录下更具体的 `AGENTS.md`；不要为了局部任务预读其他模块说明。

## 全局约束

- 所有面向用户的回复和交互选项使用中文。
- 区分回答、诊断和修改：仅要求分析时不改文件；要求修复或实现时完成必要修改与验证。
- 保留用户已有的已提交外修改。只修改任务直接涉及的文件，不顺手重构或清理无关代码。
- 修改前先定位根因；存在多种解释且会显著影响结果时才提问，否则说明合理假设后继续。
- 不读取、提交或输出密钥、令牌、管理员密码、SSH 私钥及生产环境文件内容。
- 不使用 `superpowers`。只加载任务明确需要的最小技能和文档集合。

## 默认工作模式

小型 Bug 和局部功能默认使用“快速修复”模式：

1. 用 `git status --short` 确认工作区边界。
2. 用 `rg` 搜索报错文本、组件名、路由或符号。
3. 只读目标文件、直接调用方/依赖和最近的相关测试；初始调查通常不超过 10 个源码或测试文件。
4. 只有调用链、共享类型、接口契约或测试失败提供证据时，才跨模块扩大阅读范围，并在进展消息中说明原因。
5. 除非用户要求审查近期改动，或当前修改与未提交内容重叠，否则不默认遍历提交历史。

默认不要扫描 `node_modules/`、`dist/`、`.astro/`、`.wrangler/`、`test-results/`、构建产物、备份和整个 `pnpm-lock.yaml`。检索时使用路径或 glob 限定范围。

## 验证分级

- 单组件、单接口、小型 Bug：先运行直接相关的测试。
- 单个 workspace 包内改动：相关测试通过后，按风险运行该包的 typecheck 或 build。
- 共享契约、认证、数据库迁移、跨包行为：运行受影响包的测试与类型检查。
- `pnpm verify:all` 仅用于大范围跨包修改、合并前检查或发布验收，不作为小改动默认步骤。
- 浏览器测试只用于真实交互、布局、导航或浏览器生命周期问题；纯 API/脚本改动不默认启动浏览器。
- 未明确要求部署时，不执行生产部署或线上写操作。

## 目录路由

| 任务范围 | 首选目录 | 局部说明 |
| --- | --- | --- |
| 公开站点、同学登录、资料页、相册、动效 | `packages/site-astro/` | `packages/site-astro/AGENTS.md` |
| 管理后台、JWT 登录、后台表单 | `packages/admin/` | `packages/admin/AGENTS.md` |
| 共享类型、API helper、设计令牌 | `packages/shared/` | `packages/shared/AGENTS.md` |
| Hono API、认证、SQLite/D1、文件存储 | `workers/api/` | `workers/api/AGENTS.md` |
| ECS、Podman、Nginx、发布产物 | `deploy/` | `deploy/AGENTS.md` |

涉及架构或运维时按需读取 `README.md`、`docs/deployment-runbook.md`、`docs/operations-data-recovery.md` 和 `docs/alibaba-ecs-selfhosted-acceptance.md`；局部 UI 或 API 修复不要预读这些文档。

## 跨环境不变量

- 阿里云 ECS 是正式商用目标；Cloudflare 仅用于开发测试，除非任务明确指定 Cloudflare。
- SSG 构建必须显式提供 `VITE_SSG_API_BASE`。
- 自托管浏览器端 `VITE_API_BASE_URL` 必须为空以使用同源 `/api`；不得设置为 `/api`，否则会生成 `/api/api/...`。
- 发布和服务器操作必须遵循部署 runbook，并验证准确 release SHA；HTTP 200 或 health/readiness 不能替代业务 smoke。
