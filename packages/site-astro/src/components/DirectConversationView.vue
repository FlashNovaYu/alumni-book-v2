<template>
  <section v-if="peer" class="direct-conversation-view" aria-label="私聊详情">
    <header class="conversation-header">
      <div class="peer-identity">
        <span class="peer-avatar" aria-hidden="true">
          <img v-if="peer.avatarUrl" :src="peer.avatarUrl" alt="" />
          <span v-else>{{ peer.name.slice(0, 1) }}</span>
        </span>
        <div><p class="paper-kicker">DIRECT CONVERSATION</p><h2>{{ peer.name }}</h2></div>
      </div>
      <span class="connection-state" :data-state="connectionState">{{ connectionLabel }}</span>
    </header>

    <div ref="log" class="direct-message-log" role="log" :aria-label="`与${peer.name}的私聊记录`" aria-live="polite">
      <p v-if="!messages.length" class="conversation-empty">写下第一句私信，新的会话会在发送后建立。</p>
      <article v-for="message in messages" :key="message.id" class="direct-message" :class="message.senderSlug === currentSlug ? 'is-own' : 'is-peer'">
        <p>{{ message.body }}</p>
        <footer><time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time><span v-if="message.deliveryState === 'sending'">发送中</span><button v-else-if="message.deliveryState === 'failed'" type="button" @click="$emit('retry', message.id)">重试发送</button></footer>
      </article>
    </div>

    <form class="direct-composer" @submit.prevent="submit">
      <textarea v-model="draft" rows="1" :disabled="sending" :placeholder="`写下想对${peer.name}说的话……`" @keydown.enter.exact.prevent="submit"></textarea>
      <button type="submit" :disabled="sending || !draft.trim()">发送私信</button>
    </form>
  </section>
  <section v-else class="detail-empty" aria-label="私聊详情为空">从左侧选择一位同学，或新建一段私聊。</section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ClassmateEntry } from '@alumni/shared'
import type { DirectInboxMessage, InboxConnectionState } from '../composables/useInbox'

const props = defineProps<{
  peer: Pick<ClassmateEntry, 'name' | 'slug' | 'avatarUrl'> | null
  messages: DirectInboxMessage[]
  currentSlug: string
  sending: boolean
  connectionState: InboxConnectionState
}>()

const emit = defineEmits<{ send: [body: string]; retry: [messageId: string] }>()
const draft = ref('')
const connectionLabel = computed(() => ({ ready: '已连接', syncing: '发送中', error: '等待重试' }[props.connectionState]))

function submit() {
  const body = draft.value.trim()
  if (!body) return
  emit('send', body)
  draft.value = ''
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.direct-conversation-view { display: grid; grid-template-rows: auto minmax(360px, 1fr) auto; min-height: 640px; color: var(--color-paper-ink); background: var(--color-paper-card); border: 1px solid var(--color-paper-border); }
.conversation-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--spacing-md); padding: var(--spacing-lg); border-bottom: 1px solid var(--color-paper-border); }
.peer-identity { display: flex; min-width: 0; gap: var(--spacing-sm); align-items: center; }
.peer-avatar { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; overflow: hidden; color: var(--color-paper-brown); background: var(--color-paper-bg-soft); border: 1px solid var(--color-paper-border); border-radius: 50%; font-size: 13px; font-weight: 700; }
.peer-avatar img { width: 100%; height: 100%; object-fit: cover; }
.conversation-header p, .conversation-header h2 { margin: 0; }
.conversation-header h2 { margin-top: 2px; font-family: var(--font-display); font-size: 25px; line-height: 1.2; }
.connection-state { flex: 0 0 auto; padding: 4px 7px; color: var(--color-paper-muted); border: 1px solid var(--color-paper-border); font-size: 11px; }
.connection-state[data-state="error"] { color: var(--color-paper-stamp-red); }
.direct-message-log { display: grid; align-content: end; gap: var(--spacing-md); min-height: 0; overflow-y: auto; padding: var(--spacing-lg); scrollbar-color: var(--color-paper-border) transparent; }
.direct-message { max-width: min(78%, 520px); }
.direct-message.is-own { margin-left: auto; }
.direct-message p { margin: 0; padding: 10px 12px; color: var(--color-paper-ink); background: var(--color-paper-bg-soft); border: 1px solid var(--color-paper-border); border-radius: var(--rounded-md); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.direct-message.is-own p { background: color-mix(in srgb, var(--color-paper-brown) 14%, var(--color-paper-card)); border-color: color-mix(in srgb, var(--color-paper-brown) 35%, var(--color-paper-border)); }
.direct-message footer { display: flex; gap: 7px; margin-top: 4px; color: var(--color-paper-muted); font-size: 11px; }
.direct-message.is-own footer { justify-content: flex-end; }
.direct-message footer button { padding: 0; color: var(--color-paper-stamp-red); background: transparent; border: 0; font: inherit; cursor: pointer; text-decoration: underline; }
.conversation-empty { margin: auto; color: var(--color-paper-muted); font-size: 14px; text-align: center; }
.direct-composer { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--spacing-sm); padding: var(--spacing-md); border-top: 1px solid var(--color-paper-border); }
.direct-composer textarea { min-width: 0; min-height: 44px; max-height: 120px; padding: 10px 12px; resize: vertical; color: var(--color-paper-ink); background: var(--color-paper-bg-soft); border: 1px solid var(--color-paper-border); border-radius: var(--rounded-md); font: inherit; line-height: 1.45; }
.direct-composer button { min-width: 94px; min-height: 44px; padding: 0 14px; color: #fffaf2; background: var(--color-paper-brown); border: 1px solid var(--color-paper-brown); border-radius: var(--rounded-md); font: inherit; font-weight: 700; cursor: pointer; }
.direct-composer button:disabled, .direct-composer textarea:disabled { opacity: 0.58; cursor: not-allowed; }
.detail-empty { display: grid; min-height: 420px; place-items: center; color: var(--color-paper-muted); background: var(--color-paper-card); border: 1px dashed var(--color-paper-border); font-size: 14px; }
@media (max-width: 768px) {
  .direct-conversation-view { min-height: calc(100dvh - 52px); }
  .direct-composer { grid-template-columns: 1fr; }
  .direct-composer button { width: 100%; }
  .direct-composer { padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom)); }
}
</style>
