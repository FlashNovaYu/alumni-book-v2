<template>
  <article v-if="notification" class="notification-detail" aria-label="通知详情">
    <header>
      <p class="paper-kicker">{{ notification.type.replaceAll('_', ' ') }}</p>
      <h2>{{ notification.title }}</h2>
      <time :datetime="notification.createdAt">{{ formatTime(notification.createdAt) }}</time>
    </header>
    <p>{{ notification.body }}</p>
  </article>
  <section v-else class="detail-empty" aria-label="通知详情为空">选择一条通知查看内容。</section>
</template>

<script setup lang="ts">
import type { NotificationItem } from '@alumni/shared'

defineProps<{ notification: NotificationItem | null }>()

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.notification-detail { min-height: 100%; padding: clamp(var(--spacing-lg), 4vw, var(--spacing-xxl)); color: var(--color-paper-ink); background: var(--color-paper-card); border: 1px solid var(--color-paper-border); }
header { padding-bottom: var(--spacing-lg); border-bottom: 1px solid var(--color-paper-border); }
header p, header h2 { margin: 0; }
header h2 { margin-top: var(--spacing-xs); font-family: var(--font-display); font-size: clamp(25px, 3vw, 34px); line-height: 1.25; }
header time { display: block; margin-top: var(--spacing-sm); color: var(--color-paper-muted); font-size: 12px; }
.notification-detail > p { max-width: 680px; margin: var(--spacing-xl) 0 0; font-size: 15px; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-empty { display: grid; min-height: 360px; place-items: center; color: var(--color-paper-muted); background: var(--color-paper-card); border: 1px dashed var(--color-paper-border); font-size: 14px; }
</style>
