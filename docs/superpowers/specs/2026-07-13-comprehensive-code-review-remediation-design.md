# 全面代码审查与稳定化整改设计

## 背景

本轮工作以“保持现有产品能力不变”为首要约束，对公开站点、管理后台、共享包、Cloudflare Worker、部署脚本和质量门禁进行证据驱动的审查。基线验证确认：Worker 与后台主测试通过，公开站点存在一项群聊滚动契约冲突，共享包独立类型检查失败，默认验证命令遗漏多项现有测试，依赖审计存在高危公告，且当前工作树包含尚未提交的日期组件、群聊滚动和部署脚本改动。

用户已明确确认：

- 群聊内部滚动到边界后，继续滚动应穿透到外层页面。
- 专属模板 iframe 移除同源权限，仅保留脚本能力。
- 其余整改采用证据驱动的稳定化方案。
- 完全移除 GSAP，改用更轻量的原生动画方式。

## 目标

1. 修复已复现的功能、安全、隐私、部署和质量门禁问题。
2. 保持用户可见功能和数据契约稳定；唯一明确收紧的能力是专属模板不再访问同源 API 与存储。
3. 删除无引用代码和不必要的大型依赖，降低安装体积与运行时加载风险。
4. 消除可证明的 Worker N+1 查询，不做无量化收益的首屏重构。
5. 所有修复先建立失败测试或失败门禁，再写最小实现。

## 非目标

- 不升级到 Astro 6；该升级涉及 Node 版本和框架主版本迁移，超出“保持原有功能不变”的风险边界。
- 不拆分 `workers/api/src/index.ts` 或大型 Vue 组件；本轮只在修复直接涉及的边界内调整结构。
- 不把两个日期选择器强行合并为跨包 Vue 组件。站点与后台保持包级隔离，只清理确定无效的只读输入逻辑。
- 不修改现有空文件 `{`，因为无法证明它属于本轮任务或可以安全删除。
- 不为已经达到 LCP 216ms、CLS 0、首页首屏 JS 12.08KB gzip 的页面添加推测性优化。

## 方案与取舍

### 采用：证据驱动的稳定化整改

只修复可复现或能由数据流证明的问题，兼顾安全、功能、结构和性能。依赖升级限制为兼容补丁版本；主版本风险单独记录。

### 未采用：仅修安全问题

该方案无法解决部署回归、漏跑测试、后台治理功能覆盖、共享包类型失败和 Worker N+1 查询，不满足全面审查目标。

### 未采用：深度现代化重构

同时升级 Astro 6、重组包结构和拆分 Worker 会显著扩大行为变化面，且无法证明对当前性能有必要收益。

## 详细设计

### 1. 群聊滚动穿透

保留 `.chat-log` 的 `overscroll-behavior-y: auto`，让浏览器在聊天区到达顶部或底部时使用原生滚动链把后续滚动传给页面。删除手工 `wheel`、`touchstart`、`touchmove` 监听和 `window.scrollBy()` 转发；这些代码重复浏览器能力，会增加主线程事件处理、触摸边界计算和跨设备差异。

现有历史消息加载、保持滚动位置、新消息计数和列表底部对齐逻辑保持不变。静态测试从断言 `contain` 改为断言 `auto`，并禁止重新加入非被动滚动转发监听。

### 2. 部署安全

`scripts/prepare-pages-deploy.mjs` 恢复为纯构建准备步骤：

- 扫描到公开 Worker 旧域名时立即失败，不自动改写产物。
- 不调用 `wrangler pages deploy`。
- 不写死 `--branch main` 或 `--commit-dirty=true`。

扩展部署安全测试，直接覆盖准备脚本，防止以后再次绕过 GitHub Actions 的生产审批、提交 SHA 校验和单一写入者约束。

### 3. 前端 XSS 与模板隔离

- `PrefaceWall.vue` 使用 Vue 文本插值渲染前言，CSS `white-space: pre-line` 保留换行，不再使用 `v-html`。
- 时光轴初始 JSON 在写入 `<script type="application/json">` 前转义 `<`、`>`、`&` 和 Unicode 行分隔符，防止 `</script>` 提前闭合；运行时仍通过 `textContent` 与 `JSON.parse` 读取。
- 专属模板 iframe 的 sandbox 改为仅 `allow-scripts`，移除 `allow-same-origin`。占位符、内联脚本、图片和音乐资源继续工作；同源 API、Cookie、localStorage 和 sessionStorage 访问不再可用，这是用户明确批准的安全边界。

### 4. 隐私数据最小化

`accountStatus` 与 `accountLastLoginAt` 只对资料本人和管理员返回。匿名访问与其他同学访问时从响应对象删除这两个字段。现有个人资料字段可见性规则保持不变，并补充四种 audience 的 Worker 回归测试。

### 5. 后台治理功能恢复

以现有 `permissions-static.test.mjs` 和 Worker 已存在的管理 API 为契约，恢复历史公共投稿的：

- 隐藏/恢复；
- 置顶/取消置顶；
- 精选/取消精选；
- 删除；
- 审核人信息展示。

所有按钮继续受 `canManage` 权限控制，操作成功后只更新对应列表项，不整页刷新。

### 6. 文件 URL 修复

专属模板变量中的 `musicUrl`、`backgroundUrl` 已可能是 `/api/files/...` 相对 URL。统一使用已有 `joinApiUrl` 规则：绝对 URL 原样保留，以 `/api/files/` 开头的路径直接拼 API base，只有裸 R2 key 才补 `/api/files/`。避免生成 `/api/files//api/files/...`。

### 7. Worker 查询优化

`GET /api/students` 当前为每一名学生重复解析相同的管理员或同学会话。改为每次请求只解析一次 viewer：管理员、同学 slug 或匿名；随后在内存中按目标学生 slug 推导 `admin`、`owner`、`classmates`、`public` audience。

响应内容和权限语义不变，D1 会话与权限查询从 O(学生数) 降为 O(1)。单学生接口复用相同 viewer 解析函数。

### 8. GSAP 与死依赖移除

照片墙的 GSAP stagger 入场替换为 CSS：

- 每个照片项通过索引 CSS 变量计算短延迟；
- 只动画 `opacity` 和 `transform`；
- `prefers-reduced-motion: reduce` 下立即显示；
- 灯箱 Vue Transition、键盘控制和图片预加载不变。

随后从站点依赖和锁文件移除 `gsap`。

审查同时确认 `src/components/ui/` 下 React/Framer Motion 导航示例没有任何入口引用，并被 TypeScript 显式排除，且引用了未安装的 `next/link`。删除这两个死文件以及只被它们使用的 `framer-motion`、`lucide-react`、`react`、`react-dom`、对应类型包；`lucide-vue-next` 也无任何源码引用，一并删除。Astro 配置仍只保留 Vue 集成。

### 9. 共享包与日期组件精简

共享包的 `apiFetch` 在仓库内无消费者，却直接读取 Vite 专属 `import.meta.env`，导致共享包自己的 TypeScript 门禁失败。删除该未使用客户端，保留会话、转义和日期工具。

日期输入已设为 `readonly`，因此删除永远不会触发的 `input`、`blur`、`keyup.enter` 监听及其校验函数。日历选择、月份/年份导航和 v-model 输出保持不变。两个组件保持内容同步，但不增加跨包 UI 依赖。

### 10. 质量门禁与依赖补丁

- 根级验证加入共享包 `typecheck`。
- 后台默认测试执行现有 `test:static`。
- 站点 Vitest 清单加入遗漏的 `museum-viewmodels.test.ts`、`public-ui-feedback-static.test.ts`。
- Playwright 清单加入遗漏的 `navigation-marker-direction.spec.ts`、`roster-pagination.spec.ts`。
- 新增全仓依赖契约：生产源码与清单不得再包含 GSAP；已删除 React 示例依赖不得回归。
- 将 Hono 和 Vite 更新到修复高危公告的兼容补丁版本。
- Astro 5 无可用安全回移版本的公告记录为剩余风险；当前站点为静态输出，不以开发服务器作为生产入口。Astro 6 升级另行设计。

## 测试顺序

1. 先修改或新增契约测试，使其针对当前问题明确失败。
2. 分批实现：部署与 CI、安全与隐私、功能恢复、查询优化、依赖与死代码清理。
3. 每批运行最小相关测试，再运行受影响包的类型检查与构建。
4. 最终执行：Worker 全测、后台全测与构建、共享包类型检查、站点静态与浏览器测试、性能预算、依赖审计。
5. 重新采样首页性能，确认 LCP/CLS 不退化，并确认构建产物不含 GSAP、Framer Motion 或 React chunk。

## 验收标准

- 所有默认验证命令覆盖仓库内现有测试且全部通过。
- 群聊滚动可原生穿透，历史加载与新消息行为不退化。
- 准备脚本无法直接发布生产。
- 前言、时光轴和专属模板的三条 XSS/隔离风险有回归测试。
- 匿名和其他同学无法读取账号内部元数据。
- 后台历史投稿治理操作完整可用且受权限控制。
- `/api/students` 每次请求只解析一次 viewer。
- 共享包独立类型检查通过。
- 源码、依赖清单、锁文件和构建产物均不再包含 GSAP；无引用 React 示例及其依赖被删除。
- 性能预算通过，首页关键指标不劣于审查基线的可接受范围。

## 剩余风险

- Astro 依赖公告需要主版本升级才能彻底清除；本轮不以高风险框架迁移换取表面上的零告警。
- 新数据库仍保留旧版 `admin888` 初始化兼容流程。它属于现有部署/初始化契约，修改需要独立的首次部署与密钥引导设计。
- 专属模板移除同源权限后，依赖同源 fetch 或浏览器存储的自定义模板需要改为纯展示脚本或显式的受控消息桥；当前生产数据未发现启用中的自定义模板。
