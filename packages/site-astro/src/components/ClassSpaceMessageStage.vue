<template>
  <div class="message-stage-container">
    <div v-if="approvedMessages.length > 0" class="message-grid">
      <article
        v-for="msg in approvedMessages"
        :key="msg.id"
        :class="['message-card', `style-${msg.cardStyle || 'paper'}`]"
      >
        <div class="message-meta">
          <span class="author">{{ msg.authorName }}</span>
          <span class="date">{{ formatDate(msg.createdAt) }}</span>
        </div>
        <p class="content">{{ msg.content }}</p>
        
        <div class="reactions-preview" v-if="hasReactions(msg.reactions)">
          <span
            v-for="(count, emoji) in msg.reactions"
            :key="emoji"
            v-show="count > 0"
            class="reaction-badge"
          >
            {{ emoji }} {{ count }}
          </span>
        </div>
      </article>
    </div>
    <div v-else class="empty-messages">
      <p class="empty-text">留言板空空如也，快去写下第一条留言吧 ~</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PublicMessage } from '@alumni/shared'

const props = defineProps<{
  messages: PublicMessage[]
}>()

const approvedMessages = computed(() => {
  return props.messages
    .filter(m => m.status === 'approved' || (m as any).isApproved)
    .slice(0, 8)
})

function formatDate(value: string) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch (e) {
    return value
  }
}

function hasReactions(reactions: Record<string, number> | undefined) {
  if (!reactions) return false
  return Object.values(reactions).some(count => count > 0)
}
</script>

<style scoped>
.message-stage-container {
  width: 100%;
}

.message-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--spacing-md);
  perspective: 1000px;
}

.message-card {
  position: relative;
  padding: var(--spacing-lg);
  border-radius: var(--rounded-md);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 150px;
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
  border: 1px solid var(--color-paper-border);
}

.message-grid > article:nth-child(even) {
  transform: rotate(0.8deg);
}

.message-grid > article:nth-child(odd) {
  transform: rotate(-0.8deg);
}

.message-card:hover {
  transform: translateY(-4px) rotate(0deg) scale(1.02) !important;
  box-shadow: 0 10px 24px rgba(74, 50, 29, 0.12);
  z-index: 2;
}

.content {
  word-break: break-word;
  overflow-wrap: break-word;
  margin: var(--spacing-sm) 0;
  flex-grow: 1;
  font-size: var(--type-body-sm-size);
  color: var(--color-paper-ink);
  line-height: 1.6;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
  border-bottom: 1px dashed rgba(139,120,95,0.15);
  padding-bottom: var(--spacing-xs);
}

.author {
  font-weight: 600;
}

.reactions-preview {
  display: flex;
  gap: var(--spacing-xxs);
  margin-top: var(--spacing-xs);
  flex-wrap: wrap;
}

.reaction-badge {
  font-size: 11px;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 6px;
  border-radius: var(--rounded-pill);
  color: var(--color-paper-muted);
}

/* Card Style Overrides */
.style-paper {
  background: #fcfaf2;
  border-color: #eedec4;
  box-shadow: 0 4px 12px rgba(139,120,95,0.06);
}

.style-chalkboard {
  background: #1e2d2f;
  border-color: #10191a;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.style-chalkboard .content {
  color: #f5f5f5;
}
.style-chalkboard .message-meta {
  color: #e0f2f1;
  border-bottom-color: rgba(255,255,255,0.1);
}
.style-chalkboard .reaction-badge {
  background: rgba(255,255,255,0.1);
  color: #e0f2f1;
}

.style-photoback {
  background: #ffffff;
  border-color: #e0e0e0;
  box-shadow: 0 6px 16px rgba(0,0,0,0.05);
}

.style-letter {
  background: #faf6f0;
  background-image: repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 25px, #e0d4c9 26px);
  line-height: 26px !important;
  border-color: #e0d4c9;
  box-shadow: 0 4px 12px rgba(93,64,55,0.06);
}
.style-letter .content {
  line-height: 26px !important;
}

.empty-messages {
  padding: var(--spacing-xl);
  text-align: center;
  background: var(--color-surface-cream, #fbfaf7);
  border: 1px dashed var(--color-paper-border);
  border-radius: var(--rounded-lg);
}

.empty-text {
  color: var(--color-muted);
  font-size: var(--type-body-sm-size);
}

@media (max-width: 768px) {
  .message-grid {
    grid-template-columns: 1fr;
  }
  .message-grid > article:nth-child(even),
  .message-grid > article:nth-child(odd) {
    transform: none !important;
  }
}
</style>
