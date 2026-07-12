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
        <p v-if="message.replyTo" class="message-reply-reference">引用 {{ message.replyTo.authorName }}：{{ message.replyTo.preview }}</p>
        <p v-if="message.content">{{ message.content }}</p>
        <p v-else class="message-recalled">这条消息已被撤回</p>
      </div>
      <div v-if="message.deliveryState !== 'sent'" class="delivery-state" role="status">
        <span v-if="message.deliveryState === 'sending'">发送中</span>
        <button v-else type="button" aria-label="重试发送" @click="$emit('retry', message.id)">重试发送</button>
      </div>
        <div v-else-if="message.content" class="message-actions" role="toolbar" aria-label="消息操作">
          <button type="button" aria-label="引用这条消息" @click="$emit('reply', message)">引用</button>
        <button
          ref="reactionTrigger"
          type="button"
          aria-label="添加回应"
          :aria-expanded="reactionMenuOpen"
          :aria-controls="reactionMenuId"
          @click="reactionMenuOpen = !reactionMenuOpen"
          @keydown.esc.stop.prevent="closeReactionMenu(true)"
        >回应</button>
        <div
          v-if="reactionMenuOpen"
          :id="reactionMenuId"
          class="reaction-menu"
          role="group"
          aria-label="选择回应"
          @keydown.esc.stop.prevent="closeReactionMenu(true)"
        >
          <button
            v-for="reaction in reactions"
            :key="reaction.value"
            type="button"
            :aria-label="`回应：${reaction.label}，${message.reactionCounts[reaction.value] || 0} 人`"
            :aria-pressed="message.myReaction === reaction.value"
            @click="selectReaction(reaction.value)"
          >{{ reaction.value }} {{ message.reactionCounts[reaction.value] || 0 }}</button>
        </div>
        <button v-if="canRecall" type="button" aria-label="撤回这条消息" @click="$emit('recall', message.id)">撤回</button>
      </div>
      <div v-if="visibleReactions.length" class="message-reactions" aria-label="消息回应">
        <button
          v-for="reaction in visibleReactions"
          :key="reaction.value"
          type="button"
          :aria-label="`回应：${reaction.label}，${message.reactionCounts[reaction.value] || 0} 人`"
          :aria-pressed="message.myReaction === reaction.value"
          @click="selectReaction(reaction.value)"
        >{{ reaction.value }} {{ message.reactionCounts[reaction.value] || 0 }}</button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { GroupChatUiMessage } from '../composables/useGroupChat'

const props = defineProps<{
  message: GroupChatUiMessage
  isOwn: boolean
  canRecall: boolean
}>()

const emit = defineEmits<{
  retry: [messageId: string]
  reply: [message: GroupChatUiMessage]
  react: [messageId: string, reaction: string]
  recall: [messageId: string]
}>()

const reactions = [{ value: '👍', label: '赞' }, { value: '❤️', label: '喜欢' }, { value: '😂', label: '笑' }, { value: '🎉', label: '庆祝' }]
const reactionMenuOpen = ref(false)
const reactionTrigger = ref<HTMLButtonElement | null>(null)
const reactionMenuId = computed(() => `reaction-menu-${props.message.id}`)
const visibleReactions = computed(() => reactions.filter(reaction => (props.message.reactionCounts[reaction.value] || 0) > 0))

function closeReactionMenu(restoreFocus = false) {
  const wasOpen = reactionMenuOpen.value
  reactionMenuOpen.value = false
  if (restoreFocus && wasOpen) void nextTick(() => reactionTrigger.value?.focus())
}

function selectReaction(reaction: string) {
  closeReactionMenu()
  emit('react', props.message.id, reaction)
}

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
.message-reply-reference { margin-bottom:6px !important; padding-bottom:6px; color:var(--color-paper-muted); border-bottom:1px solid color-mix(in srgb, var(--color-paper-border) 75%, transparent); font-size:12px; }
.delivery-state { margin-top: 4px; color: var(--color-paper-muted); font-size: 12px; }
.is-own .delivery-state { text-align: right; }
.delivery-state button { min-height: 28px; padding: 0; color: var(--color-paper-stamp-red); background: transparent; border: 0; font: inherit; cursor: pointer; text-decoration: underline; }
.message-actions { display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin-top:5px; }
.message-actions button { min-height:32px; padding:0 6px; color:var(--color-paper-muted); background:transparent; border:0; font:inherit; font-size:12px; cursor:pointer; }
.message-actions button[aria-pressed="true"] { color:var(--color-paper-stamp-red); font-weight:700; }
.reaction-menu { display:flex; flex-wrap:wrap; gap:3px; padding:3px; background:var(--color-paper-bg-soft); border:1px solid var(--color-paper-border); }
.message-reactions { display:flex; flex-wrap:wrap; gap:4px; margin-top:5px; }
.message-reactions button { min-height:28px; padding:0 7px; color:var(--color-paper-brown); background:var(--color-paper-bg-soft); border:1px solid var(--color-paper-border); border-radius:var(--rounded-sm); font:inherit; font-size:12px; cursor:pointer; }
.message-reactions button[aria-pressed="true"] { color:var(--color-paper-stamp-red); border-color:color-mix(in srgb, var(--color-paper-stamp-red) 38%, var(--color-paper-border)); }

@media (max-width: 768px) {
  .group-chat-message { max-width: 92%; }
}
</style>
