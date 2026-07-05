# 功能字段映射矩阵 (Feature Field Matrix)

本矩阵整理了同学录系统（alumni-book-v2）各功能组件在前台展示、后台管理、接口服务及数据库字段方面的映射关系，确保开发和测试的连贯性。

| 功能名称 | 前台展示组件 | 后台编辑组件/视图 | Worker API | DB 字段与表 | 隐私可视级别 | 对应测试文件 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **个人小传** | [StudentProfile.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/StudentProfile.vue) | [StudentEditView.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/admin/src/views/StudentEditView.vue) / [SelfEditPanel.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/SelfEditPanel.vue) | `PUT /api/classmate/students/:slug` 和 `PUT /api/admin/students/:slug` | `students.info` 里的 JSON 字段 `profileModules`（结构为 `Array<{title, content}>`） | 继承主页可见性 | `workers/api/tests/api.test.ts` |
| **隐私级别** | [StudentProfile.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/StudentProfile.vue)（限制显示） | [StudentEditView.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/admin/src/views/StudentEditView.vue) / [SelfEditPanel.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/SelfEditPanel.vue) | `PUT /api/classmate/students/:slug` | `students.privacy_level` 字段和 `students.info.visibility` 细粒度可视字段 | 控制公开/同学/本人/隐藏 | `workers/api/tests/security.test.ts` |
| **背景音乐** | [StudentProfile.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/StudentProfile.vue) `<audio>` | [SelfEditPanel.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/SelfEditPanel.vue) | `PUT /api/classmate/students/:slug` | `students.music_url`, `students.music_title`, `students.music_autoplay` | 公开 | - |
| **留言样式** | [MessageWall.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/MessageWall.vue) | [MessageWall.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/MessageWall.vue) | `POST /api/messages/:slug` | `messages.card_style` | 公开 | `workers/api/tests/api.test.ts` |
| **留言置顶** | [MessageWall.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/MessageWall.vue) | [MessagesView.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/admin/src/views/MessagesView.vue) | `PUT /api/admin/messages/:id/pin` | `messages.pinned` (布尔/整数值) | 公开 | `workers/api/tests/api.test.ts` |
| **主人回复** | [MessageWall.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/MessageWall.vue) | [MessageWall.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/MessageWall.vue) | `PUT /api/messages/:id/reply` | `messages.reply`, `messages.reply_at` | 校验 Classmate-Token 后公开 | `workers/api/tests/api.test.ts` |
| **排行榜** | [RankingsPanel.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/RankingsPanel.vue) | - | `GET /api/rankings` | 聚合查询 visits, messages & updates | 公开 | - |
| **年度册** | [yearbook.astro](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/pages/yearbook.astro) | - | 聚合获取 `/api/students?audience=public`, `/api/albums`, `/api/messages/approved` | 多表聚合 | 仅使用 public 公开数据 | - |
| **相册标签与排序** | [AlbumGrid.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/AlbumGrid.vue) | [AlbumsView.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/admin/src/views/AlbumsView.vue) | `GET /api/albums`, `POST /api/admin/albums` | `albums.tags`, `albums.sort_order`, `photos.sort_order` | 公开 | `workers/api/tests/api.test.ts` |
| **同学账号登录** | [ClassmateLoginBook.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/site-astro/src/components/ClassmateLoginBook.vue) | [StudentEditView.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/admin/src/views/StudentEditView.vue) / [StudentsView.vue](file:///c:/Users/Administrator/Projects/alumni-book-v2/packages/admin/src/views/StudentsView.vue) | `/api/classmate-auth/login` 等与管理后台 `PUT /api/students/:slug` 密码管理 | `classmate_sessions` 关系表，以及 `students.account_password_hash` 等字段 | 会话强限制，首次改密前限制访问 | `tests/classmate-login-flow.spec.ts` & `workers/api/tests/security.test.ts` |

## 字段规范

1. `students.info` 全量字段矩阵：
   - `nickname`（昵称）、`gender`（性别）、`birthday`（生日）、`school`（学校）、`class`（班级）、`graduationYear`（毕业年份）、`motto`（座右铭）
   - `mbti`（MBTI）、`astro`（星座）、`bloodType`（血型）、`strengths`（擅长）、`weaknesses`（不擅长）、`bestSubject`（喜欢科目）、`worstSubject`（讨厌科目）
   - `favoriteSong`、`favoriteMovie`、`favoriteGame`、`favoriteFood`、`favoriteColor`、`favoriteSport`、`favoriteIdol`、`favoriteAnime`
   - `bestMemory`、`bestLesson`、`deskmateFun`、`classMeme`、`embarrassingMoment`、`proudestAchievement`
   - `targetUniversity`、`targetMajor`、`futureCareer`、`futureCity`、`futureSelf`、`letterToFuture`
   - `visibility`: 各联系方式（`phone`, `wechat`, `email`, `address`, `qq`, `weibo`）的可视度配置。
   - `profileModules`: 自定义个人小传模块的数组。

2. `messages` 表：
   - `id` (text), `student_slug` (text), `author_name` (text), `content` (text), `card_style` (text), `pinned` (integer), `reply` (text), `reply_at` (text), `status` (text, e.g. 'approved'), `reactions` (json text).
