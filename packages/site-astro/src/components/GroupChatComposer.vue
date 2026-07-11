<template>
  <form class="group-chat-composer" @submit.prevent="submit">
    <p v-if="mute" class="mute-notice" role="status">
      当前无法发言：{{ mute.reason }}<span v-if="mute.mutedUntil">，至 {{ formatMuteUntil(mute.mutedUntil) }}</span>
    </p>
    <div v-else class="composer-row">
      <textarea
        v-model="draft"
        rows="1"
        placeholder="写下消息……"
        :disabled="sending"
        @keydown.enter.exact.prevent="submit"
      ></textarea>
      <button type="submit" :disabled="sending || !draft.trim()">发送消息</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { GroupChatMute } from '../api/groupChat'

const props = defineProps<{
  mute: GroupChatMute | null
  sending: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
}>()

const draft = ref('')

function submit() {
  const content = draft.value.trim()
  if (!content || props.sending || props.mute) return
  emit('send', content)
  draft.value = ''
}

function formatMuteUntil(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.group-chat-composer { padding-top: var(--spacing-sm); border-top: 1px solid var(--color-paper-border); }
.composer-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--spacing-sm); align-items: end; }
textarea { min-height: 44px; max-height: 120px; padding: 11px 12px; resize: vertical; color: var(--color-paper-ink); background: var(--color-paper-bg-soft); border: 1px solid var(--color-paper-border); border-radius: var(--rounded-md); font: inherit; line-height: 1.45; }
textarea:focus { outline: 2px solid color-mix(in srgb, var(--color-paper-brown) 50%, transparent); outline-offset: 1px; }
button { min-width: 88px; min-height: 44px; padding: 0 14px; color: #fffaf2; background: var(--color-paper-brown); border: 1px solid var(--color-paper-brown); border-radius: var(--rounded-md); font: inherit; font-weight: 700; cursor: pointer; }
button:disabled, textarea:disabled { opacity: 0.58; cursor: not-allowed; }
.mute-notice { margin: 0; padding: 10px 12px; color: var(--color-paper-stamp-red); background: color-mix(in srgb, var(--color-paper-stamp-red) 7%, var(--color-paper-card)); border: 1px solid color-mix(in srgb, var(--color-paper-stamp-red) 26%, var(--color-paper-border)); font-size: 13px; line-height: 1.5; }

@media (max-width: 520px) {
  .composer-row { grid-template-columns: 1fr; }
  button { width: 100%; }
}
</style>
