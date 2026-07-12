# Public Site Consistency and Timeline Stability Design

## Goal

修复学生档案列表、头像、时光轴和同学自助编辑中已确认的状态不同步、样式降级与权限数据处理问题，并让本地 Worker 测试可独立运行。

## Scope and Assumptions

- 仅修改当前代码与测试；不迁移、清理或重写现有学生/头像数据。
- 旧头像路径不做兼容性猜测。图片无法读取时显示稳定的默认头像；新地址到达后允许重新加载。
- 线上 API 仅用于只读核验；不部署或修改生产配置。

## Root Causes

1. 名单与学生档案的 SWR 调用把 `changed`（相对会话缓存的网络变化）误当作“相对当前页面状态的变化”。当服务器返回 `304` 时，缓存中较新的数据不会覆盖静态构建的旧页面。
2. 时光轴用 `innerHTML` 重绘节点。新节点没有 Astro 的作用域属性，无法命中页面样式；用户内容也未经 HTML 转义。
3. 头像加载失败状态会一直保留，即使随后获得新的头像地址也不会重试。
4. 同学自助编辑页读取学生资料时没有传递 `X-Classmate-Token`，保存完整 `info` 对象时可能覆盖掉本人才可见的字段。登录后的学生档案也不应与公共响应共用会话缓存。
5. 学生页中邮箱链接写死为根路径，在 `/alumni-book-v2/` 子路径部署下失效。
6. Worker 测试依赖 CI 临时生成的 `.dev.vars`，本地标准验证命令缺少 `JWT_SECRET`。

## Design

- 名单页与公共学生档案页始终把有效响应与当前内存状态比较；只要内容不同即更新，不依赖 ETag 是否为 `304`。
- 已登录的学生档案直接使用带同学令牌的请求，不持久化该私有响应；公共视图仍使用独立的 ETag 缓存键。
- 时光轴保留 SWR 更新，但将动态节点可用的样式设为页面范围内的全局选择器，并在插入字符串 HTML 前转义文本和属性值。
- 两个显示学生头像的组件在头像 URL 变化时清除错误状态，保留已有的文字默认头像。
- 自助编辑读取资料时复用现有认证头；学生页邮箱链接使用构建时的站点 base。
- Vitest 的 Miniflare 配置注入固定的测试密钥，不在仓库中写入任何真实密钥。

## Files

- `packages/site-astro/src/components/RosterWall.vue`
- `packages/site-astro/src/components/ArchiveRosterCard.vue`
- `packages/site-astro/src/components/StudentProfile.vue`
- `packages/site-astro/src/components/SelfEditPanel.vue`
- `packages/site-astro/src/pages/timeline.astro`
- `workers/api/vitest.config.ts`
- 现有站点回归测试文件

## Validation

先添加回归测试并确认其在修复前失败；随后运行 Worker、后台和站点完整验证。浏览器复核名单、学生详情与时光轴的首次加载和 SWR 重绘后的布局。
