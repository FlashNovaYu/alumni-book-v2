<template>
  <div class="group-chat-composer" :class="{ 'is-muted': isMuted }">
    <!-- 禁言状态展示 -->
    <div v-if="isMuted" class="mute-banner" role="alert">
      <span class="mute-icon">🔇</span>
      <span class="mute-text">
        你已被禁言。原因：{{ mute?.reason || '未注明' }} 
        <template v-if="formattedMuteUntil">
          (预计 {{ formattedMuteUntil }} 解禁)
        </template>
      </span>
    </div>

    <!-- 普通编写状态 -->
    <div v-else class="composer-container">
      <textarea
        ref="inputArea"
        v-model="inputContent"
        placeholder="写下你的留言，与同学们互动... (最多500字)"
        class="composer-textarea"
        :disabled="sending"
        rows="2"
        maxlength="500"
        @keydown.enter.prevent="handleEnter"
      ></textarea>
      
      <div class="composer-footer">
        <span class="char-counter" :class="{ 'is-limit': inputContent.length >= 500 }">
          {{ inputContent.length }}/500
        </span>
        <button
          class="send-btn"
          :disabled="sending || !isValid"
          title="发送留言 (Enter)"
          aria-label="发送留言"
          @click="submit"
        >
          <span v-if="sending" class="sending-spinner"></span>
          <span v-else>发送</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  mute: { reason: string; mutedUntil: string | null } | null
  sending?: boolean
}>()

const emit = defineEmits<{
  (e: 'send', body: string): void
}>()

const inputContent = ref('')

const isMuted = computed(() => {
  if (!props.mute) return false
  if (!props.mute.mutedUntil) return true // 永久禁言
  const until = new Date(props.mute.mutedUntil).getTime()
  return until > Date.now()
})

const formattedMuteUntil = computed(() => {
  if (!props.mute || !props.mute.mutedUntil) return ''
  try {
    const d = new Date(props.mute.mutedUntil)
    return d.toLocaleString('zh-CN', { 
      month: 'numeric', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  } catch {
    return ''
  }
})

const isValid = computed(() => {
  const trimmed = inputContent.value.trim()
  return trimmed.length >= 1 && trimmed.length <= 500
})

function handleEnter(e: KeyboardEvent) {
  if (e.shiftKey) {
    // Shift + Enter 换行
    inputContent.value += '\n'
  } else {
    // 纯 Enter 发送
    submit()
  }
}

function submit() {
  if (props.sending || !isValid.value) return
  emit('send', inputContent.value.trim())
  inputContent.value = ''
}
</script>

<style scoped>
.group-chat-composer {
  background: var(--color-paper-card, #fcfaf2);
  border-top: 1px solid var(--color-paper-border, #eedec4);
  padding: var(--spacing-md, 16px);
  position: relative;
}

.mute-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(229, 62, 62, 0.05);
  border: 1px dashed var(--color-error, #f56565);
  border-radius: var(--rounded-md, 6px);
  color: var(--color-error, #f56565);
  font-size: 14px;
}

.composer-container {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 8px);
}

.composer-textarea {
  width: 100%;
  border: 1px solid var(--color-paper-border, #eedec4);
  background: #fff;
  border-radius: var(--rounded-md, 6px);
  padding: var(--spacing-sm, 10px);
  font-size: 14px;
  color: var(--color-paper-ink, #4a3e3d);
  resize: none;
  font-family: inherit;
  outline: none;
  transition: border-color var(--duration-fast) ease;
}

.composer-textarea:focus {
  border-color: var(--color-paper-brown, #b8903a);
}

.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.char-counter {
  font-size: 12px;
  color: var(--color-paper-muted, #8b785f);
}

.char-counter.is-limit {
  color: var(--color-error, #f56565);
}

.send-btn {
  background: var(--color-paper-brown, #b8903a);
  color: #fff;
  border: none;
  border-radius: var(--rounded-md, 6px);
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background-color var(--duration-fast) ease;
}

.send-btn:hover:not(:disabled) {
  background: #a37c2f;
}

.send-btn:disabled {
  background: var(--color-paper-border, #eedec4);
  color: var(--color-paper-muted, #8b785f);
  cursor: not-allowed;
}

.sending-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
