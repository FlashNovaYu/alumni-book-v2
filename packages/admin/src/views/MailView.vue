<template>
  <div class="mail-admin-page">
    <div class="page-header">
      <h1 class="page-title">班级邮局</h1>
    </div>

    <form class="card mail-form" @submit.prevent="send">
      <label>
        收件人 slug
        <input v-model="form.recipientSlug" class="text-input" placeholder="留空时使用群发" />
      </label>
      <label>
        标题
        <input v-model="form.subject" class="text-input" maxlength="80" />
      </label>
      <label>
        正文
        <textarea v-model="form.body" class="text-input mail-body" maxlength="2000" />
      </label>
      <label class="checkbox-row">
        <input v-model="form.allowReply" type="checkbox" />
        允许同学回复
      </label>
      <div class="actions">
        <button class="btn-primary" :disabled="sending || !form.subject.trim() || !form.body.trim()">发送</button>
        <button class="btn-secondary" type="button" :disabled="sending || !form.subject.trim() || !form.body.trim()" @click="broadcast">群发全班</button>
      </div>
      <p v-if="toast" :class="'toast-inline ' + toast.type">{{ toast.message }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { adminFetch } from '@/api/client'

const sending = ref(false)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const form = reactive({
  recipientSlug: '',
  subject: '',
  body: '',
  allowReply: false,
})

let toastTimeout: any = null
function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.value = null }, 3000)
}

async function send() {
  if (!form.recipientSlug.trim()) {
    showToast('error', '单发请输入收件人 slug')
    return
  }
  sending.value = true
  try {
    await adminFetch('/api/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    showToast('success', '信件已发送')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    sending.value = false
  }
}

async function broadcast() {
  if (!confirm('确认向全班群发这封信？')) return
  sending.value = true
  try {
    const res = await adminFetch<{ success: boolean; data: { sentCount: number } }>('/api/admin/mail/broadcast', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    showToast('success', `群发完成，共 ${res.data?.sentCount || 0} 位收件人`)
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.mail-form {
  display: grid;
  gap: var(--spacing-md);
  max-width: 760px;
}
.mail-form label {
  display: grid;
  gap: var(--spacing-xs);
  color: var(--color-muted);
  font-size: var(--type-body-sm-size);
}
.mail-body {
  min-height: 180px;
  resize: vertical;
}
.checkbox-row {
  display: flex !important;
  grid-template-columns: none;
  align-items: center;
  gap: var(--spacing-xs);
}
.actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}
.toast-inline.success { color: var(--color-success); }
.toast-inline.error { color: var(--color-error); }
</style>
