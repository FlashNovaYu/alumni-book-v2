<template>
  <div v-if="hasData" class="rankings-card paper-panel">
    <div class="card-header-row">
      <h3 class="rankings-title">🌟 班级风云榜</h3>
      <div class="rankings-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: currentTab === tab.key }"
          @click="currentTab = tab.key"
        >
          {{ tab.name }}
        </button>
      </div>
    </div>

    <div class="rankings-content">
      <div class="rank-list">
        <a
          v-for="(item, index) in currentList"
          :key="item.slug"
          :href="studentUrl(item.slug)"
          class="rank-item"
        >
          <div class="rank-badge" :class="'rank-' + (index + 1)">
            {{ index + 1 }}
          </div>
          <div class="rank-avatar-wrapper">
            <img v-if="item.avatarUrl" :src="avatarUrl(item.avatarUrl)" class="rank-avatar" />
            <span v-else class="rank-avatar-char">{{ item.name.charAt(0) }}</span>
          </div>
          <div class="rank-name">{{ item.name }}</div>
          <div class="rank-value">{{ item.value }}</div>
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

const props = defineProps<{
  apiBase: string
}>()

interface RankItem {
  name: string
  slug: string
  avatarUrl: string | null
  value: string
}

const currentTab = ref<'visits' | 'messages' | 'recent'>('visits')
const rankingsData = ref<{
  visits: RankItem[]
  messages: RankItem[]
  recent: RankItem[]
} | null>(null)

const tabs = [
  { key: 'visits', name: '人气浏览' },
  { key: 'messages', name: '留言回响' },
  { key: 'recent', name: '最近更新' },
] as const

const hasData = computed(() => {
  if (!rankingsData.value) return false
  return rankingsData.value.visits.length > 0 || 
         rankingsData.value.messages.length > 0 || 
         rankingsData.value.recent.length > 0
})

const currentList = computed(() => {
  if (!rankingsData.value) return []
  return rankingsData.value[currentTab.value] || []
})

function avatarUrl(url: string | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${props.apiBase}${url}`
}

function studentUrl(slug: string): string {
  // 获取当前 Astro 项目部署的 BASE_URL，如果是单页直接拼接
  const base = (import.meta as any).env?.BASE_URL || '/'
  return `${base}student/${slug}`
}

onMounted(async () => {
  try {
    const res = await fetch(`${props.apiBase}/api/rankings`)
    const json = await res.json()
    if (json.success && json.data) {
      rankingsData.value = json.data
    }
  } catch (e) {
    console.error('Failed to load rankings:', e)
  }
})
</script>

<style scoped>
.rankings-card {
  max-width: 480px;
  margin: 0 auto var(--spacing-xl);
  padding: var(--spacing-xl);
  color: var(--color-paper-ink);
}

.rank-item {
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border-soft);
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-hairline);
  padding-bottom: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.rankings-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-primary);
  margin: 0;
}

.rankings-tabs {
  display: flex;
  gap: 4px;
  background: var(--color-surface-cream-strong);
  padding: 2px;
  border-radius: var(--rounded-md);
}

.tab-btn {
  font-size: 11px;
  padding: 4px var(--spacing-xs);
  border-radius: var(--rounded-sm);
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-muted);
  font-weight: 500;
  transition: all var(--duration-fast);
}

.tab-btn.active {
  background: #fff;
  color: var(--color-primary);
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.rank-item {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: inherit;
  padding: var(--spacing-xxs) var(--spacing-xs);
  border-radius: var(--rounded-sm);
  transition: background var(--duration-fast);
}

.rank-item:hover {
  background: var(--color-paper-bg-soft);
}

.rank-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: var(--spacing-sm);
  background: var(--color-surface-cream-strong);
  color: var(--color-muted);
}

.rank-1 { background: var(--color-gold); color: #fff; }
.rank-2 { background: var(--color-silver); color: #fff; }
.rank-3 { background: var(--color-bronze); color: #fff; }

.rank-avatar-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  margin-right: var(--spacing-xs);
  background: var(--color-surface-cream-strong);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rank-avatar-char {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-muted);
}

.rank-name {
  font-size: 13px;
  font-weight: 500;
  flex: 1;
}

.rank-value {
  font-size: 12px;
  color: var(--color-muted);
}

.mb-5 {
  margin-bottom: 24px;
}
</style>
