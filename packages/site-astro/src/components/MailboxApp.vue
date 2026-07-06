<template>
  <section class="mailbox-app">
    <div class="mailbox-toolbar">
      <button :class="{ active: mode === 'inbox' }" @click="switchMode('inbox')">收件箱</button>
      <button :class="{ active: mode === 'compose' }" @click="switchMode('compose')">写信</button>
    </div>

    <form v-if="mode === 'compose'" class="mail-compose" @submit.prevent="send">
      <input v-model="draft.recipientSlug" class="paper-input" placeholder="收件同学 slug" />
      <input v-model="draft.subject" class="paper-input" placeholder="信件标题" maxlength="80" />
      <textarea v-model="draft.body" class="paper-textarea" placeholder="把想说的话写在这张信纸上..." maxlength="2000" />
      <button class="btn-primary" :disabled="sending || !canSend">{{ sending ? '投递中...' : '寄出信件' }}</button>
      <p v-if="notice" :class="['mail-notice', notice.type]">{{ notice.text }}</p>
    </form>

    <div v-else class="mailbox-list">
      <div v-if="loading" class="mailbox-empty">正在整理信箱...</div>
      <article v-for="thread in threads" :key="thread.id" :class="['mail-thread', { unread: thread.unread }]">
        <div class="mail-thread__stamp">{{ thread.threadType === 'system' ? '系统' : '信件' }}</div>
        <div>
          <h2>{{ thread.subject }}</h2>
          <p>{{ thread.preview }}</p>
          <span>{{ thread.senderName }} · {{ formatDate(thread.updatedAt) }}</span>
        </div>
      </article>
      <div v-if="!loading && threads.length === 0" class="mailbox-empty">暂时没有信件。</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { fetchMailboxThreads, sendMailboxThread } from '../api/postOffice'

type MailThread = {
  id: string
  subject: string
  threadType: string
  senderName: string
  preview: string
  unread: boolean
  updatedAt: string
}

const props = defineProps<{ apiBase: string; defaultRecipient?: string }>()

const mode = ref<'inbox' | 'compose'>(props.defaultRecipient ? 'compose' : 'inbox')
const loading = ref(false)
const sending = ref(false)
const threads = ref<MailThread[]>([])
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const draft = reactive({
  recipientSlug: props.defaultRecipient || '',
  subject: '',
  body: '',
})

const canSend = computed(() => draft.recipientSlug.trim() && draft.subject.trim() && draft.body.trim())

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function switchMode(newMode: 'inbox' | 'compose') {
  mode.value = newMode
  notice.value = null
}

async function loadThreads() {
  loading.value = true
  try {
    const data = await fetchMailboxThreads(props.apiBase)
    if (data.success) threads.value = data.data?.items || []
  } finally {
    loading.value = false
  }
}

async function send() {
  sending.value = true
  notice.value = null
  try {
    const data = await sendMailboxThread(props.apiBase, {
      recipientSlug: draft.recipientSlug.trim(),
      subject: draft.subject.trim(),
      body: draft.body.trim(),
    })
    if (data.success) {
      notice.value = { type: 'success', text: '信件已寄出' }
      draft.subject = ''
      draft.body = ''
      mode.value = 'inbox'
      await loadThreads()
    } else {
      notice.value = { type: 'error', text: data.message || '发送失败' }
    }
  } catch {
    notice.value = { type: 'error', text: '网络错误，请稍后重试' }
  } finally {
    sending.value = false
  }
}

onMounted(loadThreads)
</script>

<style scoped>
.mailbox-app {
  display: grid;
  gap: var(--spacing-lg);
}
.mailbox-toolbar {
  display: flex;
  gap: var(--spacing-xs);
  border-bottom: 1px solid var(--color-paper-border);
  padding-bottom: var(--spacing-sm);
}
.mailbox-toolbar button {
  min-height: 40px;
  padding: 0 var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-pill);
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
}
.mailbox-toolbar button.active {
  border-color: var(--color-paper-brown);
  color: var(--color-paper-brown);
}
.mail-compose {
  display: grid;
  gap: var(--spacing-sm);
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
}
.paper-textarea {
  min-height: 180px;
  resize: vertical;
}
.mailbox-list {
  display: grid;
  gap: var(--spacing-sm);
}
.mail-thread {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
}
.mail-thread.unread {
  border-color: var(--color-paper-stamp-red);
}
.mail-thread__stamp {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-paper-stamp-red);
  color: var(--color-paper-stamp-red);
  border-radius: 50%;
  font-size: 12px;
}
.mail-thread h2 {
  font-size: var(--type-body-md-size);
  margin: 0;
}
.mail-thread p {
  color: var(--color-paper-muted);
  margin: 4px 0;
}
.mail-thread span,
.mailbox-empty {
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.mail-notice.success { color: var(--color-success); }
.mail-notice.error { color: var(--color-error); }
@media (max-width: 768px) {
  .mailbox-toolbar { overflow-x: auto; }
  .mail-thread { grid-template-columns: 1fr; }
}
</style>
