<template>
  <div class="class-space-hub">
    <div v-if="loading" class="hub-loading" aria-busy="true">
      <div class="skeleton-line skeleton-line--short"></div>
      <div class="skeleton-stage"></div>
    </div>

    <div v-else-if="error" class="hub-error">
      <div class="error-card">
        <h2>班级空间暂时无法打开</h2>
        <p>{{ error }}</p>
        <button class="retry-btn" type="button" @click="loadData">重新加载</button>
      </div>
    </div>

    <div v-else-if="overviewData" class="class-space-workbench">
      <ClassSpaceSectionNav :sections="sections" />

      <main class="class-space-main">
        <section id="group-chat" class="hub-section">
          <GroupChatStage
            :api-base="apiBase"
            :initial-items="overviewData.chat.items"
            :initial-cursor="overviewData.chat.cursor"
            :initial-mute="overviewData.chat.mute"
          />
        </section>

        <section id="albums" class="hub-section">
          <div class="section-header">
            <div>
              <p class="paper-kicker">CLASS ALBUMS</p>
              <h2>精选影像</h2>
            </div>
            <a :href="href('album')">进入影像馆</a>
          </div>
          <ClassSpaceAlbumRail :albums="overviewData.albums" :api-base="apiBase" :site-base="siteBase" />
        </section>

        <section id="timeline" class="hub-section">
          <div class="section-header">
            <div>
              <p class="paper-kicker">CLASS TIMELINE</p>
              <h2>班级大事</h2>
            </div>
            <a :href="href('timeline')">完整时间轴</a>
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

const props = defineProps<{
  apiBase: string
  siteBase: string
}>()

const overviewData = ref<ClassSpaceOverview | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const sections = computed(() => overviewData.value ? [
  { id: 'group-chat', label: '群聊', count: overviewData.value.counts.groupMessages },
  { id: 'albums', label: '影像', count: overviewData.value.counts.albums },
  { id: 'timeline', label: '时光', count: overviewData.value.counts.timelineItems },
] : [])

function href(path: string) {
  const base = props.siteBase.endsWith('/') ? props.siteBase : `${props.siteBase}/`
  return `${base}${path.replace(/^\/+/, '')}`
}

async function loadData() {
  loading.value = true
  error.value = null
  try {
    overviewData.value = await fetchClassSpaceOverview(props.apiBase)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '加载班级数据失败，请重试'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.class-space-hub { width: 100%; }
.class-space-workbench { display: grid; grid-template-columns: 1fr; gap: var(--spacing-lg); align-items: start; }
.class-space-main { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: var(--spacing-xxl); }
.hub-section { min-width: 0; scroll-margin-top: calc(var(--nav-height) + var(--spacing-lg)); }
.section-header { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--spacing-md); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 1px solid var(--color-paper-border); }
.section-header h2 { margin: 2px 0 0; color: var(--color-paper-ink); font-family: var(--font-display); font-size: 26px; }
.section-header a { color: var(--color-paper-brown); font-size: 13px; text-decoration: none; white-space: nowrap; }
.hub-loading { display: grid; gap: var(--spacing-md); padding: var(--spacing-xl) 0; }
.skeleton-line, .skeleton-stage { background: rgba(110, 88, 61, 0.08); animation: hub-pulse 1.2s ease-in-out infinite; }
.skeleton-line--short { width: 140px; height: 22px; }
.skeleton-stage { height: 520px; }
.hub-error { display: grid; min-height: 360px; place-items: center; }
.error-card { width: min(420px, 100%); padding: var(--spacing-xl); color: var(--color-paper-ink); background: var(--color-paper-card); border: 1px solid color-mix(in srgb, var(--color-paper-stamp-red) 38%, var(--color-paper-border)); text-align: center; }
.error-card h2, .error-card p { margin: 0; }
.error-card p { margin-top: var(--spacing-sm); color: var(--color-paper-muted); }
.retry-btn { min-height: 44px; margin-top: var(--spacing-lg); padding: 0 var(--spacing-lg); color: #fffaf2; background: var(--color-paper-brown); border: 0; font: inherit; font-weight: 700; cursor: pointer; }
@keyframes hub-pulse { 50% { opacity: 0.45; } }

@media (min-width: 1100px) {
  .class-space-workbench { grid-template-columns: 176px minmax(0, 1fr); gap: var(--spacing-xl); }
}

@media (max-width: 768px) {
  .section-header h2 { font-size: 23px; }
  .section-header { align-items: flex-start; }
}
</style>
