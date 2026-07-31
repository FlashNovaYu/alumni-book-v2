# 全站动画性能优化设计说明

## 目标

在不改变网站业务功能、路由、数据、登录、媒体加载、页面转场和现有视觉层级的前提下，降低全站动画在主线程、布局读取、合成层和长期 RAF 上的开销，重点改善滚动、指针移动、人物卡片交互和学生详情页的持续帧表现。

本次优化以当前 Astro SSG + Vue islands 架构为边界，不引入 GSAP、Three.js、WebGL 或新的动画框架。现有用户未提交的全局主题色、星空主题变量和视觉改动必须保留，并作为当前实现的输入契约。

## 当前基线与问题边界

基线来自 2026-08-01 本地 Astro preview 和 Chrome DevTools trace；当前已有 `dist` 用于浏览器观察，未因本设计重新构建。

- 首页 LCP 约 297–359ms，CLS 为 0。
- 首页 trace 发现约 157–180ms 的强制回流，主要归因于 Astro ClientRouter 初始化；该项没有工具估算的可节省时间，本次不扩大为导航框架重构。
- 学生详情页连续滚动测得平均帧间隔约 11.2ms，P95 约 16.8ms，出现 4 个超过 33ms 的帧；该页面是本次滚动性能的主要验收对象。
- 当前源码静态统计包含 7 个 `requestAnimationFrame`、13 处 `will-change`、17 处 `filter: blur`、8 处 `backdrop-filter`；这些是候选点，不代表全部需要删除。
- 已有站点性能相关静态测试 26/26 通过，当前站点没有 GSAP/ScrollTrigger 运行时依赖。

高置信度热点如下：

1. `StarfieldCanvas.astro` 作为 `MainLayout` 的全局背景，在每个页面持续绘制 Canvas；当前绘制循环每帧读取主题和环境 CSS 变量，并遍历星体。
2. `MuseumHero.astro` 的首页视差在滚动 RAF 中解析 `data-parallax`，磁吸入口在指针移动时读取 `getBoundingClientRect()`。
3. `useMouseTilt.ts` 的卡片指针处理在事件频率下读取布局并直接改变响应式状态；方向传感器开启后持续 RAF 更新所有已注册状态。
4. `ArchiveRosterCard.vue` 的每张卡片长期声明 `will-change: transform`；桌面端人物卡片页最多同时存在 12 张交互卡片。
5. `MainLayout.astro` 的自定义光标在每个指针事件中直接写 transform 并频繁切换状态 class。

## 保护规则

- 不修改 API、数据库、认证、会话、路由、分页、媒体 URL、懒加载边界或表单行为。
- 不改变星空、视差、磁吸、卡片光影、陀螺仪、页面转场和自定义光标的可用功能；优化只改变调度频率、重复工作和生命周期。
- 保留 `prefers-reduced-motion: reduce` 的静态终态和所有现有降级分支。
- 保留用户当前工作区中的主题 token，包括 `--star-*`、`--hero-*`、`--surface-*` 和其他未提交颜色映射；性能修改不能通过回退主题变量来解决问题。
- 只修改性能优化直接涉及的文件；不顺手格式化、重排 CSS 或清理无关代码。
- 所有新增监听器、RAF、Observer 和缓存都必须在 `pagehide`、组件卸载或 Astro 文档交换时清理。
- 对浏览器不支持 `navigator.deviceMemory`、`ResizeObserver` 或相关媒体查询的情况使用现有功能等价的默认路径。

## 设计方案

### 1. 统一的动画预算

在现有 `src/utils/motion.ts` 中增加轻量的客户端能力判断，不引入新的全局状态管理。动画预算分为三档：

- `full`：精细鼠标设备、没有 `saveData`、硬件能力正常时，保留当前完整交互。
- `light`：移动端、`saveData`、低 `deviceMemory` 或低 `hardwareConcurrency` 时，保留动画语义，但降低背景粒子和持续装饰的更新频率；不禁用点击、滚动、转场或触摸反馈。
- `reduced`：`prefers-reduced-motion: reduce` 时，直接使用现有静态终态。

能力判断只用于装饰动画调度，不改变内容加载、布局或功能。判断结果在每个 runtime 初始化时读取，避免在每帧读取媒体查询或 navigator 属性。

### 2. 全局星空 Canvas

修改 `StarfieldCanvas.astro`，保留当前用户主题变量和确定性星体布局：

- 将主题 RGB、透明度、混合模式和当前环境偏移缓存到绘制闭包中；`getComputedStyle()` 不再作为每帧的常规工作。
- 通过主题变化、尺寸变化和环境偏移更新缓存；绘制函数只消费缓存，不读取 DOM 布局。
- 对动画循环增加帧预算：`full` 使用约 30fps 的背景刷新，`light` 使用更低频率；静态首帧仍立即绘制，减少动态效果时不启动循环。
- 保留当前可见性暂停、ResizeObserver、Astro swap 和 pagehide 清理逻辑；切回可见时只恢复一个 RAF 链。
- 避免在每个星体上重复创建不必要的样式字符串或频繁切换 Canvas shadow 状态；实现中应优先使用预计算的颜色/透明度桶，确保当前纸张和夜读主题的视觉语义不变。
- 不删除两个雾光层，但只在真正运行时使用合成层提示；不为所有页面内容新增额外固定背景层。

成功标准：背景仍有可辨识的漂移、主题映射和陀螺仪偏移，但页面不再被 60fps 的全屏 Canvas 绘制强制占用。

### 3. 首页视差与磁吸

修改 `MuseumHero.astro`：

- 初始化时一次性解析每个 `[data-parallax]` 的 speed，后续 RAF 只遍历数值和写入 CSS 变量。
- 用 Hero 可见性作为视差运行条件；Hero 离开视窗时取消待执行 RAF，返回时恢复，不改变滚动定位和锚点行为。
- 保留现有滚动监听的 passive 属性与 cleanup；同一帧内最多执行一次写入。
- 磁吸效果改为“指针事件记录目标值 + RAF 应用”，尺寸在 pointerenter/resize 等低频时机读取；不再为每个 pointermove 都调用 `getBoundingClientRect()`。
- 离开元素时仍立即回到零偏移，保证现有 hover/触摸结束行为不变。

### 4. 卡片倾斜与陀螺仪

修改 `useMouseTilt.ts` 和直接消费它的卡片组件：

- 指针移动只记录待处理坐标，使用 RAF 合帧更新响应式 TiltState；同一帧最多触发一次 Vue 状态更新。
- 卡片尺寸使用短生命周期缓存，并在进入、离开、窗口 resize 或布局失效时更新；最终旋转范围、光晕坐标和触摸结束行为保持不变。
- 方向传感器循环加入稳定阈值和低频预算：状态接近目标时停止无意义的连续帧；收到新方向事件时重新调度。所有卡片共享同一方向循环，不增加新的传感器监听器。
- 只有状态实际变化时才写入全局环境变量和卡片状态，避免重复触发样式计算。
- `ArchiveRosterCard.vue` 移除所有卡片长期占用的 `will-change`，改为仅在精细指针交互期间启用，触摸设备不创建不必要的合成层。

### 5. 自定义光标与通用 CSS

修改 `MainLayout.astro` 和 `custom-cursor.css`：

- 指针位置使用单一 RAF 合帧；同一帧只更新一次 cursor transform。
- 只有可点击/文本/按压状态真正改变时才切换 class，避免重复 classList 操作。
- `will-change` 只保留 transform 和 opacity 等确实持续变化的属性；保留尺寸、颜色和按压过渡的视觉行为。
- 对本次触及的 `transition: all` 改成明确的 `transform`、`opacity`、`background-color`、`border-color` 等属性，避免无关属性变化触发过渡。
- 不移除自定义光标，不改变精细指针判断，也不在触摸设备上新增光标节点。

### 6. 低性能与减少动效策略

- `light` 只降低全屏星空、雾光、视差、磁吸和陀螺仪的持续更新预算；卡片点击、导航、表单反馈、相册 lightbox 和消息交互保持原有功能。
- `reduced` 继续由现有 CSS 和 runtime 分支控制，所有动画元素回到可读、可操作的静态终态。
- 不使用 `content-visibility`、虚拟列表或大范围 DOM 延迟渲染作为本次默认策略，避免改变滚动高度、锚点和懒加载时序。

## 文件边界

预计直接修改：

- `packages/site-astro/src/utils/motion.ts`
- `packages/site-astro/src/components/StarfieldCanvas.astro`
- `packages/site-astro/src/components/MuseumHero.astro`
- `packages/site-astro/src/composables/useMouseTilt.ts`
- `packages/site-astro/src/components/ArchiveRosterCard.vue`
- `packages/site-astro/src/layouts/MainLayout.astro`
- `packages/site-astro/src/styles/custom-cursor.css`
- 直接覆盖 `transition: all` 的少量交互组件及其对应静态测试

如果实现过程中发现共享调度逻辑确实需要独立单元，优先扩展现有 motion 工具；除非测试表明必要，不新增跨页面状态容器。

## 验收标准

### 功能与视觉

1. 首页、人物长廊、相册、时间轴、年鉴、信箱、学生详情页和聊天相关交互行为保持原有结果。
2. 星空主题、纸张/夜读模式、视差、磁吸、卡片倾斜、陀螺仪、光标、页面转场和 `prefers-reduced-motion` 均有对应回归证据。
3. 页面切换、BFCache、Astro swap、组件卸载后不残留 RAF、事件监听器或 Observer。

### 性能

1. 在同一 Chrome 环境复测，学生详情页连续滚动 P95 帧间隔从约 16.8ms 降至不高于 12ms，且不出现超过 33ms 的帧；如硬件环境波动，则至少相对基线改善 25%。
2. 首页和人物长廊静置/滚动不产生新的长任务；LCP 不得比基线恶化超过 10%，CLS 保持 0。
3. 全局星空在普通设备不再以每个显示刷新周期执行完整绘制；低性能档进一步降低持续绘制预算。
4. 网络请求数量、按需 island 边界和 GSAP/ScrollTrigger 禁止加载契约不回退。

### 工程验证

- 运行现有动画、性能、主题、学生生命周期和导航静态测试。
- 运行 `pnpm --filter site-astro typecheck`。
- 使用显式 `VITE_SSG_API_BASE` 构建后运行站点性能/网络 Playwright 测试。
- 使用 Chrome DevTools 对首页、人物长廊、学生详情页采集 trace，并记录 LCP、CLS、强制回流、P95 帧间隔和超过 33ms 的帧数。
- 不执行生产部署；部署前由后续发布验收单独处理。

## 回滚边界

性能优化应以独立提交完成，只允许回滚该提交或其中的任务文件；不得使用 `git reset --hard`、`git checkout --` 或覆盖当前用户已有未提交改动。若某个局部优化影响视觉回归，先回退该局部调度策略，保留已证明安全的其他优化。
