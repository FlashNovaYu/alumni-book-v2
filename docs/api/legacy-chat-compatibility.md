# 旧聊天接口兼容说明

## 概述

本文档记录了班级聊天系统重构后，旧公共留言和旧信箱接口的兼容行为。

## 数据来源

| 数据表 | 用途 | 状态 |
|---|---|---|
| `public_messages` | 旧公共留言和新群聊的共同底表 | 活跃 |
| `mail_threads`、`mail_messages`、`mail_recipients` | 旧信箱数据读取和迁移来源 | 只读 |
| `direct_conversations`、`direct_messages` | 新私聊 | 活跃 |
| `notifications` | 管理员与系统消息 | 活跃 |
| `notification_sync_events` | 通知创建与已读变化的增量同步 | 活跃 |

## 状态映射

数据库存储状态为 `visible`，旧响应映射为 `approved`：

```ts
function legacyPublicStatus(status: string) {
  if (status === 'visible') return 'approved'
  if (status === 'recalled_by_author' || status === 'recalled_by_admin') return 'hidden'
  return status
}
```

数据库中不得出现新的 `approved` 状态。`approved` 只存在于旧 API 的响应边界。

## 接口矩阵

| 接口 | 身份要求 | 行为 | 典型状态码 |
|---|---|---|---|
| `GET /api/public-messages` | 同学 Session | 查询 `visible`，响应映射为 `approved` | 200, 401 |
| `GET /api/public-messages/mine` | 同学 Session | 保留本人历史；`visible` 映射为 `approved` | 200, 401 |
| `POST /api/public-messages` | 同学 Session | 调用共享群聊创建服务，数据库写 `visible` | 200, 400, 401, 403, 429 |
| `PUT /api/public-messages/:id/react` | 同学 Session | 只允许对 `visible` 消息操作 | 200, 400, 401, 404 |
| `GET /api/admin/public-messages?status=pending` | 管理 JWT | 继续读取历史待审核内容 | 200, 401 |
| `GET /api/admin/public-messages?status=rejected` | 管理 JWT | 继续读取历史未通过内容 | 200, 401 |
| `GET /api/admin/public-messages?status=approved` | 管理 JWT | 查询数据库 `visible`，响应映射 `approved` | 200, 401 |
| `PUT /api/admin/public-messages/:id/approve` | 管理 JWT | 只把历史 `pending` 改为 `visible` | 200, 401, 404, 409 |
| `PUT /api/admin/public-messages/:id/reject` | 管理 JWT | 保持写入 `rejected` 和原因 | 200, 400, 401, 404 |
| `GET /api/mailbox/summary` | 同学 Session | 保留旧未读摘要读取 | 200, 401 |
| `GET /api/mailbox/threads` | 同学 Session | 保留旧线程列表读取 | 200, 401 |
| `GET /api/mailbox/threads/:id` | 同学 Session | 保留参与者授权和旧详情读取 | 200, 401, 403 |
| `POST /api/mailbox/threads` | 同学 Session | 固定 `410 Gone`，不解析 JSON，不写库 | 401, 410 |
| `POST /api/mailbox/threads/:id/messages` | 同学 Session | 固定 `410 Gone`，不解析 JSON，不写库 | 401, 410 |

## 状态码说明

| 状态码 | 含义 |
|---|---|
| 200 | 读取或兼容成功 |
| 201 | 新群聊接口首次创建成功 |
| 400 | 输入无效 |
| 401 | 缺少或无效同学会话 |
| 403 | 首次密码未改、禁言或无权访问 |
| 404 | 目标不存在 |
| 409 | 历史内容状态冲突 |
| 410 | 旧信箱写接口已停用 |
| 429 | 群聊发送过于频繁 |

## 删除条件

旧兼容路由只有满足以下全部条件后才能删除：

1. 公开站点不再引用 `/api/public-messages` 和 `/api/mailbox/*`。
2. 生产迁移报告无异常。
3. 至少一个完整发布周期没有旧写入请求。
4. 管理后台已迁移历史 pending/rejected 审核入口。
5. 删除操作另立计划并重新走测试优先流程。
