<template>
  <section class="message-wall-section">
    <h2 class="section-title display-sm">同学留言</h2>

    <div class="msg-form">
      <textarea v-model="newContent" class="text-input msg-textarea" placeholder="写下一段话，留作彼此的纪念…" maxlength="500" rows="3"></textarea>
      <div class="msg-form-footer">
        <span class="msg-char-count">{{ newContent.length }}/500</span>
        <button class="btn-primary btn-sm" @click="submitMessage" :disabled="submitting || !newContent.trim()">
          {{ submitting ? '提交中...' : '提交留言' }}
        </button>
      </div>
      <p v-if="submitResult" :class="'msg-result ' + submitResult.type">{{ submitResult.message }}</p>
    </div>

    <div v-if="loading" class="skeleton-messages">
      <div v-for="i in 3" :key="i" class="skeleton-msg">
        <div class="skeleton-line" style="width:60px;height:14px;border-radius:var(--rounded-sm);"></div>
        <div class="skeleton-line" style="width:100%;height:16px;margin-top:8px;border-radius:var(--rounded-sm);"></div>
        <div class="skeleton-line" style="width:80%;height:16px;margin-top:4px;border-radius:var(--rounded-sm);"></div>
      </div>
    </div>
    <div v-else-if="messages.length === 0" class="msg-empty">
      <p>暂无留言，成为第一个留言的人吧</p>
    </div>
    <div v-else class="msg-list">
      <div v-for="msg in messages" :key="msg.id" class="msg-item">
        <div class="msg-header">
          <span class="msg-author">{{ msg.authorName }}</span>
          <span class="msg-time">{{ formatDate(msg.createdAt) }}</span>
        </div>
        <p class="msg-content">{{ msg.content }}</p>

        <!-- 表情反应 -->
        <div class="msg-reactions">
          <button v-for="emoji in REACTIONS" :key="emoji" class="react-btn"
            :class="{ active: (msg.reactions?.[emoji] || 0) > 0 }"
            @click="react(msg.id, emoji)">
            {{ emoji }} <span v-if="msg.reactions?.[emoji]" class="react-count">{{ msg.reactions[emoji] }}</span>
          </button>
        </div>

        <!-- 主人回复 -->
        <div v-if="msg.reply" class="msg-reply">
          <span class="reply-label">主人回复：</span>
          <p>{{ msg.reply }}</p>
          <span class="msg-time">{{ formatDate(msg.replyAt) }}</span>
        </div>

        <!-- 回复输入框（仅主人可见） -->
        <div v-if="isPageOwner && !msg.reply" class="reply-form">
          <textarea v-model="replyTexts[msg.id]" class="text-input reply-textarea"
            placeholder="回复这条留言..." maxlength="500" rows="2" />
          <button class="btn-primary btn-sm" @click="submitReply(msg.id)"
            :disabled="!replyTexts[msg.id]?.trim()">
            回复
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSessionName } from '@alumni/shared'

interface Message {
  id: string; authorName: string; content: string; createdAt: string
  reactions: Record<string, number>; reply: string | null; replyAt: string | null
}

const props = defineProps<{ studentSlug: string; pageOwnerName?: string }>()

const messages = ref<Message[]>([])
const loading = ref(true)
const newContent = ref('')
const submitting = ref(false)
const submitResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const REACTIONS = ['❤️', '👍', '😂', '🎉']
const isPageOwner = getSessionName() === props.pageOwnerName
const replyTexts = ref<Record<string, string>>({})

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getAuthorName() {
  return sessionStorage.getItem('classmate_name') || ''
}

function formatDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function fetchMessages() {
  try {
    const res = await fetch(`${API_BASE}/api/messages/${props.studentSlug}`)
    const data = await res.json()
    if (data.success) messages.value = data.data || []
  } catch {} finally { loading.value = false }
}

async function submitMessage() {
  const author = getAuthorName()
  if (!author) {
    submitResult.value = { type: 'error', message: '请先在首页输入姓名' }
    return
  }
  if (!newContent.value.trim()) return

  submitting.value = true
  submitResult.value = null
  try {
    const res = await fetch(`${API_BASE}/api/messages/${props.studentSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName: author, content: newContent.value.trim() }),
    })
    const data = await res.json()
    if (data.success) {
      newContent.value = ''
      submitResult.value = { type: 'success', message: '留言已提交，等待审核后显示' }
    } else {
      submitResult.value = { type: 'error', message: data.message || '提交失败' }
    }
  } catch {
    submitResult.value = { type: 'error', message: '网络错误，请稍后重试' }
  } finally { submitting.value = false }
}

async function react(msgId: string, emoji: string) {
  try {
    const res = await fetch(`${API_BASE}/api/messages/${msgId}/react`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction: emoji }),
    })
    const data = await res.json()
    if (data.success) {
      const msg = messages.value.find(m => m.id === msgId)
      if (msg) msg.reactions = data.data.reactions
    }
  } catch {}
}

async function submitReply(msgId: string) {
  const text = replyTexts.value[msgId]?.trim()
  if (!text) return
  const author = getAuthorName()
  try {
    const res = await fetch(`${API_BASE}/api/messages/${msgId}/reply`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: text, authorName: author }),
    })
    const data = await res.json()
    if (data.success) {
      const msg = messages.value.find(m => m.id === msgId)
      if (msg) {
        msg.reply = text
        msg.replyAt = new Date().toISOString()
      }
      delete replyTexts.value[msgId]
    }
  } catch {}
}

onMounted(fetchMessages)
</script>

<style scoped>
.message-wall-section { margin-bottom: var(--spacing-section); }
.section-title {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-hairline);
}
.msg-form { margin-bottom: var(--spacing-xl); }
.msg-textarea {
  width: 100%;
  min-height: 80px;
  padding: var(--spacing-md);
  font-size: var(--type-body-md-size);
  font-family: var(--font-body);
  color: var(--color-ink);
  background-color: var(--color-canvas);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
  resize: vertical;
  outline: none;
}
.msg-textarea:focus { border-color: var(--color-primary); }
.msg-form-footer { display: flex; justify-content: space-between; align-items: center; margin-top: var(--spacing-xs); }
.msg-char-count { font-size: var(--type-caption-size); color: var(--color-muted); }
.msg-result { margin-top: var(--spacing-xs); font-size: var(--type-body-sm-size); }
.msg-result.success { color: var(--color-success); }
.msg-result.error { color: var(--color-error); }
.btn-sm { height: 32px; padding: 0 12px; font-size: 13px; }
.msg-loading, .msg-empty { text-align: center; padding: var(--spacing-xl); color: var(--color-muted); font-size: var(--type-body-sm-size); }
.msg-list { display: flex; flex-direction: column; }
.msg-item { padding: var(--spacing-md) 0; border-bottom: 1px solid var(--color-hairline-soft); }
.msg-header { display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs); }
.msg-author { font-weight: 500; font-size: var(--type-body-sm-size); color: var(--color-body-strong); }
.msg-time { font-size: var(--type-caption-size); color: var(--color-muted); }
.msg-content { font-size: var(--type-body-md-size); color: var(--color-body); line-height: 1.6; }
.skeleton-line {
  background: linear-gradient(90deg, var(--color-surface-cream-strong) 25%, var(--color-surface-card) 50%, var(--color-surface-cream-strong) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.skeleton-messages {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}
.skeleton-msg {
  padding: var(--spacing-md) 0;
  border-bottom: 1px solid var(--color-hairline);
}

/* Reactions */
.msg-reactions { display: flex; gap: 8px; margin-top: 10px; }
.react-btn {
  border: 1px solid var(--color-hairline); background: var(--color-canvas);
  border-radius: 20px; padding: 4px 12px; font-size: 14px; cursor: pointer;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}
.react-btn:hover { background: var(--color-surface-cream-strong); }
.react-btn.active { border-color: var(--color-primary); background: rgba(204,120,92,0.08); }
.react-count { font-size: 12px; color: var(--color-muted); margin-left: 2px; }

/* Reply */
.msg-reply {
  margin-top: 10px; padding: 10px 14px;
  background: var(--color-surface-cream-strong); border-radius: var(--rounded-md);
  border-left: 3px solid var(--color-primary);
}
.reply-label { font-size: 12px; color: var(--color-muted); display: block; margin-bottom: 4px; }
.reply-form { margin-top: 10px; display: flex; gap: 8px; align-items: flex-end; }
.reply-textarea { flex: 1; min-height: 36px; font-size: 13px; }
</style>
