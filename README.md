<div align="center">

# 🎓 同学录 v2

**校园纪念网站 — 为同窗情谊打造的永久数字空间**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/FlashNovaYu/alumni-book-v2?style=social)](https://github.com/FlashNovaYu/alumni-book-v2)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg)](https://workers.cloudflare.com)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883.svg)](https://vuejs.org)

[🚀 在线演示 (Pages)](https://alumni-book.pages.dev) · [🌍 在线演示 (VPS)](http://118.178.88.227)

</div>

---

## 📖 项目简介

同学录 v2 是一款面向校园同窗的**全功能纪念网站**，集学生档案、留言互动、相册管理、即时通讯、班级空间和管理后台于一体。采用 **Monorepo** 架构，前端基于 Astro 5 / Vue 3 构建静态站点，后端运行在 Cloudflare Workers 上，数据存储于 D1（SQLite）和 R2（对象存储），零服务器成本、全球边缘部署。

---

## ✨ 功能特性

| 模块 | 功能说明 |
|------|----------|
| 📋 **学生档案** | 30+ 字段全面记录同窗信息（姓名、班级、联系方式、个人简介、照片等） |
| 💬 **留言板** | 审批制留言系统，支持评论互动与内容审核 |
| 👥 **群聊** | 实时班级群聊，支持表情回应、消息免打扰 |
| ✉️ **私信** | 一对一私密对话，会话管理与消息已读状态 |
| 🖼️ **相册** | 多相册管理，图片上传预览，R2 云存储加速 |
| 📅 **时间线** | 校园重要时刻记录，可视化时间轴展示 |
| 🔔 **通知** | 实时通知推送，同步事件追踪 |
| 🏠 **班级空间** | 分班级展示，独立班级动态与成员管理 |
| 👤 **同学账号** | 完整的用户注册、登录、认证系统 |
| ⚙️ **管理后台** | 角色权限、审计日志、内容审核、数据统计一应俱全 |

---

## 🛠️ 技术栈

### 前端
- **Astro 5** — 静态站点生成框架，部分页面 Vue 3 交互组件
- **Vue 3** — 渐进式 JavaScript 框架
- **Vite** — 下一代前端构建工具
- **TypeScript** — 类型安全的 JavaScript 超集

### 后端
- **Cloudflare Workers** — 边缘计算运行时
- **Hono** — 轻量、快速、Web 标准的 TypeScript Web 框架

### 数据与存储
- **D1** — Cloudflare 分布式 SQLite 数据库
- **R2** — Cloudflare S3 兼容对象存储（图片/文件）

### 部署
- **GitHub Pages** — 静态前端托管
- **Cloudflare** — Workers API + CDN + DNS

---

## 📁 项目结构

```
alumni-book-v2/
├── packages/
│   ├── site-astro/          # 🌐 主站（Astro 5 + Vue 3 静态站点）
│   ├── admin/               # ⚙️ 管理后台（Vue 3 SPA）
│   └── shared/              # 📦 共享类型、工具函数、常量定义
├── workers/
│   └── api/                 # 🔧 Cloudflare Workers API（Hono）
├── pnpm-workspace.yaml      # 📋 Monorepo 工作区配置
├── wrangler.toml            # ☁️ Cloudflare Workers 配置
└── package.json
```

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) ≥ 8
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（后端部署）

### 安装依赖

```bash
git clone https://github.com/FlashNovaYu/alumni-book-v2.git
cd alumni-book-v2
pnpm install
```

### 本地开发

```bash
# 启动主站（Astro + Vue）
pnpm dev:site

# 启动管理后台
pnpm dev:admin

# 启动 API Worker（本地模拟）
pnpm dev:worker
```

默认地址：
- 主站：`http://localhost:4321`
- 管理后台：`http://localhost:5173`
- API：`http://localhost:8787`

---

## 🚢 部署说明

### 1. 初始化 Cloudflare Workers + D1

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库
npx wrangler d1 create alumni-book-db

# 初始化数据库表（将 <数据库ID> 替换为实际 ID）
npx wrangler d1 execute alumni-book-db --file=./workers/api/schema.sql
```

### 2. 配置 wrangler.toml

```toml
name = "alumni-book-api"
main = "workers/api/src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "alumni-book-db"
database_id = "<你的数据库ID>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "alumni-book-photos"
```

### 3. 部署 API Worker

```bash
npx wrangler deploy
```

### 4. 部署前端（GitHub Pages）

前端静态文件通过 GitHub Actions 自动部署到 Pages：

```bash
# 构建主站
cd packages/site-astro
pnpm build

# 构建管理后台
cd packages/admin
pnpm build
```

推送代码后，GitHub Actions 会自动将构建产物部署到 GitHub Pages。

### 5. 自定义域名

在 Cloudflare 控制面板中配置 DNS，将自定义域名指向 Pages 或 Workers。

---

## 🎨 设计系统

项目采用 **Claude 设计风格**，营造温暖、亲切的校园回忆氛围：

| 设计要素 | 说明 |
|----------|------|
| 🎨 **主色调** | 暖白色背景 + 珊瑚色（Coral）强调色 |
| 🖌️ **设计语言** | Claude Design — 简洁、现代、高可读性 |
| 📱 **响应式** | 完整的移动端适配，多端体验一致 |
| ✨ **动效** | 柔和的过渡动画与微交互 |
| 🌙 **暗色模式** | 支持明暗主题切换 |

---

## 🗄️ 数据库表结构

项目包含 **30 张数据库表**，覆盖完整的业务需求：

### 核心数据
| 表名 | 说明 |
|------|------|
| `students` | 学生档案（30+ 字段） |
| `site_config` | 网站全局配置 |

### 相册系统
| 表名 | 说明 |
|------|------|
| `albums` | 相册信息 |
| `photos` | 照片存储 |

### 消息与互动
| 表名 | 说明 |
|------|------|
| `messages` | 留言板消息 |
| `public_messages` | 公开消息 |
| `content_reviews` | 内容审核记录 |

### 时间线
| 表名 | 说明 |
|------|------|
| `timeline_events` | 时间线事件 |

### 群聊系统
| 表名 | 说明 |
|------|------|
| `group_chat_mutes` | 群聊静音设置 |
| `group_chat_reactions` | 群聊表情回应 |

### 私信系统
| 表名 | 说明 |
|------|------|
| `direct_conversations` | 私信会话 |
| `direct_messages` | 私信消息 |
| `mail_threads` | 邮件线程 |
| `mail_messages` | 邮件消息 |
| `mail_recipients` | 邮件收件人 |

### 管理系统
| 表名 | 说明 |
|------|------|
| `admin_accounts` | 管理员账号 |
| `admin_roles` | 角色定义 |
| `admin_role_permissions` | 角色权限关联 |
| `admin_account_permissions` | 账号权限 |
| `admin_sessions` | 管理员会话 |
| `admin_audit_logs` | 审计日志 |

### 用户系统
| 表名 | 说明 |
|------|------|
| `classmate_sessions` | 同学会话 |
| `auth_login_attempts` | 登录尝试记录 |
| `student_checkins` | 学生签到 |

### 通知系统
| 表名 | 说明 |
|------|------|
| `notifications` | 通知消息 |
| `notification_sync_events` | 通知同步事件 |

### 限流与缓存
| 表名 | 说明 |
|------|------|
| `public_request_limits` | 公开请求限流 |
| `_cf_KV` | Cloudflare KV 缓存 |
| `d1_migrations` | 数据库迁移记录 |
| `sqlite_sequence` | SQLite 自增序列 |

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**Made with ❤️ for unforgettable campus memories**

[⬆ 回到顶部](#-同学录-v2)

</div>
