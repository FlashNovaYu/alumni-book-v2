<template>
  <section ref="messageWallRoot" class="message-wall-section">
    <h2 class="section-title display-sm">祝福贴纸墙</h2>


    <div class="msg-form">
      <textarea
        v-model="newContent"
        class="text-input msg-textarea"
        :class="'style-preview-' + selectedCardStyle"
        placeholder="把这句话贴进 TA 的青春档案里…"
        aria-label="留言内容"
        maxlength="500"
        rows="3"
      ></textarea>
      
      <!-- 贴纸款式选择器 -->
      <div class="msg-style-selector">
        <span class="style-label">贴纸款式：</span>
        <button class="style-select-btn" :class="{ active: selectedCardStyle === 'paper' }" @click="selectedCardStyle = 'paper'">复古胶带</button>
        <button class="style-select-btn" :class="{ active: selectedCardStyle === 'chalkboard' }" @click="selectedCardStyle = 'chalkboard'">黑板贴纸</button>
        <button class="style-select-btn" :class="{ active: selectedCardStyle === 'photoback' }" @click="selectedCardStyle = 'photoback'">拍立得贴纸</button>
        <button class="style-select-btn" :class="{ active: selectedCardStyle === 'letter' }" @click="selectedCardStyle = 'letter'">横格便签</button>
      </div>

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
      <div
        v-for="(msg, idx) in messages"
        :key="msg.id"
        class="msg-item fade-in-msg museum-motion-soft"
        :class="'style-' + (msg.cardStyle || 'paper')"
        :style="{ animationDelay: `${Math.min(idx * 0.05, 1.2)}s` }"
      >
        <div v-if="msg.pinned" class="pinned-badge" aria-label="置顶留言">置顶贴纸</div>
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
import { ref, onMounted, computed } from 'vue'
import { getSessionName, getClassmateToken, getClassmateStudent } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'
import { handleClassmateUnauthorized, SESSION_EXPIRED_MESSAGE } from '../api/classmateSession'

interface Message {
  id: string; authorName: string; content: string; createdAt: string
  reactions: Record<string, number>; reply: string | null; replyAt: string | null
  cardStyle?: string; pinned?: boolean
}

const props = defineProps<{ studentSlug: string; pageOwnerName?: string; apiBase: string }>()

const messages = ref<Message[]>([])
const loading = ref(true)
const newContent = ref('')
const selectedCardStyle = ref('paper')
const submitting = ref(false)
const submitResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const REACTIONS = ['❤️', '👍', '😂', '🎉']
const isPageOwner = computed(() => {
  const student = getClassmateStudent<{ name: string }>()
  return student?.name === props.pageOwnerName
})
const replyTexts = ref<Record<string, string>>({})
const reactingKeys = ref(new Set<string>())

function getAuthorName() {
  const student = getClassmateStudent<{ name: string }>()
  return student?.name || getSessionName() || ''
}

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function fetchMessages() {
  try {
    const url = joinApiUrl(props.apiBase, `/api/messages/${props.studentSlug}`)
    const res = await fetch(url)
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
    const url = joinApiUrl(props.apiBase, `/api/messages/${props.studentSlug}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        authorName: author, 
        content: newContent.value.trim(),
        cardStyle: selectedCardStyle.value
      }),
    })
    const data = await res.json()
    if (data.success) {
      newContent.value = ''
      selectedCardStyle.value = 'paper'
      submitResult.value = { type: 'success', message: '留言已提交，等待审核后显示' }
    } else {
      submitResult.value = { type: 'error', message: data.message || '提交失败' }
    }
  } catch {
    submitResult.value = { type: 'error', message: '网络错误，请稍后重试' }
  } finally { submitting.value = false }
}

async function react(msgId: string, emoji: string) {
  const key = `${msgId}_${emoji}`
  if (reactingKeys.value.has(key)) return
  reactingKeys.value.add(key)
  try {
    const tokenVal = await ensureClassmateToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (tokenVal) headers['X-Classmate-Token'] = tokenVal

    const url = joinApiUrl(props.apiBase, `/api/messages/${msgId}/react`)
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ reaction: emoji }),
    })
    const data = await res.json()
    if (data.success) {
      const msg = messages.value.find(m => m.id === msgId)
      if (msg) msg.reactions = data.data.reactions
    } else {
      if (data.message) alert(data.message)
    }
  } catch {} finally {
    reactingKeys.value.delete(key)
  }
}

async function ensureClassmateToken(): Promise<string | null> {
  return getClassmateToken()
}

async function submitReply(msgId: string) {
  const text = replyTexts.value[msgId]?.trim()
  if (!text) return
  
  const tokenVal = await ensureClassmateToken()
  if (!tokenVal) {
    alert('身份校验失败，无法回复留言')
    return
  }

  try {
    const url = joinApiUrl(props.apiBase, `/api/messages/${msgId}/reply`)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'X-Classmate-Token': tokenVal,
      },
      body: JSON.stringify({ reply: text }),
    })
    if (res.status === 401) handleClassmateUnauthorized()
    const data = await res.json()
    if (data.success) {
      const msg = messages.value.find(m => m.id === msgId)
      if (msg) {
        msg.reply = text
        msg.replyAt = new Date().toISOString()
      }
      delete replyTexts.value[msgId]
    } else {
      alert(data.message || '回复失败')
    }
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
      alert(SESSION_EXPIRED_MESSAGE)
      return
    }
    alert('网络错误，请稍后重试')
  }
}

onMounted(async () => {
  await fetchMessages()
})
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
.msg-reactions { display: flex; gap: var(--spacing-xs); margin-top: var(--spacing-xs); }
.react-btn {
  border: 1px solid var(--color-hairline); background: var(--color-canvas);
  border-radius: var(--rounded-pill); padding: 4px var(--spacing-sm); font-size: 14px; cursor: pointer;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}
.react-btn:hover { background: var(--color-surface-cream-strong); }
.react-btn.active { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.react-count { font-size: 12px; color: var(--color-muted); margin-left: 2px; }

/* Reply */
.msg-reply {
  margin-top: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-surface-cream-strong); border-radius: var(--rounded-md);
  border-left: 3px solid var(--color-primary);
}
.reply-label { font-size: 12px; color: var(--color-muted); display: block; margin-bottom: var(--spacing-xxs); }
.reply-form { margin-top: var(--spacing-xs); display: flex; gap: var(--spacing-xs); align-items: flex-end; }
.reply-textarea { flex: 1; min-height: 36px; font-size: 13px; }

/* Pinned badge */
.pinned-badge {
  display: inline-block;
  font-size: 11px;
  background-color: color-mix(in srgb, var(--color-warning) 16%, var(--bg-surface));
  color: var(--color-warning);
  padding: 2px var(--spacing-xs);
  border-radius: var(--rounded-sm);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

/* Style Selector */
.msg-style-selector {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
  flex-wrap: wrap;
}
.style-label {
  font-size: 12px;
  color: var(--color-muted);
}
.style-select-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid var(--color-hairline);
  background-color: var(--color-canvas);
  border-radius: var(--rounded-sm);
  cursor: pointer;
  transition: all var(--duration-fast);
}
.style-select-btn.active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--text-inverse);
}

/* Card skin styles */
.msg-item {
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-lg) !important;
  border-radius: var(--rounded-md);
  transition: transform var(--duration-fast), box-shadow var(--duration-fast);
}
.msg-item:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
  z-index: 10;
}

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
.style-chalkboard .msg-author,
.style-chalkboard .msg-time,
.style-chalkboard .msg-content,
.style-chalkboard .reply-label {
  color: #e0f2f1;
}
.style-photoback {
  background: var(--bg-surface);
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
.style-letter .msg-content {
  line-height: 28px !important;
}

/* Preview class in forms */
.msg-textarea.style-preview-paper {
  background: #fcfaf2;
  color: #4a3e3d;
}
.msg-textarea.style-preview-chalkboard {
  background: #1e2d2f;
  color: #f5f5f5;
}
.msg-textarea.style-preview-photoback {
  background: var(--bg-surface);
  color: #212121;
}
.msg-textarea.style-preview-letter {
  background: #faf6f0;
  background-image: repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 27px, #e0d4c9 28px);
  line-height: 28px;
  color: #3e2723;
}

/* Dark mode overrides for card skins */
:global(html[data-theme='night']) .style-paper,
:global(html[data-theme='night']) .msg-textarea.style-preview-paper {
  background: #2c2724;
  border-color: #4a3e35;
  color: #d1c7bd;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

:global(html[data-theme='night']) .style-photoback,
:global(html[data-theme='night']) .msg-textarea.style-preview-photoback {
  background: #242424;
  border-color: #383838;
  color: #d4d4d4;
  box-shadow: 0 8px 20px rgba(0,0,0,0.3);
}

:global(html[data-theme='night']) .style-letter,
:global(html[data-theme='night']) .msg-textarea.style-preview-letter {
  background: #2a2522;
  background-image: repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 27px, #403630 28px);
  border-color: #403630;
  color: #d1c5bb;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

:global(html[data-theme='night']) .style-chalkboard {
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.fade-in-msg {
  opacity: 0;
  animation: msgFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes msgFadeIn {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .msg-style-selector {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: var(--spacing-xxs);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .msg-style-selector::-webkit-scrollbar {
    display: none;
  }

  .style-select-btn {
    flex: 0 0 auto;
  }

  .msg-item,
  .msg-item:nth-child(even),
  .msg-item:nth-child(odd),
  .msg-item:hover {
    transform: none !important;
  }

  .msg-item:hover {
    box-shadow: var(--shadow-paper-card) !important;
  }

  .reply-form {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fade-in-msg {
    opacity: 1 !important;
    transform: rotate(0deg) !important;
    animation: none !important;
  }
  .msg-item, .msg-item:nth-child(even), .msg-item:nth-child(odd) {
    transform: none !important;
    transition: none !important;
  }
  .msg-item:hover {
    transform: none !important;
    box-shadow: none !important;
  }
}
</style>
