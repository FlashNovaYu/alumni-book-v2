# alumni-book-v2 极致性能架构设计规格

日期：2026-07-19

状态：待用户确认，确认后进入实施计划阶段

## 1. 目标与不可变约束

目标是在保持现有业务能力、视觉语言、权限边界、数据语义和部署安全规则的前提下，降低首屏 JavaScript、页面切换主线程工作、持续动画合成成本、D1 查询放大和图片传输体积。

不可变约束：

- 公开站点、管理后台、同学账号、管理员 RBAC、班级空间、信箱、相册、年度册、个人资料自助编辑继续可用。
- 不降低 PBKDF2、Session、JWT、上传校验、CORS 和隐私过滤强度。
- 不把身份相关数据放入可共享的公共缓存。
- 保留 Astro SSG 的静态输出优势；只有经过基线证明有收益的运行层才替换。
- 现有工作区未提交改动视为用户资产，不覆盖、不隐式撤销；实现时单独验证音效改动的性能影响。

## 2. 当前证据基线

- 线上桌面首页：TTFB 约 140ms、LCP 约 804ms、CLS 0。
- 线上 trace 发现约 469ms 强制回流，主要关联 Astro ClientRouter 交换流程。
- 4× CPU、模拟 4G、390×844：首页 FCP/LCP 约 1.04s，近似 TBT 约 1.26s；软切换到名册约 1.06s、年度册约 1.96s。
- 当前工作树首页首屏约 12.91KB gzip；学生详情页约 68.32KB gzip。
- `pnpm build:site`、`pnpm build:admin`、`pnpm verify:worker`（201/201）、`pnpm verify:shared`、`pnpm --filter site-astro typecheck` 已通过；站点类型检查有 0 错误、10 条提示。
- Playwright 性能网络门禁 5/5 通过，说明已有懒加载边界不能被破坏。

## 3. 架构决策

### 3.1 保留 Astro，移除全站 ClientRouter

Astro 继续负责静态 HTML、页面级数据预取和 Cloudflare Pages 部署。移除 `astro:transitions` 的全站 `ClientRouter`，恢复浏览器原生文档导航，避免长页面交换、视图快照和全量布局成为切换瓶颈。

页面切换反馈改为：

1. 点击后立即显示一个不阻塞输入的顶部进度线；
2. 新文档到达后使用 CSS `opacity/transform` 入场；
3. `prefers-reduced-motion`、窄屏和低性能设备直接跳过入场；
4. 保留学生身份切换、信箱入口和会话守卫，但改为页面脚本在 `DOMContentLoaded`/`pageshow` 阶段执行。

### 3.2 公开站点采用“静态 HTML + 原生增强 + 少量 Vue 应用岛”

将下列低复杂度 islands 改为原生 TypeScript 模块或 Astro 表单增强：

- 首页姓名门控；
- 前言配置展示；
- 名册筛选、分页、轻量卡片交互；
- 相册网格、灯箱和音效开关；
- 时间轴筛选；
- 全局导航会话显示。

保留 Vue 的范围：

- `ClassSpaceHub`、群聊、班级空间复杂状态；
- `MailboxApp`、私信和通知同步；
- `AccountCenter`、资料编辑和密码流程；
- `StudentProfile` 的确有条件的自助编辑/复杂局部交互。

改造不是一次性重写所有组件，而是先建立 `packages/site-astro/src/runtime/` 下的轻量模块边界，让每个页面只加载自身所需脚本。

### 3.3 音效改为原生惰性模块

移除全站 `UiVolumeToggle client:load` 对 Vue runtime 的依赖。音效模块：

- 只在用户第一次点击音量按钮或卡片交互时创建 AudioContext；
- 对纸张噪声使用复用的短 buffer，禁止每次 hover 重新生成随机采样；
- 增加 100ms 节流和页面隐藏暂停；
- 音量偏好继续写入 `localStorage`；
- 纯静态页面只加载小于 2KB 的原生控制脚本。

### 3.4 视觉效果按能力分级

把全局背景拆为三档：

- 高性能桌面：保留一层流体渐变和低频尘粒；
- 普通移动/触控设备：静态渐变，不使用 `blur(100px)` 和 `mix-blend-mode` 动画；
- `prefers-reduced-motion` 或检测到长任务/低内存：关闭流体、尘粒、视差、自定义光标，仅保留颜色和结构。

所有持续动画统一使用 `animation-play-state` 和 `visibilitychange` 停止；移除不必要的永久 `will-change`。

### 3.5 图片与 R2 资源管线

上传时生成：头像 128/256、列表缩略图 320、中图 960、原图四档。优先 WebP，保留原图回退；API 返回 `width`、`height`、`src`、`srcset`、`sizes`。

- 名册、相册、年度册只请求缩略图；
- 个人页照片墙请求中图；
- 灯箱和下载操作才请求原图；
- 所有图片写入固定尺寸或 `aspect-ratio`；
- 保留 R2 immutable、ETag、Range 和边缘 Cache API；
- 将 favicon 压缩为小尺寸 PNG/ICO/WebP，多尺寸总量控制在 40KB 内。

### 3.6 Worker 缓存与 D1 查询

缓存分层：

- `/api/config`、`/api/classmates`、`/api/albums`、`/api/rankings`、公开时间线：`public, max-age=60, s-maxage=60, stale-while-revalidate=300`，保留 ETag；
- `/api/students`：按是否存在身份头选择 `private, no-cache`，并设置 `Vary: Authorization, X-Classmate-Token`；
- 管理、写操作、信箱、班级空间：`private, no-store`；
- `/api/files/*`：继续一年 immutable。

后端查询改造：

- 私信会话列表由 `1 + 3N` 次查询改为 1–3 次批量聚合；
- 群聊先分页消息，再聚合当前页反应；
- 班级空间增加固定扫描上限和游标；
- 管理账号权限覆盖使用批量 `IN` 查询；
- 移除 `julianday(column)` 包装，统一时间格式并补匹配索引；
- 所有 JSON 写接口统一应用请求体上限；
- 清理 cron 增加 `public_request_limits` 过期键删除；
- 访问计数尽量使用 `UPDATE ... RETURNING` 合并读取。

### 3.7 管理后台运行层

- `/api/auth/me` 使用短 TTL 身份缓存和进行中请求去重；401 仍立即清会话。
- 为路由视图增加轻量 skeleton，并在侧栏 hover/focus/idle 时预取高概率 chunk。
- 列表接口统一 cursor/limit，首批 25–50 行；禁止“全量接口 + 全量 DOM”。
- 相册列表只加载缩略图；原图在弹窗中请求。
- 上传压缩/上传队列限制 2 个并发，支持取消和逐文件进度。
- 页面加载绑定 `AbortController`，离页取消未完成请求。
- 移除 Google Fonts 重复入口，补充 `prefers-reduced-motion` 全局规则。

## 4. 实施阶段与验证

### Phase A：运行时减负

验证：首页、时间轴、更多页不再请求 Vue runtime；首屏脚本 gzip 相比当前工作树下降至少 40%；低端软切换 TBT 降低 30%。

### Phase B：转场和持续动画

验证：原生导航或轻量增强下，名册/年度册切换在 4× CPU 模拟 4G 下分别低于 700ms/1200ms；强制回流单次低于 50ms；移动端不出现大面积 blur 动画。

### Phase C：图片派生与前端请求

验证：名册和相册首屏不下载原图；所有图片有尺寸占位；首屏图片传输下降 60% 以上；灯箱仍能打开原图。

### Phase D：Worker/D1

验证：私信列表 D1 调用数在 10 个会话时不超过 3 次；群聊查询复杂度与当前页大小相关；公开 API 命中短缓存时不访问 D1；身份相关响应不会被共享缓存复用。

### Phase E：管理后台

验证：连续切换 10 个后台页面，短 TTL 内 `/api/auth/me` 最多一次；大列表首批不超过 50 条；20 张图片上传最多 2 个并发；离页请求被取消。

### Phase F：质量门禁

新增并纳入 `pnpm verify:all`：

- 站点真实浏览器性能测试；
- 页面级 JS/CSS/HTML/图片预算；
- 缓存头和 `Vary` 回归测试；
- D1 查询数量/分页回归测试；
- reduced-motion 与低能力设备视觉回归；
- 管理后台列表和上传性能测试。

## 5. 全局验收标准

- 桌面首页 LCP 不回退，目标 p75 < 1.5s；
- 移动模拟 4G + 4× CPU 首页 TBT < 600ms；
- CLS < 0.1；
- 名册/年度册低端软切换分别 < 700ms/< 1200ms；
- 页面离开后无轮询、RAF、观察器和事件监听器残留；
- 公开接口重复访问具备真实短缓存或 304，不再每次强制 D1；
- 生产构建无 source map，favicon < 40KB；
- 所有既有功能、权限、会话和安全测试保持通过。

## 6. 风险与回滚

- 原生化 islands 可能引入交互回归：每个页面保留旧 Vue 实现作为可删除前的对照测试，分页面切换。
- 移除 ClientRouter 可能影响身份转场和信箱波纹：先加入原生导航回归测试，再删除旧事件脚本。
- 图片派生会增加上传 CPU 和 R2 对象数量：分阶段只对新上传启用，旧对象保留回退 URL。
- 缓存策略错误可能暴露身份数据：任何带身份头的响应默认 private/no-store，测试先于放量。
- 每个 Phase 单独提交、构建、端到端测试和性能报告；发现核心功能回归时按 Phase 回滚，不使用破坏性 Git 重置。

## 7. 用户确认点

请确认以下三点后进入实施计划：

1. 是否采用“保留 Astro、移除全站 ClientRouter、公开轻交互原生化、复杂应用保留 Vue”的主架构？
2. 是否允许移动端/低性能设备自动关闭模糊、尘粒、视差、自定义光标等非业务特效？
3. 是否允许上传后增加多尺寸 WebP/AVIF 派生对象，并保留原图用于灯箱与下载？
