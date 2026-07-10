<template>
  <div class="public-message-list">
    <article
      v-for="msg in messages"
      :key="msg.id"
      :class="['public-message-card', `style-${msg.cardStyle}`]"
    >
      <div class="message-card-meta">
        <span>{{ msg.authorName }}</span>
        <span>{{ formatDate(msg.createdAt) }}</span>
      </div>
      <p>{{ msg.content }}</p>
      
      <span v-if="msg.status === 'pending'" class="status-stamp">待审核</span>
      <span v-if="msg.status === 'rejected'" class="status-stamp rejected">未通过</span>
      <p v-if="msg.reviewReason" class="review-reason">{{ msg.reviewReason }}</p>

      <!-- 表情反应区域 -->
      <div v-if="msg.status === 'approved'" class="message-card-reactions">
        <button
          v-for="emoji in ['❤️', '👍', '😂', '🎉']"
          :key="emoji"
          class="reaction-btn"
          @click="handleReact(msg.id, emoji)"
          :aria-label="`反应 ${emoji}`"
        >
          <span class="reaction-emoji">{{ emoji }}</span>
          <span class="reaction-count">{{ (msg.reactions && msg.reactions[emoji]) || 0 }}</span>
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { PublicMessage } from '../composables/usePublicMessages'

defineProps<{
  messages: PublicMessage[]
}>()

const emit = defineEmits<{
  (e: 'react', payload: { id: string; reaction: string }): void
}>()

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function handleReact(id: string, reaction: string) {
  emit('react', { id, reaction })
}
</script>

<style scoped>
.public-message-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacing-lg);
}
.public-message-card {
  position: relative;
  padding: var(--spacing-lg);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  box-shadow: var(--shadow-paper-card);
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 160px;
}
.public-message-list > article:nth-child(even) {
  transform: rotate(0.6deg);
}
.public-message-list > article:nth-child(odd) {
  transform: rotate(-0.6deg);
}
.public-message-card:hover {
  transform: translateY(-4px) rotate(0deg) scale(1.01) !important;
  box-shadow: 0 10px 24px rgba(74, 50, 29, 0.12);
  z-index: 2;
}
.public-message-card p {
  word-break: break-word;
  overflow-wrap: break-word;
  margin: var(--spacing-sm) 0;
  flex-grow: 1;
}
.message-card-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm);
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.status-stamp {
  display: inline-flex;
  margin-top: var(--spacing-sm);
  color: var(--color-paper-stamp-red);
  font-size: var(--type-caption-size);
  border: 1px solid currentColor;
  border-radius: var(--rounded-sm);
  padding: 2px 8px;
  align-self: flex-start;
}
.review-reason {
  color: var(--color-error);
  font-size: var(--type-body-sm-size);
  margin-top: var(--spacing-xs);
}

/* reactions styles */
.message-card-reactions {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-md);
  flex-wrap: wrap;
}
.reaction-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--rounded-pill);
  border: 1px solid var(--color-paper-border);
  background: color-mix(in srgb, var(--color-paper-card) 60%, transparent);
  cursor: pointer;
  font-size: var(--type-caption-size);
  transition: transform var(--duration-fast) ease, background-color var(--duration-fast) ease;
}
.reaction-btn:hover {
  transform: scale(1.05);
  background: color-mix(in srgb, var(--color-paper-card) 80%, transparent);
}
.reaction-emoji {
  font-size: 14px;
}
.reaction-count {
  font-size: 12px;
  color: var(--color-paper-ink);
}

/* Card Styles */
.style-paper {
  background: #fcfaf2;
  border: 1px solid #eedec4;
  color: #4a3e3d;
  box-shadow: 0 4px 12px rgba(139,120,95,0.08);
}
.style-chalkboard {
  background: #1e2d2f;
  border: 1px solid #10191a;
  color: #f5f5f5;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.style-chalkboard .message-card-meta,
.style-chalkboard p,
.style-chalkboard .status-stamp,
.style-chalkboard .review-reason {
  color: #e0f2f1;
}
.style-chalkboard .reaction-btn {
  border-color: #10191a;
  background: rgba(255, 255, 255, 0.1);
}
.style-chalkboard .reaction-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
.style-chalkboard .reaction-count {
  color: #e0f2f1;
}
.style-photoback {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  color: #212121;
  box-shadow: 0 8px 20px rgba(0,0,0,0.06);
}
.style-letter {
  background: #faf6f0;
  background-image: repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 27px, #e0d4c9 28px);
  line-height: 28px !important;
  color: #3e2723;
  border: 1px solid #e0d4c9;
  box-shadow: 0 4px 12px rgba(93,64,55,0.08);
}
.style-letter p {
  line-height: 28px !important;
}

@media (max-width: 768px) {
  .public-message-list { grid-template-columns: 1fr; }
  /* 移动端去掉卡片旋转 */
  .public-message-list > article:nth-child(even),
  .public-message-list > article:nth-child(odd) {
    transform: none !important;
  }
}
</style>
