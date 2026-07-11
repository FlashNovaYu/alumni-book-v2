<template>
  <section class="group-chat-stage" aria-label="班级群聊">
    <div class="chat-stage-header">
      <div>
        <p class="paper-kicker">CLASSROOM CHAT</p>
        <h2>班级群聊</h2>
      </div>
      <span class="chat-connection" :data-state="connectionState">{{ connectionLabel }}</span>
    </div>

    <div class="chat-log-wrap">
      <button v-if="loadingOlder" class="history-load-button" type="button" disabled>正在载入更早消息</button>
      <button v-else class="history-load-button" type="button" @click="loadOlderMessages">载入更早消息</button>
      <div ref="log" class="chat-log" role="log" :aria-live="loadingOlder ? 'off' : 'polite'" @scroll="handleScroll">
        <GroupChatMessage
          v-for="message in items"
          :key="message.id"
          :message="message"
          :is-own="message.author.slug === currentSlug"
          @retry="retry"
        />
        <p v-if="!items.length" class="chat-empty">还没有消息，写下第一句吧。</p>
      </div>
      <button v-if="newMessageCount" class="new-message-button" type="button" @click="scrollToLatest">
        有 {{ newMessageCount }} 条新消息
      </button>
    </div>

    <GroupChatComposer :mute="mute" :sending="connectionState === 'syncing'" @send="sendMessage" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { getClassmateStudent, type ClassmateSessionStudent, type GroupChatMessage as GroupChatPayload } from '@alumni/shared'
import type { GroupChatMute } from '../api/groupChat'
import { useGroupChat } from '../composables/useGroupChat'
import GroupChatComposer from './GroupChatComposer.vue'
import GroupChatMessage from './GroupChatMessage.vue'

const props = defineProps<{
  apiBase: string
  initialItems: GroupChatPayload[]
  initialCursor: string
  initialMute: GroupChatMute | null
}>()

const currentSlug = getClassmateStudent<ClassmateSessionStudent>()?.slug || ''
const log = ref<HTMLElement | null>(null)
const positioned = ref(false)
const {
  items,
  mute,
  loadingOlder,
  connectionState,
  newMessageCount,
  send,
  retry,
  loadOlder,
  setNearBottom,
  consumeNewMessages,
} = useGroupChat({
  apiBase: props.apiBase,
  initialItems: props.initialItems,
  initialCursor: props.initialCursor,
  initialMute: props.initialMute,
})

const connectionLabel = computed(() => ({ ready: '已连接', syncing: '发送中', error: '等待重试' }[connectionState.value]))

function scrollToEnd() {
  if (log.value) log.value.scrollTop = log.value.scrollHeight
}

function handleScroll() {
  if (!log.value) return
  const distance = log.value.scrollHeight - log.value.scrollTop - log.value.clientHeight
  setNearBottom(distance < 48)
}

async function loadOlderMessages() {
  const element = log.value
  const previousHeight = element?.scrollHeight || 0
  await loadOlder()
  await nextTick()
  if (element) element.scrollTop += element.scrollHeight - previousHeight
}

async function sendMessage(content: string) {
  await send(content)
  await nextTick()
  scrollToEnd()
}

async function scrollToLatest() {
  await nextTick()
  scrollToEnd()
  setNearBottom(true)
  consumeNewMessages()
}

onMounted(async () => {
  await nextTick()
  scrollToEnd()
  positioned.value = true
})

watch(() => items.value.length, async () => {
  if (!positioned.value) return
  await nextTick()
  const element = log.value
  if (!element) return
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  if (distance < 72) scrollToEnd()
})
</script>

<style scoped>
.group-chat-stage { display: grid; gap: var(--spacing-md); padding: var(--spacing-lg); background: var(--color-paper-card); border: 1px solid var(--color-paper-border); box-shadow: var(--shadow-paper-card); }
.chat-stage-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--spacing-md); }
.chat-stage-header h2 { margin: 2px 0 0; color: var(--color-paper-ink); font-family: var(--font-display); font-size: 24px; line-height: 1.2; }
.chat-connection { padding: 4px 7px; color: var(--color-paper-muted); border: 1px solid var(--color-paper-border); font-size: 11px; white-space: nowrap; }
.chat-connection[data-state="error"] { color: var(--color-paper-stamp-red); border-color: color-mix(in srgb, var(--color-paper-stamp-red) 35%, var(--color-paper-border)); }
.chat-log-wrap { position: relative; }
.history-load-button { display: block; min-height: 36px; margin: 0 auto var(--spacing-xs); padding: 0 10px; color: var(--color-paper-brown); background: transparent; border: 0; font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
.chat-log { display: grid; align-content: end; gap: var(--spacing-md); height: clamp(360px, 52vh, 540px); overflow-y: auto; padding: var(--spacing-sm) 2px var(--spacing-sm) 0; scrollbar-color: var(--color-paper-border) transparent; }
.chat-empty { align-self: center; margin: auto; color: var(--color-paper-muted); font-size: 14px; }
.new-message-button { position: absolute; right: var(--spacing-sm); bottom: var(--spacing-sm); min-height: 36px; padding: 0 10px; color: #fffaf2; background: var(--color-paper-stamp-red); border: 0; border-radius: var(--rounded-sm); font: inherit; font-size: 12px; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 46, 36, 0.2); }

@media (max-width: 768px) {
  .group-chat-stage { padding: var(--spacing-md); }
  .chat-log { height: min(58vh, 500px); }
}
</style>
