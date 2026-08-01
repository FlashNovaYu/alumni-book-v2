# 全局 UI/UX 配色统一与舒适度优化设计说明

## 1. 目标

在不改变路由、认证、数据字段、接口、交互行为和页面结构的前提下，统一同学录全局 UI/UX 的颜色契约，修复日间/夜间主题之间的视觉漂移，并让星空背景、导航、档案卡片、表单、消息、弹层和状态提示共享同一套暖金档案馆视觉语言。

本方案以参考视觉文件的“深绿黑 + 暖金 + 砖红印章”和“米纸 + 褐墨 + 低饱和砖红”为基准，保留当前已有的星空 Canvas、自定义光标、方形档案卡、导航动效和移动端陀螺仪光影。

## 2. 设计取向

### 2.1 视觉人格

- 主题人格：参考稿级档案馆暖金。
- 视觉密度：中等偏疏，优先阅读舒适和内容层级。
- 强调策略：单一主强调色体系，金色负责行动与聚焦，砖红负责印章/提醒，档案绿只作为低频状态辅助色。
- 表面策略：纸张模式使用有温度的米纸阶梯；夜读模式使用深绿黑阶梯；两套都保留轻微纹理与半透明边界。

### 2.2 设计原则

1. 组件只引用语义 token，不再自行猜测颜色。
2. 日间与夜间成对设计，不做简单反色。
3. `--text-dim` 仅用于装饰线、编号和弱提示，真实正文统一走 `--text-muted` 或更高层级。
4. 所有填充强调面显式使用 `--on-accent`，不再依赖“背景色刚好可读”的隐式关系。
5. 固定背景、Canvas、卡片高光和光标都从同一主题 token 取值。
6. 组件专属风格可以保留，但必须通过局部 token 接入全局主题。

## 3. 主题 token 设计

### 3.1 语义角色

共享 token 继续采用 Primitive → Semantic → Component 三层结构。新增或收敛以下角色：

| 角色 | 用途 |
| --- | --- |
| `--surface-canvas` | 页面最底层背景 |
| `--surface-sunken` | 输入区、分组底、弱化区域 |
| `--surface-raised` | 普通卡片、导航和抽屉 |
| `--surface-paper` | 纸张卡片、选中层、内容面 |
| `--surface-overlay` | 半透明导航、弹层和浮动工具 |
| `--text-primary` | 标题和主要内容 |
| `--text-secondary` | 正文和次级内容 |
| `--text-muted` | 辅助说明、时间、元信息 |
| `--text-dim` | 装饰编号、发丝线和非语义标记 |
| `--accent` | 默认行动色 |
| `--accent-strong` | hover、active、焦点和高亮 |
| `--accent-soft` | 选中背景和弱高光 |
| `--on-accent` | 放在强调背景上的文字和图标 |
| `--stamp` / `--stamp-soft` | 印章红、未读标记、提醒 |
| `--state-archive-green` | 成功或已归档等低频状态 |
| `--border-subtle` / `--border-strong` / `--border-glass` | 主题适配边界 |
| `--focus-ring` | 键盘焦点和可访问性提示 |
| `--shadow-rgb` 与阴影 token | 不同主题的有色阴影基底 |
| `--star-core-rgb` / `--star-halo-rgb` / `--star-mix-mode` | 星空 Canvas 与雾光层 |
| `--hero-ink` / `--hero-ink-soft` / `--hero-scrim` | 首页深色封面文字与遮罩 |

### 3.2 纸张日间模式

日间模式维持温暖纸张，但降低黄褐饱和度，避免长时间浏览发刺：

| 角色 | 目标值 |
| --- | --- |
| canvas | `#F1E7CE` |
| sunken | `#ECE0C2` |
| raised | `#FBF6E9` |
| paper | `#FFF8EA` |
| primary ink | `#221A10` |
| secondary ink | `#4A3C24` |
| muted text | `#7C6C49` |
| dim text | `#A98E5E`，仅装饰使用 |
| accent | `#8A6A2F` |
| accent-strong | `#6E5322` |
| on-accent | `#FBF6E9` |
| stamp | `#A23B2A` |
| stamp-soft | `rgba(162, 59, 42, .12)` |
| archive green | `#4A7159` |
| focus | `#2D4636` |
| star core | `113 86 47` |
| star halo | `162 59 42` |
| star mix | `multiply` |

### 3.3 夜读模式

夜间模式维持深绿黑，不使用纯黑；金色高光分成常态与强态，避免整页过亮：

| 角色 | 目标值 |
| --- | --- |
| canvas | `#0B120E` |
| sunken | `#101813` |
| raised | `#161F19` |
| paper | `#1D2820` |
| primary ink | `#EDE6D2` |
| secondary ink | `#C7C0A4` |
| muted text | `#93A092` |
| dim text | `#68766A`，仅装饰使用 |
| accent | `#C9A24B` |
| accent-strong | `#E7CE8C` |
| on-accent | `#1B1508` |
| stamp | `#B24630` |
| stamp-soft | `rgba(178, 70, 48, .16)` |
| archive green | `#4C8267` |
| focus | `#E7CE8C` |
| star core | `242 231 201` |
| star halo | `201 162 75` |
| star mix | `screen` |

### 3.4 状态色

成功、警告、错误和信息色保留现有语义，但补充主题下的 soft 背景 token。状态色只表达状态，不参与品牌强调，避免与金色/砖红混用。

## 4. 组件迁移边界

### 4.1 共享 token 与兼容别名

- 在 `packages/shared/src/tokens.css` 完成两套主题的语义 token 收敛。
- 保留已有兼容别名，确保现有组件功能不变。
- 将 `--color-primary-light`、`--color-on-primary` 等历史别名明确映射到新 token。
- 删除组件 fallback 中与主题无关的 `#cc785c`、`#ffdcd2`、纯白/纯黑等旧值；缺少 token 时应回退到共享语义值，而不是另起一套色板。

### 4.2 导航、按钮、表单和状态

- `TopNav.astro`、移动抽屉和滚动导航统一使用 `--surface-overlay`、`--border-glass` 和 `--on-accent`。
- `.btn-*`、日历、登录、编辑面板、聊天发送按钮统一使用 `--accent` / `--accent-strong` / `--on-accent`。
- 输入框、占位符、错误提示、徽章和未读标记分别使用明确的文字与状态 token。
- 保持现有尺寸、点击区域、键盘路径和提交逻辑不变。

### 4.3 星空背景与首页封面

- `StarfieldCanvas.astro` 不再直接写死 RGB；每次绘制从根元素读取 `--star-core-rgb`、`--star-halo-rgb` 和透明度 token。
- `.page-shell` 不再绘制与 Canvas 重复的固定星点，只保留纸张纹理/噪点和主题适配的背景洗色，避免叠层发灰。
- 首页 `MuseumHero.astro` 的深色封面仍保持深色视觉，但文字、遮罩、边框和渐变改为 `--hero-*` token，以便日夜模式保持一致的层级关系。
- 保留现有星空漂移、雾光、指针/陀螺仪位移与减少动态效果降级。

### 4.4 档案卡、相册与光标

- `ArchiveRosterCard.vue` 保留方形构图和鼠标局部高光，只将卡片边框、表面、编号、装订孔和高光颜色接入新 token。
- `AlbumGrid.vue`、`PhotoWall.vue` 的照片本身不改色；框架、控制按钮、空状态和灯箱遮罩接入主题 token。
- 自定义光标继续使用 accent 体系，常态使用 `--accent-strong`，悬停环使用 `--accent-soft`，不新增第二套光标颜色。

### 4.5 留言墙等局部风格

- 纸张、黑板、信纸和照片背板仍作为内容风格保留。
- 将其硬编码色值收敛为 `--message-*` 局部 token，并在日间/夜间分别映射。
- 局部风格只改变内容卡片的材质，不改变全局文字层级、按钮语义和主题切换行为。

## 5. 可访问性与响应式要求

- 日间和夜间普通正文对背景对比度不低于 4.5:1，大号文字和图形不低于 3:1。
- `--text-dim` 不得用于真实正文；空状态和花名录计数改用 `--text-muted`。
- 所有强调背景上的文字必须使用 `--on-accent`，焦点环在两种主题均清晰可见。
- 不改变现有 44px 触控目标、移动端抽屉、键盘导航和减少动态效果行为。
- 375px 宽度下不出现横向滚动，不因颜色迁移改变布局尺寸。

## 6. 验证方案

### 静态验证

- 新增全局主题静态契约测试，检查 token、`--on-accent`、星空 token 和禁止的旧硬编码值。
- 更新双主题、首页氛围、导航、档案卡和移动端主题相关测试。
- 检查源码中纯 `#fff` / `#000`、旧橘红 fallback、Canvas 固定 RGB 和 `text-dim` 正文使用。

### 类型与构建

- `pnpm --filter site-astro exec vitest run` 运行受影响静态测试。
- `pnpm --filter site-astro typecheck`。
- 使用显式 `VITE_SSG_API_BASE` 完成站点构建；本轮不改变 API、SSG 数据和自托管运行时契约。

### 浏览器验收

- 在纸张模式和夜读模式分别检查首页、花名录、班级空间、年度册、更多、账号、信箱和灯箱。
- 验证主题切换后导航、星空、卡片高光、光标、表单焦点和状态提示同步变化。
- 在桌面和 375px 移动宽度检查无横向滚动、无控制台错误、文字可读、交互行为不变。
- 验证 `prefers-reduced-motion: reduce` 下背景与卡片进入静态清晰终态。

## 7. 明确不做

- 不改路由、页面标题、导航顺序、接口、认证、数据库、上传逻辑或数据排序。
- 不新增主题选择器、第三种主题或新的动效引擎。
- 不重新设计方形花名录卡片的布局和交互，只做颜色与层级统一。
- 不在本设计阶段执行生产部署；实现完成后的发布需单独经过验证和上线确认。
