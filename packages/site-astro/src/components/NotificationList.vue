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
        <span>{{ notification.body }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { NotificationItem } from '@alumni/shared'

defineProps<{ items: NotificationItem[]; selectedId?: string | null }>()
defineEmits<{ select: [notification: NotificationItem] }>()

function formatTime(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
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
</style>
