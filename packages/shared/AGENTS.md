# 共享包局部说明

本文件适用于 `packages/shared/`。同时继承仓库根目录的规则。

## 模块边界

- `src/types.ts` 保存跨站点、后台和 API 使用的共享类型。
- `src/utils.ts` 及相关模块提供 API、会话和媒体 helper；修改前先搜索所有直接消费者。
- `tokens.css` 是共享设计令牌。调整令牌时检查公开站点和后台的实际引用，但不要借机统一无关样式。
- 共享导出属于跨包契约；避免无需求的重命名、重新导出和兼容层。

## 调查与验证

- 先运行共享包相关单测和 `pnpm --filter @alumni/shared typecheck`。
- 只有类型、函数返回值或 CSS 令牌确实影响消费者时，才运行对应的 site/admin/worker 定向测试。
- 不因为共享包改动自动运行 `pnpm verify:all`；先根据 `rg` 得到的消费者列表确定验证范围。
