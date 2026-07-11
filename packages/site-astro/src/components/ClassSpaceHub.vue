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
      <aside class="class-space-directory" aria-label="班级空间目录">
        <p>班级空间</p>
        <a href="#group-chat">群聊 <span>{{ overviewData.counts.groupMessages }}</span></a>
        <a href="#albums">影像 <span>{{ overviewData.counts.albums }}</span></a>
        <a href="#timeline">时光 <span>{{ overviewData.counts.timelineItems }}</span></a>
      </aside>

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
            <a href="/album">进入影像馆</a>
          </div>
          <ClassSpaceAlbumRail :albums="overviewData.albums" :api-base="apiBase" />
        </section>

        <section id="timeline" class="hub-section">
          <div class="section-header">
            <div>
              <p class="paper-kicker">CLASS TIMELINE</p>
              <h2>班级大事</h2>
            </div>
            <a href="/timeline">完整时间轴</a>
          </div>
          <ClassSpaceTimelinePreview :timeline="overviewData.timeline" :api-base="apiBase" />
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ClassSpaceOverview } from '@alumni/shared'
import { fetchClassSpaceOverview } from '../api/classSpace'
import ClassSpaceAlbumRail from './ClassSpaceAlbumRail.vue'
import ClassSpaceTimelinePreview from './ClassSpaceTimelinePreview.vue'
import GroupChatStage from './GroupChatStage.vue'

const props = defineProps<{
  apiBase: string
}>()

const overviewData = ref<ClassSpaceOverview | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

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
.class-space-workbench { display: grid; grid-template-columns: 172px minmax(0, 1fr); gap: var(--spacing-xl); align-items: start; }
.class-space-directory { position: sticky; top: calc(var(--nav-height) + var(--spacing-md)); display: grid; gap: 2px; padding: var(--spacing-sm); background: var(--color-paper-bg-soft); border: 1px solid var(--color-paper-border); }
.class-space-directory p { margin: 0 0 4px; padding: 0 var(--spacing-sm); color: var(--color-paper-muted); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
.class-space-directory a { min-height: 38px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--spacing-sm); color: var(--color-paper-ink); text-decoration: none; font-size: 14px; }
.class-space-directory a:hover { color: var(--color-paper-brown); background: var(--color-paper-card); }
.class-space-directory span { color: var(--color-paper-muted); font-size: 12px; }
.class-space-main { display: grid; min-width: 0; gap: var(--spacing-xxl); }
.hub-section { scroll-margin-top: calc(var(--nav-height) + var(--spacing-lg)); }
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

@media (max-width: 1099px) {
  .class-space-workbench { grid-template-columns: 1fr; }
  .class-space-directory { position: static; display: flex; overflow-x: auto; padding: 0; background: transparent; border: 0; border-bottom: 1px solid var(--color-paper-border); }
  .class-space-directory p { display: none; }
  .class-space-directory a { flex: 0 0 auto; min-height: 42px; }
}

@media (max-width: 768px) {
  .section-header h2 { font-size: 23px; }
  .section-header { align-items: flex-start; }
}
</style>
