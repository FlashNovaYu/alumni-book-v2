<template>
  <div class="dashboard">
    <div class="page-header">
      <h1 class="page-title">控制台</h1>
    </div>

    <div v-if="loading" class="stats-grid">
      <div v-for="i in 6" :key="i" class="stat-card card">
        <div class="skeleton-block" style="width:80px;height:48px;margin:0 auto var(--spacing-xs);border-radius:var(--rounded-sm);"></div>
        <div class="skeleton-block" style="width:60px;height:14px;margin:0 auto;border-radius:var(--rounded-sm);"></div>
      </div>
    </div>
    <div v-else>
      <!-- 指标概览 -->
      <div class="stats-grid">
        <div class="stat-card card">
          <div class="stat-number">{{ stats.studentCount }}</div>
          <div class="stat-label">学生总数</div>
        </div>
        <div class="stat-card card">
          <div class="stat-number">{{ stats.albumCount }}</div>
          <div class="stat-label">相册数量</div>
        </div>
        <div class="stat-card card">
          <div class="stat-number">{{ stats.photoCount }}</div>
          <div class="stat-label">照片总数</div>
        </div>
        <div class="stat-card card font-warning">
          <div class="stat-number">{{ stats.pendingMessageCount }}</div>
          <div class="stat-label">待审核留言</div>
        </div>
        <div class="stat-card card font-success">
          <div class="stat-number">{{ stats.approvedMessageCount }}</div>
          <div class="stat-label">已审核留言</div>
        </div>
        <div class="stat-card card font-info">
          <div class="stat-number">{{ stats.totalVisitCount }}</div>
          <div class="stat-label">总浏览量</div>
        </div>
      </div>

      <!-- 同学录内容巡检 -->
      <div class="card mt-4">
        <h2 class="panel-title text-warning">同学录内容巡检</h2>
        <p class="audit-summary">这里列出会影响前台显示、隐私或资料完整度的问题。</p>
        <ul v-if="stats.auditAlerts && stats.auditAlerts.length" class="audit-list">
          <li v-if="stats.auditAlerts?.some(a => a.type === 'missingSeatNo')" class="audit-item" style="color: var(--color-warning, #e65100); font-weight: 500;">
            ⚠️ 座位记忆缺少座位号，请在学生档案中补全 seatNo。
          </li>
          <li v-if="stats.auditAlerts?.some(a => a.type === 'missingGroupName')" class="audit-item" style="color: var(--color-warning, #e65100); font-weight: 500;">
            ⚠️ 班级图谱缺少小组信息，请在学生档案中补全 groupName。
          </li>
          <li v-for="(alert, idx) in stats.auditAlerts" :key="idx" class="audit-item">
            <span>{{ typeof alert === 'string' ? alert : alert.message }}</span>
          </li>
        </ul>
        <p v-else class="text-success">目前没有发现任何内容缺失问题！</p>
      </div>

      <!-- 两栏控制台底座 -->
      <div class="dashboard-layout">
        <!-- 左侧主栏 -->
        <div class="main-column">
          <!-- 活跃同学与资料完整度 -->
          <div class="card panel-card">
            <h2 class="panel-title">最近活跃同学</h2>
            <div class="recent-list">
              <div v-for="item in stats.recentStudents" :key="item.slug" class="list-item">
                <div class="item-info">
                  <span class="item-name">
                    {{ item.name }}
                    <a :href="getFrontUrl(item.slug)" target="_blank" class="preview-badge-link" title="预览前台">🔗</a>
                    <router-link :to="'/students/' + item.slug" class="edit-badge-link" title="编辑">✏️</router-link>
                  </span>
                  <span class="item-time">更新于 {{ formatDate(item.updated_at) }}</span>
                </div>
                <div class="completeness-bar-wrapper">
                  <span class="completeness-label">资料完整度 {{ calculateCompleteness(item.info) }}%</span>
                  <div class="progress-track">
                    <div class="progress-bar" :style="{ width: calculateCompleteness(item.info) + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 最新留言 -->
          <div class="card panel-card">
            <div class="panel-header">
              <h2 class="panel-title">最新留言审核</h2>
              <router-link to="/messages" class="panel-action">管理全部</router-link>
            </div>
            <div class="message-list">
              <div v-for="msg in stats.recentMessages" :key="msg.id" class="msg-item">
                <div class="msg-header">
                  <span class="msg-author">{{ msg.authorName }}</span>
                  <span class="msg-status" :class="msg.isApproved ? 'approved' : 'pending'">
                    {{ msg.isApproved ? '已通过' : '待审核' }}
                  </span>
                </div>
                <p class="msg-text">{{ msg.content }}</p>
                <div class="msg-footer">
                  <span class="msg-time">{{ formatDate(msg.createdAt) }}</span>
                </div>
              </div>
              <div v-if="stats.recentMessages.length === 0" class="empty-notice">
                暂无留言记录
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧副栏 -->
        <div class="side-column">
          <!-- 浏览量排行 -->
          <div class="card panel-card">
            <h2 class="panel-title">浏览量排行</h2>
            <div class="rank-list">
              <div v-for="(item, index) in stats.topVisited" :key="item.slug" class="rank-item">
                <span class="rank-number" :class="'rank-' + (index + 1)">{{ index + 1 }}</span>
                <span class="rank-name">
                  <a :href="getFrontUrl(item.slug)" target="_blank" class="rank-name-link" title="点击预览">{{ item.name }}</a>
                </span>
                <span class="rank-count">{{ item.visit_count }} 次</span>
              </div>
            </div>
          </div>

          <!-- 快捷运维通道 -->
          <div class="card panel-card">
            <h2 class="panel-title">快捷管理通道</h2>
            <div class="quick-actions">
              <router-link to="/students" class="btn-action">学生信息数据库</router-link>
              <router-link to="/messages" class="btn-action">同学留言墙审核</router-link>
              <router-link to="/albums" class="btn-action">班级相册库管理</router-link>
              <router-link to="/config" class="btn-action">前言寄语与致谢设置</router-link>
              <a :href="getYearbookUrl()" target="_blank" class="btn-action btn-yearbook">📖 毕业纪念册 (打印/导出 PDF)</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminFetch } from '@/api/client'
import type { ApiResponse } from '@alumni/shared'

const stats = ref({
  studentCount: 0,
  albumCount: 0,
  photoCount: 0,
  pendingMessageCount: 0,
  approvedMessageCount: 0,
  totalVisitCount: 0,
  recentStudents: [] as Array<{ name: string; slug: string; updated_at: string; info: string }>,
  topVisited: [] as Array<{ name: string; slug: string; visit_count: number }>,
  recentMessages: [] as Array<{ id: string; authorName: string; studentSlug: string; content: string; createdAt: string; isApproved: boolean }>,
  auditAlerts: [] as any[]
})

const loading = ref(true)

function formatDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function calculateCompleteness(infoStr: string): number {
  try {
    const info = JSON.parse(infoStr || '{}')
    const fields = [
      'nickname', 'gender', 'birthday', 'school', 'class', 'graduationYear', 'motto',
      'qq', 'wechat', 'phone', 'email', 'address', 'weibo',
      'favoriteSong', 'favoriteMovie', 'favoriteGame', 'favoriteFood',
      'bestMemory', 'bestLesson', 'deskmateFun',
      'targetUniversity', 'futureCareer', 'futureSelf'
    ]
    let filled = 0
    fields.forEach(f => {
      if (info[f] && String(info[f]).trim()) {
        filled++
      }
    })
    return Math.round((filled / fields.length) * 100)
  } catch {
    return 0
  }
}

onMounted(async () => {
  try {
    const res = await adminFetch<ApiResponse<typeof stats.value>>('/api/admin/stats')
    if (res.data) stats.value = res.data
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
})

const getFrontUrl = (slug: string) => {
  if (!slug) return '#'
  const isDev = window.location.port === '5173'
  const origin = isDev ? 'http://localhost:4321' : window.location.origin
  const hasSubpath = window.location.pathname.startsWith('/alumni-book-v2')
  const base = hasSubpath ? '/alumni-book-v2/' : '/'
  return `${origin}${base}student/${slug}/`
}

const getYearbookUrl = () => {
  const isDev = window.location.port === '5173'
  const origin = isDev ? 'http://localhost:4321' : window.location.origin
  const hasSubpath = window.location.pathname.startsWith('/alumni-book-v2')
  const base = hasSubpath ? '/alumni-book-v2/' : '/'
  return `${origin}${base}yearbook/`
}
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.stat-card {
  text-align: center;
  padding: var(--spacing-lg);
}

.stat-number {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 600;
  color: var(--color-primary);
  line-height: 1;
  margin-bottom: var(--spacing-xs);
}

.stat-label {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
}

.font-warning .stat-number { color: var(--color-warning); }
.font-success .stat-number { color: var(--color-success); }
.font-info .stat-number { color: var(--color-accent-teal); }

/* Dashboard layout */
.dashboard-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--spacing-lg);
}

@media (max-width: 900px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }
}

.panel-card {
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--spacing-md);
}

.panel-header .panel-title {
  margin: 0;
}

.panel-action {
  font-size: 13px;
  color: var(--color-primary);
  text-decoration: none;
}

.panel-action:hover {
  text-decoration: underline;
}

/* Recent list */
.recent-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-hairline-soft);
}

.list-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-weight: 500;
  font-size: 15px;
}

.item-time {
  font-size: 11px;
  color: var(--color-muted);
}

.completeness-bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  width: 150px;
}

.completeness-label {
  font-size: 11px;
  color: var(--color-muted);
}

.progress-track {
  width: 100%;
  height: 6px;
  background-color: var(--color-surface-cream-strong, #eedfd4);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
  transition: width 0.4s ease;
}

/* Message List */
.message-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.msg-item {
  background-color: var(--color-surface-cream, #faf9f5);
  border-radius: var(--rounded-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-hairline-soft);
}

.msg-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.msg-author {
  font-weight: 500;
  font-size: 13px;
}

.msg-status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--rounded-sm);
}

.msg-status.pending {
  background-color: color-mix(in srgb, var(--color-warning) 16%, #fff);
  color: var(--color-warning);
}

.msg-status.approved {
  background-color: color-mix(in srgb, var(--color-success) 16%, #fff);
  color: var(--color-success);
}

.msg-text {
  font-size: 13px;
  margin: 0 0 6px;
  color: var(--color-ink);
  line-height: 1.5;
}

.msg-footer {
  font-size: 11px;
  color: var(--color-muted);
}

.empty-notice {
  text-align: center;
  padding: var(--spacing-lg) 0;
  color: var(--color-muted);
  font-size: 13px;
}

/* Rank list */
.rank-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.rank-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.rank-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  border-radius: 50%;
  background-color: var(--color-surface-cream-strong);
  color: var(--color-muted);
}

.rank-1 { background-color: var(--color-gold); color: #fff; } /* Gold */
.rank-2 { background-color: var(--color-silver); color: #fff; } /* Silver */
.rank-3 { background-color: var(--color-bronze); color: #fff; } /* Bronze */

.rank-name {
  flex: 1;
  font-size: 14px;
}

.rank-count {
  font-size: 13px;
  color: var(--color-muted);
}

/* Quick Actions */
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.btn-action {
  display: block;
  text-align: center;
  padding: 10px;
  background-color: var(--color-surface-cream, #faf9f5);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
  font-size: 13px;
  color: var(--color-ink);
  text-decoration: none;
  font-weight: 500;
  transition: all var(--duration-fast);
}

.btn-action:hover {
  background-color: var(--color-surface-cream-strong);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.skeleton-block {
  background: linear-gradient(90deg, var(--color-surface-cream-strong) 25%, var(--color-surface-card) 50%, var(--color-surface-cream-strong) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.mt-4 {
  margin-top: var(--spacing-lg) !important;
}
.audit-summary {
  font-size: 13px;
  color: var(--color-muted);
  margin-top: 0;
  margin-bottom: var(--spacing-sm);
}
.text-warning {
  color: var(--color-warning) !important;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xs);
}
.audit-list {
  margin: var(--spacing-xs) 0 0;
  padding-left: var(--spacing-lg);
}
.audit-item {
  font-size: 13px;
  color: var(--color-error);
  line-height: 1.6;
  margin-bottom: var(--spacing-xxs);
}
.text-success {
  color: var(--color-success) !important;
  font-size: 13px;
  margin: var(--spacing-xs) 0 0;
}

.preview-badge-link, .edit-badge-link {
  font-size: 12px;
  margin-left: 6px;
  text-decoration: none;
  opacity: 0.65;
  cursor: pointer;
}
.preview-badge-link:hover, .edit-badge-link:hover {
  opacity: 1;
}
.rank-name-link {
  color: inherit;
  text-decoration: none;
}
.rank-name-link:hover {
  color: var(--color-primary);
  text-decoration: underline;
}
.btn-yearbook {
  background-color: var(--color-surface-cream-strong) !important;
  border-color: var(--color-primary) !important;
  color: var(--color-primary) !important;
  margin-top: var(--spacing-xs);
}
.btn-yearbook:hover {
  background-color: var(--color-primary) !important;
  color: #fff !important;
}
</style>

