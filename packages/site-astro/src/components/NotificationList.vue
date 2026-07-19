<template>
  <section class="notification-list" aria-label="通知列表">
    <header><p class="paper-kicker">NOTICE ARCHIVE</p><h2>通知</h2></header>
    <p v-if="!items.length" class="empty-state">暂时没有新的通知。</p>
    <div v-else class="notification-items" role="list">
      <button
        v-for="notification in items"
        :key="notification.id"
        type="button"
        class="notification-item"
        :class="{ 'is-selected': selectedId === notification.id, 'is-unread': !notification.readAt }"
        :aria-current="selectedId === notification.id ? 'true' : undefined"
        @click="$emit('select', notification)"
      >
        <span class="notification-title"><strong>{{ notification.title }}</strong><time>{{ formatTime(notification.createdAt) }}</time></span>
        
        <template v-if="notification.type === 'profile_checkin'">
          <span>{{ notification.body }}</span>
          <div v-if="getVisitors(notification).length > 0" class="visitor-stack">
            <img 
              v-for="(visitor, i) in getVisitors(notification).slice(0, 5)" 
              :key="visitor.slug"
              :src="getAvatarUrl(visitor.avatarUrl)"
              :alt="visitor.name"
              class="visitor-avatar"
              width="32"
              height="32"
              loading="lazy"
              decoding="async"
              :style="{ zIndex: 10 - i }"
              :title="visitor.name"
            />
            <span v-if="getVisitors(notification).length > 5" class="visitor-more" :style="{ zIndex: 0 }">
              +{{ getVisitors(notification).length - 5 }}
            </span>
          </div>
        </template>
        <template v-else>
          <span>{{ notification.body }}</span>
        </template>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { NotificationItem } from '@alumni/shared'

defineProps<{ items: NotificationItem[]; selectedId?: string | null }>()
defineEmits<{ select: [notification: NotificationItem] }>()

const apiBase = import.meta.env.VITE_API_BASE_URL || ''

function formatTime(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function getVisitors(notification: NotificationItem) {
  if (notification.type !== 'profile_checkin' || !notification.relatedId) return []
  try {
    return JSON.parse(notification.relatedId)
  } catch (e) {
    return []
  }
}

function getAvatarUrl(url: string | null) {
  if (!url) return '' // Browser will show broken image icon or we can use empty string
  if (url.startsWith('http')) return url
  return `${apiBase}${url.startsWith('/') ? url : '/' + url}`
}
</script>

<style scoped>
.notification-list { min-width: 0; }
header { padding: var(--spacing-md); border-bottom: 1px solid var(--color-paper-border); }
header p, header h2 { margin: 0; }
header h2 { margin-top: 2px; color: var(--color-paper-ink); font-family: var(--font-display); font-size: 24px; }
.notification-items { display: grid; }
.notification-item { position: relative; display: grid; gap: 5px; width: 100%; min-height: 74px; padding: 11px var(--spacing-md); color: var(--color-paper-muted); background: transparent; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--color-paper-border) 72%, transparent); font: inherit; font-size: 12px; line-height: 1.5; text-align: left; cursor: pointer; }
.notification-item:hover, .notification-item.is-selected { background: var(--color-paper-bg-soft); }
.notification-item.is-selected::before { position: absolute; inset: 12px auto 12px 0; width: 2px; background: var(--color-paper-stamp-red); content: ''; }
.notification-item.is-unread strong { color: var(--color-paper-ink); }
.notification-title { display: flex; justify-content: space-between; gap: var(--spacing-sm); }
.notification-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notification-title time { flex: 0 0 auto; font-size: 11px; }
.empty-state { margin: 0; padding: var(--spacing-xl) var(--spacing-md); color: var(--color-paper-muted); font-size: 13px; text-align: center; }

.visitor-stack { display: flex; margin-top: 6px; padding-left: 2px; }
.visitor-avatar { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--color-paper-card, #fff); object-fit: cover; margin-left: -8px; background: var(--color-paper-bg-soft); position: relative; }
.visitor-stack .visitor-avatar:first-child { margin-left: 0; }
.visitor-more { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--color-paper-card, #fff); background: var(--color-paper-muted); color: var(--color-paper-card, #fff); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; margin-left: -8px; position: relative; }
</style>
