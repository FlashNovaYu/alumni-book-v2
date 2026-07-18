<template>
  <div class="class-space-hub">
    <!-- Loading -->
    <div v-if="loading" class="hub-loading" aria-busy="true">
      <UiSkeleton variant="text" :lines="2" />
      <div class="hub-loading__grid">
        <UiSkeleton v-for="i in 4" :key="i" variant="card" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="hub-error">
      <UiEmptyState
        title="班级空间暂时无法打开"
        :description="error"
      >
        <template #action>
          <button class="btn-primary" type="button" @click="loadData">重新加载</button>
        </template>
      </UiEmptyState>
    </div>

    <!-- Content -->
    <div v-else-if="overviewData" class="class-space-workbench">
      <ClassSpaceSectionNav :sections="sections" />

      <main class="class-space-main">
        <!-- Group Chat -->
        <section id="group-chat" class="hub-section">
          <GroupChatStage
            :api-base="apiBase"
            :initial-items="overviewData.chat.items"
            :initial-cursor="overviewData.chat.cursor"
            :initial-mute="overviewData.chat.mute"
          />
        </section>

        <!-- Albums -->
        <section id="albums" class="hub-section">
          <div class="section-header">
            <div>
              <p class="section-header__kicker">CLASS ALBUMS</p>
              <h2 class="section-header__title">精选影像</h2>
            </div>
            <a :href="href('album')" class="section-header__link">
              进入影像馆
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
          <ClassSpaceAlbumRail :albums="overviewData.albums" :api-base="apiBase" :site-base="siteBase" />
        </section>

        <!-- Timeline -->
        <section id="timeline" class="hub-section">
          <div class="section-header">
            <div>
              <p class="section-header__kicker">CLASS TIMELINE</p>
              <h2 class="section-header__title">班级大事</h2>
            </div>
            <a :href="href('timeline')" class="section-header__link">
              完整时间轴
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
          <ClassSpaceTimelineRail :timeline="overviewData.timeline" :api-base="apiBase" />
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ClassSpaceOverview } from '@alumni/shared'
import { fetchClassSpaceOverview } from '../api/classSpace'
import ClassSpaceAlbumRail from './ClassSpaceAlbumRail.vue'
import ClassSpaceSectionNav from './ClassSpaceSectionNav.vue'
import ClassSpaceTimelineRail from './ClassSpaceTimelineRail.vue'
import GroupChatStage from './GroupChatStage.vue'
import UiSkeleton from './ui/UiSkeleton.vue'
import UiEmptyState from './ui/UiEmptyState.vue'

const props = defineProps<{
  apiBase: string
  siteBase: string
}>()

const overviewData = ref<ClassSpaceOverview | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const sections = computed(() => overviewData.value ? [
  { id: 'group-chat', index: '01', label: '班级群聊', description: '此刻的对话', count: overviewData.value.counts.groupMessages },
  { id: 'albums', index: '02', label: '精选影像', description: '值得翻看的照片', count: overviewData.value.counts.albums },
  { id: 'timeline', index: '03', label: '班级大事', description: '由我们郑重记下', count: overviewData.value.counts.timelineItems },
] : [])

function href(path: string) {
  const base = props.siteBase.endsWith('/') ? props.siteBase : `${props.siteBase}/`
  return `${base}${path.replace(/^\/+/, '')}`
}

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const data = await fetchClassSpaceOverview(props.apiBase)
    overviewData.value = data
  } catch (e: any) {
    error.value = e.message || '加载失败'
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
  min-height: 100vh;
}

/* Loading */
.hub-loading {
  padding: var(--space-7) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.hub-loading__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

/* Error */
.hub-error {
  padding: var(--space-9) var(--space-5);
}

/* Workbench */
.class-space-workbench {
  display: grid;
  grid-template-columns: 176px 1fr;
  gap: var(--space-6);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-7) var(--space-5);
}

.class-space-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* Section Header */
.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.section-header__kicker {
  font-size: var(--type-caption-uppercase);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 var(--space-1) 0;
}

.section-header__title {
  font-family: var(--font-display);
  font-size: var(--type-title-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
  margin: 0;
}

.section-header__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  color: var(--accent);
  text-decoration: none;
  transition: gap var(--duration-fast) var(--ease-out-expo);
}

.section-header__link:hover {
  gap: var(--space-3);
}

/* Hub Section */
.hub-section {
  position: relative;
}

/* Responsive */
@media (max-width: 1024px) {
  .class-space-workbench {
    grid-template-columns: 1fr;
    padding: var(--space-5) var(--space-4);
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 768px) {
  .hub-loading__grid {
    grid-template-columns: 1fr;
  }
}
</style>
