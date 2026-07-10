<template>
  <form class="mail-compose" @submit.prevent="handleSubmit">
    <div class="form-group">
      <label class="form-label">收件同学</label>
      <RecipientPicker
        :api-base="apiBase"
        v-model="selectedRecipient"
      />
    </div>

    <div class="form-group">
      <label class="form-label">信件标题</label>
      <input
        v-model="subject"
        type="text"
        class="paper-input"
        placeholder="给信件起个标题吧..."
        maxlength="80"
        required
      />
    </div>

    <div class="form-group">
      <label class="form-label">信纸正文</label>
      <textarea
        v-model="body"
        class="paper-textarea"
        placeholder="把想说的话写在这张信纸上..."
        maxlength="2000"
        required
      />
    </div>

    <div class="form-actions">
      <button
        type="submit"
        class="btn-primary"
        :disabled="sending || !canSend"
      >
        {{ sending ? '投递中...' : '寄出信件' }}
      </button>
    </div>

    <p v-if="notice" :class="['mail-notice', notice.type]">
      {{ notice.text }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import RecipientPicker from './RecipientPicker.vue'
import { fetchRecipientDirectory } from '../api/postOffice'
import type { ClassmateEntry } from '@alumni/shared'

const props = defineProps<{
  apiBase: string
  sending: boolean
  notice: { type: 'success' | 'error'; text: string } | null
  defaultRecipientSlug?: string
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { recipientSlug: string; subject: string; body: string }): void
}>()

const selectedRecipient = ref<ClassmateEntry | null>(null)
const subject = ref('')
const body = ref('')

const canSend = computed(() => {
  return selectedRecipient.value !== null && subject.value.trim() !== '' && body.value.trim() !== ''
})

// 加载默认收件人
async function initDefaultRecipient() {
  if (props.defaultRecipientSlug) {
    try {
      const classmates = await fetchRecipientDirectory(props.apiBase)
      const found = classmates.find(c => c.slug === props.defaultRecipientSlug)
      if (found) {
        selectedRecipient.value = found
      }
    } catch (e) {
      console.error('加载默认收件人失败', e)
    }
  }
}

onMounted(initDefaultRecipient)

// 如果 defaultRecipientSlug 发生变化，也更新
watch(() => props.defaultRecipientSlug, initDefaultRecipient)

function handleSubmit() {
  if (!canSend.value || !selectedRecipient.value) return
  
  emit('submit', {
    recipientSlug: selectedRecipient.value.slug,
    subject: subject.value.trim(),
    body: body.value.trim()
  })
}

// 暴露清空方法
function reset() {
  selectedRecipient.value = null
  subject.value = ''
  body.value = ''
}

defineExpose({
  reset
})
</script>

<style scoped>
.mail-compose {
  display: grid;
  gap: var(--spacing-md);
  background: var(--color-paper-card);
  padding: var(--spacing-lg);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
}

.form-group {
  display: grid;
  gap: var(--spacing-xs);
}

.form-label {
  font-size: var(--type-caption-size);
  font-weight: 600;
  color: var(--color-paper-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.paper-input,
.paper-textarea {
  width: 100%;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  color: var(--color-paper-ink);
  padding: var(--spacing-sm) var(--spacing-md);
  font: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.paper-input:focus,
.paper-textarea:focus {
  outline: none;
  border-color: var(--color-paper-brown);
  box-shadow: 0 0 0 2px rgba(139, 94, 60, 0.1);
}

.paper-textarea {
  min-height: 180px;
  resize: vertical;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-sm);
}

.btn-primary {
  min-height: 40px;
  padding: 0 var(--spacing-lg);
  border: none;
  border-radius: var(--rounded-pill);
  background: var(--color-paper-brown);
  color: var(--color-paper-card);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-primary:disabled {
  background: var(--color-paper-border);
  color: var(--color-paper-muted);
  cursor: not-allowed;
}

.mail-notice {
  font-size: var(--type-caption-size);
  margin-top: var(--spacing-xs);
  text-align: center;
  font-weight: 500;
}

.mail-notice.success {
  color: var(--color-success);
}

.mail-notice.error {
  color: var(--color-error);
}
</style>
