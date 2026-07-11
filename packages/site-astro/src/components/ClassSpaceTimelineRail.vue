<template>
  <div v-if="sortedTimeline.length" class="timeline-rail" role="list" aria-label="班级大事横向时间轴">
    <article v-for="item in sortedTimeline" :key="item.id" class="timeline-rail-card" role="listitem">
      <div class="timeline-rail-marker" aria-hidden="true"><span></span></div>
      <time :datetime="item.date">{{ formatDate(item.date) }}</time>
      <p class="timeline-rail-type">{{ typeLabel(item.type) }}</p>
      <h3>{{ item.title }}</h3>
      <p v-if="item.description" class="timeline-rail-description">{{ item.description }}</p>
      <img v-if="item.photoUrl" :src="photoUrl(item.photoUrl)" :alt="item.title" loading="lazy" />
    </article>
  </div>
  <div v-else class="timeline-rail-empty">时间轴暂无记录。</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ClassSpaceOverview } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

type TimelineItem = ClassSpaceOverview['timeline'][number]

const props = defineProps<{ timeline: TimelineItem[]; apiBase: string }>()

const sortedTimeline = computed(() => [...props.timeline].sort((a, b) => {
  const timeDifference = new Date(a.date).getTime() - new Date(b.date).getTime()
  return timeDifference || a.id.localeCompare(b.id)
}))

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function typeLabel(type: TimelineItem['type']) {
  return ({ event: '班级大事', message: '寄语', photo: '影像', join: '新成员' })[type]
}

function photoUrl(value: string) {
  return value.startsWith('http') ? value : joinApiUrl(props.apiBase, `/api/files/${value.replace(/^\/+/, '')}`)
}
</script>

<style scoped>
.timeline-rail {
  position: relative;
  display: flex;
  gap: var(--spacing-md);
  overflow-x: auto;
  padding: var(--spacing-sm) 0 var(--spacing-md);
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: var(--color-paper-border) transparent;
  touch-action: pan-x pan-y;
}

.timeline-rail::before { content: ''; position: absolute; top: 25px; right: 0; left: 0; height: 1px; background: var(--color-paper-border); }
.timeline-rail-card {
  position: relative;
  display: grid;
  flex: 0 0 clamp(246px, 29vw, 340px);
  gap: var(--spacing-xs);
  min-width: 0;
  padding: 0 var(--spacing-md) var(--spacing-md);
  scroll-snap-align: start;
  color: var(--color-paper-ink);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}

.timeline-rail-marker { position: relative; z-index: 1; display: grid; width: 18px; height: 18px; margin-top: -1px; place-items: center; background: var(--color-paper-card); border: 1px solid var(--color-paper-brown); border-radius: 50%; }
.timeline-rail-marker span { width: 6px; height: 6px; background: var(--color-paper-stamp-red); border-radius: 50%; }
.timeline-rail-card time { margin-top: var(--spacing-xs); color: var(--color-paper-muted); font-size: 12px; }
.timeline-rail-type { margin: 0; color: var(--color-paper-brown); font-size: 11px; font-weight: 700; }
.timeline-rail-card h3 { margin: 0; font-family: var(--font-display); font-size: 19px; line-height: 1.25; }
.timeline-rail-description { margin: 0; color: var(--color-paper-muted); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
.timeline-rail-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border: 1px solid var(--color-paper-border); }
.timeline-rail-empty { padding: var(--spacing-xl); color: var(--color-paper-muted); text-align: center; border: 1px dashed var(--color-paper-border); }

@media (max-width: 768px) {
  .timeline-rail-card { flex-basis: min(78vw, 300px); }
}
</style>
