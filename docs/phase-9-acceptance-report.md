# Phase 9: 性能验收闭环与体验深度优化验收报告

报告日期: 2026-06-27

---

## 1. 优化任务完成摘要

本阶段（Phase 9）主要针对前几个阶段遗留的重型库误加载、动画所有权冲突、慢网白屏隐藏等待、性能测试盲区等问题进行了系统性收口与硬隔离。

### 核心优化任务完成清单

- **MainLayout 动画依赖解耦**
  - 新建 `globalReveal.ts` 基于原生 `IntersectionObserver` 替代全局 GSAP，彻底避免全站打包 `MainLayout` chunk 时引入 GSAP/ScrollTrigger。
- **列表及留言组件去 GSAP 化**
  - 重构 `RosterWall.vue`（同学录）和 `MessageWall.vue`（留言墙）为纯 CSS Stagger 动画，不仅大幅缩减包体积，且完全规避了 SWR 更新和过滤搜索引发的闪烁重播问题。
- **慢网隐藏等待防护 (FOUC)**
  - 移除了原先用于等待 JS 动画的 `.js .classmate-card` 等强隐藏 CSS 规则，确保在网络差、JS 尚未载入或禁用的设备上，页面主要内容（卡片、留言、表单）仍然能即时呈现，实现优雅降级。
- **移动端与低端设备体验打磨**
  - 解决了悬浮音乐播放器（原本在 bottom-right 24px）与分享 TA 按钮重合的排版 Bug，将音乐播放器移至左下角（bottom-left 24px），实现左右对称排版。
  - 在移动端（屏幕宽 <= 768px）默认关闭背景视差动画，提高小屏滑动的帧率。
- **API 性能与缓存硬优化**
  - Worker 新增 `/api/classmates/verify?name=` 单名字轻量校验接口，首页 `NameGate.vue` 提交名字验证时传输量从全量名册的数 KB 降至 50 字节以下，并消除了首屏的无意义拉取。
  - 为 Worker 的 D1 基础数据公开 GET 接口（配置、排行榜、学生详情等）启用 `etag()` 强缓存校验。
  - 前端 fetch 支持 `fetchJsonIfChanged`。当 API 数据未变时拦截 304 响应，直接读取本地 sessionStorage，极大地减少了网络带宽占用和重绘开销。
  - R2 静态资源响应添加 `Cache-Control: public, max-age=31536000, immutable` 长缓存，并支持 304 校验。

---

## 2. 自动化验证数据

### 1) 页面级首屏 JS 预算检测结果 (`node scripts/perf-budget.mjs`)

通过对各页面 HTML 中所有 module scripts 以及 preload 依赖树的递归统计，实测首屏体积与 GSAP 加载情况：

| 页面 | HTML 入口数 | 依赖链合计 JS 数量 | 首屏 JS (Gzip) | 预算限制 (Gzip) | 禁用资源 (gsap/ScrollTrigger) 命中情况 | 结论 |
|---|---|---|---|---|---|---|
| **首页 (Home) (/)** | 2 | 4 | **1.80 KB** | <= 55 KB | 0 命中 (完全未请求) | ✅ 通过 |
| **时光轴 (/timeline/)** | 1 | 3 | **0.71 KB** | <= 45 KB | 0 命中 (完全未请求) | ✅ 通过 |
| **同学录 (/roster/)** | 3 | 5 | **3.47 KB** | <= 95 KB | 0 命中 (完全未请求) | ✅ 通过 |
| **学生详情页 (/student/template/)** | 2 | 4 | **0.96 KB** | <= 145 KB | 仅水合时未请求 (可见后异步加载) | ✅ 通过 |

### 2) 单元测试运行结果 (`pnpm --filter site-astro test`)

更新后的静态测试（包含对 index 和 timeline 依赖链递归扫描）及隐私校验全部顺利通过：

```bash
 ✓ tests/privacy-static.test.ts (1 test) 15ms
 ✓ tests/feature-static.test.ts (3 tests) 14ms
 ✓ tests/performance-static.test.ts (4 tests) 25ms
 ✓ tests/navigation.test.ts (5 tests) 30ms

 Test Files  4 passed (4)
      Tests  13 passed (13)
```

---

## 3. 残留风险与可选验证

### 可选 Playwright 冒烟测试运行
如果后续测试需要配合真实浏览器验证，我们已新增可选的网络拦截规格文件 `packages/site-astro/tests/performance-network.spec.ts`。可在配置完本地 Playwright 环境后运行以下命令启动真实网络冒烟校验：
```bash
# 启动本地预览
pnpm --filter site-astro preview

# 启动网络断言测试
pnpm --filter site-astro test:perf-network
```
*(注：由于 Playwright 依赖于特定的操作系统二进制包，默认的 CI 中未包含它，可作为本地上线前的最后防线人工触发。)*
