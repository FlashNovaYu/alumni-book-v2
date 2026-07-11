<template>
  <article
    class="group-chat-message"
    :class="isOwn ? 'is-own' : 'is-peer'"
    :data-message-id="message.id"
    :data-message-state="message.deliveryState"
  >
    <div class="message-avatar" aria-hidden="true">
      <img v-if="message.author.avatarUrl" :src="message.author.avatarUrl" alt="" />
      <span v-else>{{ message.author.name.slice(0, 1) }}</span>
    </div>
    <div class="message-content">
      <div class="message-meta">
        <strong>{{ message.author.name }}</strong>
        <time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
      </div>
      <div class="message-bubble">
        <p v-if="message.content">{{ message.content }}</p>
        <p v-else class="message-recalled">这条消息已被撤回</p>
      </div>
      <div v-if="message.deliveryState !== 'sent'" class="delivery-state" role="status">
        <span v-if="message.deliveryState === 'sending'">发送中</span>
        <button v-else type="button" aria-label="重试发送" @click="$emit('retry', message.id)">重试发送</button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { GroupChatUiMessage } from '../composables/useGroupChat'

defineProps<{
  message: GroupChatUiMessage
  isOwn: boolean
}>()

defineEmits<{
  retry: [messageId: string]
}>()

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.group-chat-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: min(80%, 620px);
}

.group-chat-message.is-own {
  flex-direction: row-reverse;
  margin-left: auto;
}

.message-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  overflow: hidden;
  color: var(--color-paper-brown);
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
}

.message-avatar img { width: 100%; height: 100%; object-fit: cover; }
.message-content { min-width: 0; }
.message-meta { display: flex; gap: 8px; align-items: baseline; margin: 0 0 4px; color: var(--color-paper-muted); font-size: 12px; }
.is-own .message-meta { justify-content: flex-end; }
.message-meta strong { color: var(--color-paper-ink); font-size: 13px; }
.message-bubble { padding: 10px 12px; color: var(--color-paper-ink); background: var(--color-paper-card); border: 1px solid var(--color-paper-border); border-radius: var(--rounded-md); line-height: 1.55; }
.is-own .message-bubble { background: color-mix(in srgb, var(--color-paper-brown) 14%, var(--color-paper-card)); border-color: color-mix(in srgb, var(--color-paper-brown) 35%, var(--color-paper-border)); }
.message-bubble p { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.message-recalled { color: var(--color-paper-muted); font-size: 13px; font-style: italic; }
.delivery-state { margin-top: 4px; color: var(--color-paper-muted); font-size: 12px; }
.is-own .delivery-state { text-align: right; }
.delivery-state button { min-height: 28px; padding: 0; color: var(--color-paper-stamp-red); background: transparent; border: 0; font: inherit; cursor: pointer; text-decoration: underline; }

@media (max-width: 768px) {
  .group-chat-message { max-width: 92%; }
}
</style>
