<template>
  <div ref="rootRef">
    <div class="archive-search paper-panel">
      <p class="museum-kicker">人物长廊</p>
      <input v-model="keyword" type="text" class="text-input search-input" placeholder="档案检索：姓名、昵称、学校、座右铭、MBTI" autocomplete="off" />
      <p class="search-count">{{ keyword.trim() ? `找到 ${filteredClassmates.length} 位同学` : '浏览所有同学档案（若 TA 的页面待完善，欢迎联系管理员补全资料）' }}</p>
    </div>

    <!-- 同学列表网格 -->
    <div class="archive-grid">
      <ArchiveRosterCard
        v-for="mate in filteredClassmates"
        :key="mate.slug"
        :card="toArchiveClassmateCard(mate, siteBase)"
        :api-base="apiBase"
      />
    </div>

    <!-- 空状态 -->
    <div v-if="filteredClassmates.length === 0" class="empty-state">
      <p>未找到匹配的同学</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { runWhenIdle, isDeepEqual, fetchJsonIfChanged } from '../utils/deferredFetch'
import ArchiveRosterCard from './ArchiveRosterCard.vue'
import { toArchiveClassmateCard } from '../utils/museumViewModels'

interface Classmate {
  name: string
  slug: string
  hasPage: boolean
  avatarUrl: string | null
  motto: string
  nickname?: string
  school?: string
  className?: string
  mbti?: string
  completion?: number
  tags?: string[]
}

const props = defineProps<{
  initialClassmates: Classmate[]
  apiBase: string
  siteBase: string
}>()

const classmates = ref<Classmate[]>([...props.initialClassmates])
const keyword = ref('')

const rootRef = ref<HTMLElement | null>(null)

const filteredClassmates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return classmates.value
  return classmates.value.filter(c => {
    return (
      c.name.toLowerCase().includes(kw) ||
      (c.nickname && c.nickname.toLowerCase().includes(kw)) ||
      (c.school && c.school.toLowerCase().includes(kw)) ||
      (c.className && c.className.toLowerCase().includes(kw)) ||
      (c.motto && c.motto.toLowerCase().includes(kw)) ||
      (c.mbti && c.mbti.toLowerCase().includes(kw))
    )
  })
})

onMounted(() => {
  // 避免首屏高并发阻塞，改为 idle 空闲时静默刷新 SWR 数据
  runWhenIdle(async () => {
    try {
      const { data } = await fetchJsonIfChanged(
        `${props.apiBase}/api/classmates`,
        'classmates'
      )
      if (data && data.success && data.data && !isDeepEqual(data.data, classmates.value)) {
        classmates.value = data.data
      }
    } catch (e) {
      console.error('Failed to sync classmates list via SWR:', e)
    }
  })
})
</script>

<style scoped>
.archive-search {
  max-width: 760px;
  margin: 0 auto var(--spacing-xl);
  padding: var(--spacing-lg) var(--spacing-xl);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
}

.search-input {
  width: 100%;
  text-align: center;
  font-size: 15px;
  min-height: 44px;
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  color: var(--color-paper-ink);
}

.search-input:focus {
  border-color: var(--color-paper-brown);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-paper-brown) 16%, transparent);
}

.search-count {
  font-size: var(--type-body-sm-size);
  color: var(--color-paper-muted);
}

.archive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-lg);
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xxl);
  color: var(--color-muted);
}

@media (max-width: 768px) {
  .archive-search {
    padding: var(--spacing-lg);
  }

  .archive-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }
}
</style>
