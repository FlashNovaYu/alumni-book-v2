# 公开站点局部说明

本文件适用于 `packages/site-astro/`。同时继承仓库根目录的规则。

## 模块边界

- 这是 Astro SSG 公开站点，交互组件使用 Vue islands。
- 浏览器端 API 基址来自 `VITE_API_BASE_URL`；自托管构建必须为空字符串并使用同源 `/api`。
- 构建时数据源来自 `VITE_SSG_API_BASE`，必须显式设置，不得回退到隐式公网地址。
- 公开 GET 请求使用站点 API client；同学自助写操作通过共享的 classmate session helper 附加 `X-Classmate-Token`。
- `MainLayout.astro` 负责页面切换时的会话守卫。修改登录或导航时，同时检查首次加载与客户端导航两条路径。

## 专属模板

- `isOwner` 且 `customHtml` 非空时，学生页通过 sandbox iframe 渲染专属模板，并与标准资料分区互斥。
- 修改 `StudentView.vue` 时必须保留模板变量替换、sandbox 边界和标准页面显隐契约。

## 调查与验证

- 先从具体页面、组件、composable 或对应 `tests/` 文件检索，不要遍历全部页面和构建数据。
- 纯静态契约优先运行单个 Vitest 文件：`pnpm --filter site-astro exec vitest run tests/<name>.test.ts`。
- 涉及 Astro/Vue 类型或跨组件接口时运行 `pnpm --filter site-astro typecheck`。
- 只有 SSG 数据、产物或构建行为变化时才运行构建，并显式设置测试用 `VITE_SSG_API_BASE`。
- 只有真实交互、响应式布局、导航生命周期或视觉回归需要时才运行对应 Playwright spec；不要默认运行完整 `test:perf-network`。
