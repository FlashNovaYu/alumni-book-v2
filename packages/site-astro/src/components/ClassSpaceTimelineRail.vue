<template>
  <div v-if="sortedTimeline.length" class="timeline-rail" role="list" aria-label="班级大事时间线">
    <div class="timeline-rail__track">
      <article v-for="item in sortedTimeline" :key="item.id" class="timeline-rail-card" role="listitem">
        <time :datetime="item.date" class="timeline-rail-date">{{ formatDate(item.date) }}</time>
        <div class="timeline-rail-marker" aria-hidden="true"><span></span></div>
        <div class="timeline-rail-content">
          <p class="timeline-rail-type">{{ typeLabel(item.type) }}</p>
          <h3>{{ item.title }}</h3>
          <p v-if="item.description" class="timeline-rail-description">{{ item.description }}</p>
          <img v-if="item.photoUrl" :src="photoUrl(item.photoUrl)" :alt="item.title" loading="lazy" decoding="async" />
        </div>
      </article>
    </div>
  </div>
  <div v-else class="timeline-rail-empty">班级大事正在整理，敬请期待。</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ClassSpaceOverview } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

type TimelineItem = ClassSpaceOverview['timeline'][number]

const props = defineProps<{ timeline: TimelineItem[]; apiBase: string }>()

const sortedTimeline = computed(() => [...props.timeline].sort((a, b) => {
  const timeDifference = new Date(b.date).getTime() - new Date(a.date).getTime()
  return timeDifference || a.id.localeCompare(b.id)
}))

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function typeLabel(type: TimelineItem['type']) {
  return ({ event: '班级大事', message: '寄语', photo: '影像', join: '新成员' })[type]
}

function photoUrl(value: string) {
  if (value.startsWith('http')) return value
  if (value.startsWith('/api/files/')) return joinApiUrl(props.apiBase, value)
  return joinApiUrl(props.apiBase, `/api/files/${value.replace(/^\/+/, '')}`)
}
</script>

<style scoped>
.timeline-rail { width: min(100%, 760px); }
.timeline-rail__track { position: relative; display: grid; gap: var(--spacing-md); }
.timeline-rail__track::before { content: ''; position: absolute; top: 0; bottom: 0; left: 103px; width: 1px; background: var(--color-paper-border); }
.timeline-rail-card { position: relative; display: grid; grid-template-columns: 88px 30px minmax(0, 1fr); align-items: start; min-width: 0; }
.timeline-rail-date { padding-top: var(--spacing-md); color: var(--color-paper-muted); font-size: 12px; line-height: 1.45; text-align: right; }
.timeline-rail-marker { position: relative; z-index: 1; display: grid; width: 18px; height: 18px; margin: var(--spacing-md) 0 0 6px; place-items: center; background: var(--color-paper-card); border: 1px solid var(--color-paper-brown); border-radius: 50%; }
.timeline-rail-marker span { width: 6px; height: 6px; background: var(--color-paper-stamp-red); border-radius: 50%; }
.timeline-rail-content { min-width: 0; padding: var(--spacing-md) var(--spacing-lg); color: var(--color-paper-ink); background: var(--color-paper-card); border: 1px solid var(--color-paper-border); box-shadow: var(--shadow-paper-card); }
.timeline-rail-type { margin: 0 0 4px; color: var(--color-paper-brown); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.timeline-rail-content h3 { margin: 0; font-family: var(--font-display); font-size: 19px; line-height: 1.3; }
.timeline-rail-description { display: -webkit-box; margin: var(--spacing-xs) 0 0; max-height: 4.65em; overflow: hidden; color: var(--color-paper-muted); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; }
.timeline-rail-content img { display: block; width: 100%; aspect-ratio: 4 / 3; margin-top: var(--spacing-md); object-fit: cover; border: 1px solid var(--color-paper-border); }
.timeline-rail-empty { padding: var(--spacing-xl); color: var(--color-paper-muted); text-align: center; border: 1px dashed var(--color-paper-border); }

@media (max-width: 768px) {
  .timeline-rail__track::before { left: 67px; }
  .timeline-rail-card { grid-template-columns: 54px 26px minmax(0, 1fr); }
  .timeline-rail-date { padding-top: var(--spacing-sm); font-size: 10px; }
  .timeline-rail-marker { margin-top: var(--spacing-sm); margin-left: 4px; }
  .timeline-rail-content { padding: var(--spacing-sm) var(--spacing-md); }
}
</style>
