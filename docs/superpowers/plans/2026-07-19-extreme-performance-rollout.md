# 极致性能优化总控实施计划

> **For agentic workers:** 按当前仓库 AGENTS 规则使用本地协作调度和阶段性审查；本仓库禁止调用 `superpowers` 技能。

**目标：** 在不改变业务功能、权限和数据语义的前提下，完成公开站点运行时、媒体管线、Worker/D1 和管理后台的可回滚性能改造。

**架构：** 保留 Astro SSG 作为静态编译器，公开站点采用原生增强加少量 Vue 应用岛；移除全站 ClientRouter，复杂班级空间/信箱/账号应用继续 Vue。后端采用身份隔离的缓存策略、批量 D1 查询和 R2 多尺寸资源。

**技术栈：** Astro 7、Vue 3、TypeScript、Hono、Cloudflare Workers/D1/R2、Vite、Vitest、Playwright、pnpm workspace。

---

## 子计划与执行顺序

1. [公开站点运行时](2026-07-19-public-runtime-performance.md)：先建立浏览器预算，再移除全站转场和低复杂度 Vue islands。
2. [Worker/D1](2026-07-19-worker-data-performance.md)：缓存边界和查询优化与前端请求契约同步。
3. [媒体与图片](2026-07-19-media-pipeline-performance.md)：新增派生资源，旧 URL 保留回退。
4. [管理后台](2026-07-19-admin-performance-quality.md)：身份缓存、请求取消、分页和上传并发。
5. 总控集成：按下面门禁顺序合并，每个子计划独立通过后才进入下一项。

## 总控门禁

- [ ] 在开始每个子计划前记录 `git status --short --branch`，不修改用户已有未提交文件。
- [ ] 每个子计划至少有一条先失败后通过的回归测试。
- [ ] 每个子计划完成后运行自身验证命令并单独提交。
- [ ] 最终运行：

```powershell
pnpm verify:all
node scripts/perf-budget.mjs
pnpm --filter site-astro test:perf-network
git diff --check
git status --short --branch
```

预期：所有测试通过；性能门禁记录首页、名册、学生页、年度册在桌面和 4× CPU/模拟 4G 下的 FCP、LCP、TBT、CLS、切换时间；工作区只保留明确的阶段提交或用户原有改动。

## 集成验收标准

- 首页桌面 LCP p75 < 1.5s，CLS < 0.1。
- 4× CPU/模拟 4G 下首页 TBT < 600ms，名册切换 < 700ms，年度册切换 < 1200ms。
- 静态页面不请求 Vue runtime；复杂页面只请求自身应用岛。
- 公开 API 重复访问具备短缓存/304；身份响应 `private` 且含 `Vary`。
- 名册、相册首屏不请求原图，图片均有尺寸占位。
- 10 个后台页面切换期间 `/api/auth/me` 最多请求一次；20 张图片上传最多 2 个并发。
- `pnpm verify:all`、浏览器端到端测试和 Worker 测试全部通过。
