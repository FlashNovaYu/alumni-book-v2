# Phase 11 稳定性、性能与体验提升验收报告

报告日期: 2026-06-28

## 1. 修复与功能增强摘要

本阶段（Phase 11）全面遵循升级计划，对项目稳定性、缓存性能以及浏览器测试质量防线进行了彻底加固：

1. **观察者生命周期缺陷修复 (P1)**
   - 修复了 `StudentProfile.vue` 在卸载（`onUnmounted`）时由于局部变量作用域不可达导致无法 disconnect 的隐患。将观察者实例变量挂载到组件 setup 作用域中，保证其在卸载时能安全注销。
2. **协商缓存与 ETag Semantics 恢复 (P2)**
   - 重构了 Worker API 的全局缓存中间件：废除了无差别的全局 `no-store`；支持公开 GET 接口（名册、站点配置等）使用 `no-cache` 与 ETag 协商缓存策略，减少了重复下载流量，同时保持了后台/写操作的安全无缓存状态。
3. **前端网络性能网关接入 (P3, P6)**
   - 成功引入 Playwright 端到端浏览器测试框架，并在 `performance-network.spec.ts` 中针对首页、时间轴、同学录等页面在不同交互状态（如滚动加载）下的 JS 网络请求特征进行了严格断言。
4. **清理动画所有权 (P5)**
   - 彻底移除了无用全局动画脚本 `animations.ts`（它包含全局 GSAP 顶层导入）。明确了组件级 GSAP 对其自身动画生命周期的完全所有权，并在 PhotoWall 与 StudentProfile 中加入了异步加载销毁标志，防范了未决 promise 竞态导致的报错。
5. **亮点数据与控制开关直连 (P7, P8)**
   - 为班级图谱与教室座位表亮点板块引入了真实的 Worker 后端轻量 D1 数据聚合端点 (`/api/highlights/class-graph`, `/api/highlights/seat-map`)。
   - 使得前台页面亮点块的渲染完全受后台配置字段（`museum.enabled`, `enableClassGraph`, `enableSeatMap`）所驱动。
6. **非关键资源加载优化与无障碍降级 (P10, P11)**
   - 对不支持 `requestIdleCallback` 的浏览器优化了 `runWhenIdle` 降级逻辑。
   - 将个人页访问计数接口推迟到 idle 阶段，且音频播放预加载改为惰性策略以防止慢网加载阻塞。
   - 在静态测试中新增了关于 prefers-reduced-motion CSS 覆盖和音频预加载的断言检验。

---

## 2. 自动化验证数据

### 1) 单元与集成测试套件运行情况 (`pnpm verify:worker` & `pnpm --filter site-astro test:with-build`)

经过本阶段测试升级，前后端全套测试套件运行情况：

- **Worker API 测试**：
  - 补充了对公开名册 Cache-Control 与 config 配置 ETag 缓存重验证测试用例。
  - 编写了对亮点端点 `/class-graph` 和 `/seat-map` 返回 JSON 数据结构的集成测试。
  - **运行结论**：36 个测试全部 Passed。
- **Astro 静态与生命周期测试**：
  - 新建了 `student-profile-lifecycle.test.ts` 观察者作用域回归测试，以及 `animation-ownership.test.ts` 全局 GSAP 污染检查回归测试。
  - 追加了对音频不默认自动预加载以及 prefers-reduced-motion 的 CSS 类规则断言。
  - **运行结论**：19 个测试全部 Passed。

### 2) 页面级首屏 JS 预算检测结果 (`node scripts/perf-budget.mjs`)

通过对各页面编译产物依赖链路的递归分析，验证了亮点占位模块在进入视口前完全不向首屏引入第三方依赖：

- **首页 (Home) (/)**: **1.96 KB** (Gzip) (预算限制 <= 55 KB) ── ✅ 达标
- **时光轴 (Timeline) (/timeline/)**: **0.71 KB** (Gzip) (预算限制 <= 45 KB) ── ✅ 达标
- **同学录 (Roster) (/roster/)**: **4.02 KB** (Gzip) (预算限制 <= 95 KB) ── ✅ 达标
- **学生详情页 (Student Template) (/student/template/)**: **0.98 KB** (Gzip) (预算限制 <= 145 KB) ── ✅ 达标

---

## 3. 验收标准达成对照表

- **P1** 观察器清理：已修复并经 vitest 回归测试保护，卸载不抛错 ── ✅ 达成
- **P2** ETag/SWR 缓存：后端已支持并经集成测试断言，前端 fetch 去除无用 `no-cache` ── ✅ 达成
- **P3, P6** Playwright 性能网关：网络加载和滚动懒加载断言已作为测试门禁 ── ✅ 达成
- **P4** 报告过时：所有统计数字已按最新构建实测进行纠偏 ── ✅ 达成
- **P5** 清理 animations.ts：已物理删除且经回归测试防范 ── ✅ 达成
- **P7, P8** 开关控制与真实亮点 API：已实现前后端配置开关消费和 D1 数据图谱/座位端点绑定 ── ✅ 达成
- **P9** 静态类型检查：集成 `vue-tsc` 类型门禁到验证链中 ── ✅ 达成
- **P10** idle fallback 提速：回退时使用 80ms 紧凑延时 ── ✅ 达成
- **P11** 音乐预加载优化：默认为 `none`/`metadata` ── ✅ 达成
- **P12** 脏文件与本地工具：在 `.gitignore` 中加入对 `start-brainstorm-stable.ps1` 的过滤，消除污染 ── ✅ 达成
