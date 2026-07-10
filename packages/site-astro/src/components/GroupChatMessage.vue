<template>
  <div 
    class="group-chat-message" 
    :class="{ 'is-me': isMe, 'is-system-style': isRecalled }"
    :role="isRecalled ? undefined : 'log'"
    :aria-live="ariaLive"
  >
    <!-- 被撤回状态 -->
    <div v-if="isRecalled" class="recalled-banner">
      <span class="recalled-text">
        {{ message.status === 'recalled_by_admin' ? '该消息已被管理员删除' : (isMe ? '你撤回了一条消息' : `"${message.author.name}" 撤回了一条消息`) }}
      </span>
    </div>

    <!-- 正常消息状态 -->
    <div v-else class="message-wrapper">
      <!-- 头像 -->
      <div class="author-avatar-container">
        <img 
          v-if="message.author.avatarUrl" 
          :src="message.author.avatarUrl" 
          :alt="message.author.name" 
          class="author-avatar"
        />
        <div v-else class="author-avatar-fallback">
          {{ message.author.name.substring(0, 1) }}
        </div>
      </div>

      <!-- 内容区 -->
      <div class="message-content-area">
        <div class="author-name-row">
          <span class="author-name">{{ message.author.name }}</span>
          <span class="message-time">{{ formattedTime }}</span>
        </div>

        <div class="bubble-row">
          <!-- 消息泡泡 -->
          <div class="message-bubble" :class="{ 'is-sending': message.sending, 'is-failed': message.failed }">
            <!-- 引用回复内容 -->
            <div v-if="message.replyTo" class="reply-preview">
              <span class="reply-author">@{{ message.replyTo.authorName }}</span>
              <span class="reply-text">{{ message.replyTo.preview }}</span>
            </div>
            
            <div class="message-body">{{ message.content }}</div>
          </div>

          <!-- 发送失败重试或发送中 loading -->
          <div v-if="message.sending" class="status-indicator sending-spinner" title="发送中..."></div>
          <button 
            v-if="message.failed" 
            class="status-indicator retry-btn" 
            title="发送失败，点击重试" 
            aria-label="重新发送消息"
            @click="emit('retry', message.clientNonce || '')"
          >
            ⚠️
          </button>
        </div>

        <!-- 表态回应与撤回操作栏 -->
        <div v-if="!message.sending && !message.failed" class="actions-row">
          <!-- 现有表态标签展示 -->
          <div v-if="hasReactions" class="active-reactions">
            <button
              v-for="(count, reaction) in filteredReactions"
              :key="reaction"
              class="reaction-badge"
              :class="{ 'my-active': message.myReaction === reaction }"
              :title="`${count} 人表态了 ${reaction}`"
              :aria-label="`表态 ${reaction}，当前人数 ${count}`"
              @click="toggleReaction(reaction)"
            >
              <span class="badge-emoji">{{ reaction }}</span>
              <span class="badge-count">{{ count }}</span>
            </button>
          </div>

          <!-- 快速回应菜单及撤回入口 -->
          <div class="toolbar-actions">
            <!-- 表情盘触发按钮 -->
            <div class="reaction-picker-container">
              <button 
                class="action-icon-btn picker-trigger" 
                title="回应" 
                aria-label="选择表情回应"
              >
                😀
              </button>
              <!-- 悬浮表情列表 -->
              <div class="reaction-popover" role="menu">
                <button
                  v-for="emoji in EMOJIS"
                  :key="emoji"
                  class="popover-emoji-btn"
                  role="menuitem"
                  :aria-label="`回应 ${emoji}`"
                  @click="toggleReaction(emoji)"
                >
                  {{ emoji }}
                </button>
              </div>
            </div>

            <!-- 撤回按钮 -->
            <button
              v-if="message.canRecall"
              class="action-text-btn recall-btn"
              title="撤回消息 (2分钟内)"
              aria-label="撤回消息"
              @click="emit('recall', message.id)"
            >
              撤回
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GroupChatStatusExt } from '../composables/useGroupChat'

const props = defineProps<{
  message: GroupChatStatusExt
  mySlug: string
  ariaLive?: 'polite' | 'off'
}>()

const emit = defineEmits<{
  (e: 'retry', nonce: string): void
  (e: 'react', id: string, reaction: string | null): void
  (e: 'recall', id: string): void
}>()

const EMOJIS = ['👍', '❤️', '😂', '😮', '😭', '🙏']

const isMe = computed(() => {
  return props.message.author.slug === props.mySlug
})

const isRecalled = computed(() => {
  return props.message.status === 'recalled_by_author' || props.message.status === 'recalled_by_admin'
})

const formattedTime = computed(() => {
  try {
    const d = new Date(props.message.createdAt)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
})

const filteredReactions = computed(() => {
  const counts: Record<string, number> = {}
  if (!props.message.reactionCounts) return counts
  for (const [emoji, count] of Object.entries(props.message.reactionCounts)) {
    if (count > 0) counts[emoji] = count
  }
  return counts
})

const hasReactions = computed(() => {
  return Object.keys(filteredReactions.value).length > 0
})

function toggleReaction(emoji: string) {
  if (props.message.myReaction === emoji) {
    // 已经表态过相同的表情，则取消表态
    emit('react', props.message.id, null)
  } else {
    emit('react', props.message.id, emoji)
  }
}
</script>

<style scoped>
.group-chat-message {
  margin-bottom: var(--spacing-md, 16px);
  padding: 0 var(--spacing-sm);
  display: flex;
  flex-direction: column;
}

.group-chat-message.is-me {
  align-items: flex-end;
}

.recalled-banner {
  align-self: center;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--rounded-md, 12px);
  padding: 4px var(--spacing-md);
  font-size: 12px;
  color: var(--color-paper-muted, #8b785f);
}

.message-wrapper {
  display: flex;
  gap: var(--spacing-md, 12px);
  max-width: 80%;
}

.is-me .message-wrapper {
  flex-direction: row-reverse;
}

/* 头像 */
.author-avatar-container {
  flex-shrink: 0;
}

.author-avatar, .author-avatar-fallback {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--color-paper-border, #eedec4);
}

.author-avatar-fallback {
  background: var(--color-paper-border, #eedec4);
  color: var(--color-paper-ink, #4a3e3d);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}

/* 内容 */
.message-content-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.is-me .message-content-area {
  align-items: flex-end;
}

.author-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.is-me .author-name-row {
  flex-direction: row-reverse;
}

.author-name {
  font-weight: 600;
  color: var(--color-paper-ink, #4a3e3d);
}

.message-time {
  color: var(--color-paper-muted, #8b785f);
}

.bubble-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.is-me .bubble-row {
  flex-direction: row-reverse;
}

/* 消息气泡 */
.message-bubble {
  background: #fff;
  border: 1px solid var(--color-paper-border, #eedec4);
  border-radius: 0 12px 12px 12px;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 14px;
  color: var(--color-paper-ink, #4a3e3d);
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  line-height: 1.5;
  word-break: break-word;
}

.is-me .message-bubble {
  background: var(--color-surface-cream, #fbfaf7);
  border-color: var(--color-paper-border, #eedec4);
  border-radius: 12px 0 12px 12px;
}

.message-bubble.is-sending {
  opacity: 0.6;
}

.message-bubble.is-failed {
  border-color: var(--color-error, #f56565);
}

/* 引用消息 */
.reply-preview {
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.03);
  border-left: 2px solid var(--color-paper-brown, #b8903a);
  padding: 4px var(--spacing-sm);
  margin-bottom: 6px;
  border-radius: 2px;
  font-size: 11px;
}

.reply-author {
  font-weight: 700;
  color: var(--color-paper-brown);
}

.reply-text {
  color: var(--color-paper-muted);
}

/* 发送状态标记 */
.status-indicator {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.sending-spinner {
  border: 2px solid rgba(0,0,0,0.1);
  border-top-color: var(--color-paper-brown);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.retry-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  padding: 4px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  transition: background-color var(--duration-fast) ease;
}

.retry-btn:hover {
  background-color: rgba(229, 62, 62, 0.08);
}

/* 操作行 */
.actions-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: 4px;
}

.is-me .actions-row {
  flex-direction: row-reverse;
}

.active-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.reaction-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #fff;
  border: 1px solid var(--color-paper-border, #eedec4);
  border-radius: var(--rounded-md, 6px);
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
  color: var(--color-paper-ink);
  transition: all var(--duration-fast) ease;
  min-height: 24px;
}

.reaction-badge:hover {
  background: var(--color-surface-cream, #fbfaf7);
}

.reaction-badge.my-active {
  background: rgba(184, 144, 58, 0.08);
  border-color: var(--color-paper-brown);
  color: var(--color-paper-brown);
}

/* 快速工具 */
.toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.reaction-picker-container {
  position: relative;
}

.action-icon-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  width: 44px; /* 图标触控面积至少达 44px */
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color var(--duration-fast) ease;
}

.action-icon-btn:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.action-text-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-paper-muted, #8b785f);
  padding: 4px 8px;
  min-height: 44px; /* 触控高度限制 */
  display: inline-flex;
  align-items: center;
}

.action-text-btn:hover {
  color: var(--color-paper-brown);
}

/* 悬浮表盘 */
.reaction-popover {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md, 8px);
  padding: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  display: none;
  gap: 6px;
  z-index: 50;
  margin-bottom: 4px;
}

.reaction-picker-container:hover .reaction-popover {
  display: flex;
}

.popover-emoji-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color var(--duration-fast) ease;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popover-emoji-btn:hover {
  background-color: var(--color-surface-cream, #fbfaf7);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
