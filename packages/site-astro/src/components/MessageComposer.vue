<template>
  <div class="public-message-board__composer">
    <textarea
      v-model="content"
      class="paper-textarea"
      placeholder="写一张便签，贴到全班的留言墙上..."
      maxlength="500"
    />
    <div class="public-message-board__tools">
      <select v-model="cardStyle" class="paper-select" aria-label="便签样式">
        <option value="paper">复古纸张</option>
        <option value="letter">横格信笺</option>
        <option value="photoback">拍立得背面</option>
        <option value="chalkboard">黑板便签</option>
      </select>
      <span class="char-count">{{ content.length }}/500</span>
      <button class="btn-primary" :disabled="submitting || !content.trim()" @click="handleSubmit">
        {{ submitting ? '投递中...' : '提交留言' }}
      </button>
    </div>
    <p v-if="notice" :class="['board-notice', notice.type]">{{ notice.text }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  submitting: boolean
  notice: { type: 'success' | 'error'; text: string } | null
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { content: string; cardStyle: string }): void
}>()

const content = ref('')
const cardStyle = ref('paper')

function handleSubmit() {
  if (!content.value.trim() || props.submitting) return
  emit('submit', {
    content: content.value.trim(),
    cardStyle: cardStyle.value,
  })
}

function reset() {
  content.value = ''
  cardStyle.value = 'paper'
}

defineExpose({ reset })
</script>

<style scoped>
.public-message-board__composer {
  padding: var(--spacing-lg);
  border: 1px dashed var(--color-paper-border);
  background: color-mix(in srgb, var(--color-paper-card) 88%, #fffaf2);
}
.paper-textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  color: var(--color-paper-ink);
  padding: var(--spacing-md);
  font: inherit;
}
.public-message-board__tools {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  flex-wrap: wrap;
}
.paper-select {
  min-height: 40px;
  border: 1px solid var(--color-paper-border);
  background: var(--color-paper-card);
  border-radius: var(--rounded-md);
  color: var(--color-paper-ink);
  padding: 0 var(--spacing-sm);
}
.char-count {
  margin-left: auto;
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.board-notice.success { color: var(--color-success); }
.board-notice.error { color: var(--color-error); }

@media (max-width: 768px) {
  .char-count { margin-left: 0; }
  .public-message-board__tools .btn-primary { width: 100%; }
}
</style>
