<template>
  <div class="class-space-hub">
    <!-- 加载中状态 -->
    <div v-if="loading" class="hub-loading">
      <div class="skeleton-nav"></div>
      <div class="skeleton-content">
        <div class="skeleton-section">
          <div class="skeleton-title"></div>
          <div class="skeleton-grid">
            <div v-for="i in 4" :key="i" class="skeleton-card"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="hub-error">
      <div class="error-card">
        <div class="error-icon">⚠️</div>
        <h3 class="error-title">数据加载失败</h3>
        <p class="error-msg">{{ error }}</p>
        <button class="retry-btn" @click="loadData">重新加载</button>
      </div>
    </div>

    <!-- 成功展示状态 -->
    <div v-else-if="overviewData" class="hub-layout class-space-directory">
      <!-- 侧边挂历式导航 / 顶部导航 (响应式) -->
      <aside class="hub-sidebar">
        <div class="sidebar-nav-card">
          <h3 class="nav-title">班级空间</h3>
          <ul class="nav-list">
            <li>
              <a href="#group-chat" class="nav-item">
                <span class="nav-icon">💬</span>
                <span class="nav-text">同学群聊</span>
                <span class="nav-count" v-if="overviewData.counts?.groupMessages !== undefined">
                  {{ overviewData.counts.groupMessages }}
                </span>
              </a>
            </li>
            <li>
              <a href="#albums" class="nav-item">
                <span class="nav-icon">🖼️</span>
                <span class="nav-text">影像馆</span>
                <span class="nav-count" v-if="overviewData.counts?.albums !== undefined">
                  {{ overviewData.counts.albums }}
                </span>
              </a>
            </li>
            <li>
              <a href="#timeline" class="nav-item">
                <span class="nav-icon">📅</span>
                <span class="nav-text">时间轴</span>
                <span class="nav-count" v-if="overviewData.counts?.timelineItems !== undefined">
                  {{ overviewData.counts.timelineItems }}
                </span>
              </a>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="hub-main class-space-main">
        <!-- 群聊舞台 Section -->
        <section id="group-chat" class="hub-section">
          <GroupChatStage
            :apiBase="apiBase"
            :initialItems="overviewData.chat.items"
            :initialCursor="overviewData.chat.cursor"
            :initialMute="overviewData.chat.mute"
            :mySlug="mySlug"
          />
        </section>

        <!-- 影像馆 Section -->
        <section id="albums" class="hub-section">
          <div class="section-header">
            <div class="header-left">
              <span class="section-emoji">🖼️</span>
              <h2 class="section-title">精选相册</h2>
            </div>
            <a href="/album" class="more-link">进入影像馆 &rarr;</a>
          </div>
          <ClassSpaceAlbumRail :albums="overviewData.albums" :apiBase="apiBase" />
        </section>

        <!-- 时间轴 Section -->
        <section id="timeline" class="hub-section">
          <div class="section-header">
            <div class="header-left">
              <span class="section-emoji">📅</span>
              <h2 class="section-title">班级大事件</h2>
            </div>
            <a href="/timeline" class="more-link">完整时间轴 &rarr;</a>
          </div>
          <ClassSpaceTimelinePreview :timeline="overviewData.timeline" :apiBase="apiBase" />
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchClassSpaceOverview } from '../api/classSpace'
import type { ClassSpaceOverview } from '@alumni/shared'
import ClassSpaceMessageStage from './ClassSpaceMessageStage.vue'
import ClassSpaceAlbumRail from './ClassSpaceAlbumRail.vue'
import ClassSpaceTimelinePreview from './ClassSpaceTimelinePreview.vue'
import GroupChatStage from './GroupChatStage.vue'

const props = defineProps<{
  apiBase: string
}>()

const overviewData = ref<ClassSpaceOverview | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const mySlug = ref('')

try {
  const str = sessionStorage.getItem('classmate_account_student')
  if (str) {
    mySlug.value = JSON.parse(str).slug || ''
  }
} catch {}

async function loadData() {
  loading.value = true
  error.value = null
  try {
    overviewData.value = await fetchClassSpaceOverview(props.apiBase)
  } catch (err: any) {
    console.error('Failed to load class space overview:', err)
    error.value = err.message || '加载班级数据失败，请重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.class-space-hub {
  width: 100%;
  margin-top: var(--spacing-lg);
}

/* 布局 */
.hub-layout {
  display: flex;
  gap: var(--spacing-xl);
  align-items: flex-start;
}

.hub-sidebar {
  flex: 0 0 240px;
  position: sticky;
  top: 100px;
  z-index: 10;
}

.sidebar-nav-card {
  background: var(--color-paper-card, #fcfaf2);
  border: 1px solid var(--color-paper-border, #eedec4);
  border-radius: var(--rounded-lg);
  padding: var(--spacing-md) var(--spacing-sm);
  box-shadow: var(--shadow-paper-card, 0 4px 12px rgba(139,120,95,0.06));
}

.nav-title {
  margin: 0 0 var(--spacing-md) var(--spacing-md);
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-paper-muted, #8b785f);
  letter-spacing: 0.1em;
}

.nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--rounded-md);
  color: var(--color-paper-ink, #4a3e3d);
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: background var(--duration-fast) ease, color var(--duration-fast) ease;
}

.nav-item:hover {
  background: var(--color-surface-cream, #fbfaf7);
  color: var(--color-paper-brown, #b8903a);
}

.nav-icon {
  margin-right: var(--spacing-sm);
  font-size: 16px;
}

.nav-text {
  flex-grow: 1;
}

.nav-count {
  font-size: 11px;
  background: var(--color-surface-cream-strong, #eedec4);
  color: var(--color-primary, #8b785f);
  padding: 2px 6px;
  border-radius: var(--rounded-pill);
  font-weight: 600;
}

.hub-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xxl);
  min-width: 0; /* 允许 Flex 子项在需要时缩小，防止图片溢出 */
}

.hub-section {
  scroll-margin-top: 100px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
  border-bottom: 2px solid var(--color-paper-border, #eedec4);
  padding-bottom: var(--spacing-sm);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.section-emoji {
  font-size: 24px;
}

.section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-paper-ink, #4a3e3d);
}

.more-link {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-paper-brown, #b8903a);
  text-decoration: none;
  transition: transform var(--duration-fast) ease;
}

.more-link:hover {
  transform: translateX(4px);
}

/* Loading Skeleton */
.hub-loading {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
  padding: var(--spacing-xl) 0;
}

.skeleton-nav {
  height: 48px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--rounded-md);
  animation: pulse 1.5s infinite;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

.skeleton-title {
  width: 150px;
  height: 28px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--rounded-sm);
  margin-bottom: var(--spacing-md);
  animation: pulse 1.5s infinite;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--spacing-md);
}

.skeleton-card {
  height: 150px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--rounded-md);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0.6; }
}

/* Error UI */
.hub-error {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.error-card {
  max-width: 400px;
  width: 100%;
  text-align: center;
  background: var(--color-paper-card, #fcfaf2);
  border: 1px solid var(--color-error, #f56565);
  border-radius: var(--rounded-lg);
  padding: var(--spacing-xl);
  box-shadow: 0 10px 25px rgba(245, 101, 101, 0.05);
}

.error-icon {
  font-size: 40px;
  margin-bottom: var(--spacing-sm);
}

.error-title {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: 18px;
  color: var(--color-paper-ink, #4a3e3d);
}

.error-msg {
  font-size: 14px;
  color: var(--color-muted, #718096);
  margin-bottom: var(--spacing-lg);
}

.retry-btn {
  background: var(--color-paper-brown, #b8903a);
  color: #fff;
  border: none;
  border-radius: var(--rounded-md);
  padding: var(--spacing-sm) var(--spacing-xl);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--duration-fast) ease;
}

.retry-btn:hover {
  background: #a37c2f;
}

/* Mobile Responsive */
@media (max-width: 992px) {
  .hub-layout {
    flex-direction: column;
    align-items: stretch;
  }

  .hub-sidebar {
    position: static;
    flex: none;
    margin-bottom: var(--spacing-md);
  }

  .sidebar-nav-card {
    padding: var(--spacing-sm);
  }

  .nav-title {
    display: none;
  }

  .nav-list {
    flex-direction: row;
    justify-content: space-around;
    gap: var(--spacing-xs);
  }

  .nav-item {
    flex: 1;
    justify-content: center;
    padding: var(--spacing-xs);
    font-size: 13px;
  }
}
</style>
