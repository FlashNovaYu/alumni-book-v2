<template>
  <section class="direct-conversation-list" aria-label="私聊会话">
    <header>
      <div>
        <p class="paper-kicker">DIRECT NOTES</p>
        <h2>私聊</h2>
      </div>
      <button type="button" @click="$emit('new')">新建私聊</button>
    </header>

    <p v-if="!items.length" class="empty-state">还没有私聊，从一封新消息开始吧。</p>
    <div v-else class="conversation-items" role="list">
      <button
        v-for="conversation in items"
        :key="conversation.id"
        type="button"
        class="conversation-item"
        :class="{ 'is-selected': selectedId === conversation.id }"
        :aria-label="conversation.peer.name"
        :aria-current="selectedId === conversation.id ? 'true' : undefined"
        @click="$emit('select', conversation)"
      >
        <span class="conversation-avatar" aria-hidden="true">
          <img
            v-if="conversation.peer.avatarUrl && !failedAvatarIds.has(conversation.id)"
            :src="avatarUrl(conversation.peer.avatarUrl)"
            alt=""
            width="38"
            height="38"
            loading="lazy"
            decoding="async"
            @error="failedAvatarIds.add(conversation.id)"
          />
          <span v-else>{{ conversation.peer.name.slice(0, 1) }}</span>
        </span>
        <span class="conversation-copy">
          <span class="conversation-title"><strong>{{ conversation.peer.name }}</strong><time>{{ formatTime(conversation.updatedAt) }}</time></span>
          <span class="conversation-preview">{{ conversation.lastMessage?.body || '等待第一句消息' }}</span>
        </span>
        <span v-if="conversation.unreadCount" class="unread-count">{{ conversation.unreadCount }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DirectConversation } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

const props = defineProps<{ items: DirectConversation[]; selectedId?: string | null; apiBase: string }>()
defineEmits<{ select: [conversation: DirectConversation]; new: [] }>()

const failedAvatarIds = ref(new Set<string>())

function avatarUrl(value: string) {
  return value.startsWith('http') ? value : joinApiUrl(props.apiBase, value)
}

function formatTime(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
</script>

<style scoped>
.direct-conversation-list { min-width: 0; }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--spacing-sm); padding: var(--spacing-md); border-bottom: 1px solid var(--color-paper-border); }
header p, header h2 { margin: 0; }
header h2 { margin-top: 2px; color: var(--color-paper-ink); font-family: var(--font-display); font-size: 24px; }
header button { min-height: 34px; padding: 0 8px; color: var(--color-paper-brown); background: transparent; border: 1px solid var(--color-paper-border); font: inherit; font-size: 12px; cursor: pointer; }
.conversation-items { display: grid; }
.conversation-item { position: relative; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 10px; align-items: center; width: 100%; min-height: 68px; padding: 10px var(--spacing-md); color: var(--color-paper-ink); background: transparent; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--color-paper-border) 72%, transparent); font: inherit; text-align: left; cursor: pointer; }
.conversation-item:hover, .conversation-item.is-selected { background: var(--color-paper-bg-soft); }
.conversation-item.is-selected::before { position: absolute; inset: 11px auto 11px 0; width: 2px; background: var(--color-paper-stamp-red); content: ''; }
.conversation-avatar { display: grid; width: 38px; height: 38px; place-items: center; overflow: hidden; color: var(--color-paper-brown); background: var(--color-paper-card); border: 1px solid var(--color-paper-border); border-radius: 50%; font-size: 13px; font-weight: 700; }
.conversation-avatar img { width: 100%; height: 100%; object-fit: cover; }
.conversation-copy { display: grid; min-width: 0; gap: 3px; }
.conversation-title { display: flex; justify-content: space-between; gap: var(--spacing-sm); }
.conversation-title strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.conversation-title time { flex: 0 0 auto; color: var(--color-paper-muted); font-size: 11px; }
.conversation-preview { overflow: hidden; color: var(--color-paper-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.unread-count { display: grid; min-width: 18px; height: 18px; padding: 0 4px; place-items: center; color: #fffaf2; background: var(--color-paper-stamp-red); border-radius: 9px; font-size: 10px; font-variant-numeric: tabular-nums; }
.empty-state { margin: 0; padding: var(--spacing-xl) var(--spacing-md); color: var(--color-paper-muted); font-size: 13px; line-height: 1.6; text-align: center; }
</style>
