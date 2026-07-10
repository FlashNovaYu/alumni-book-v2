<template>
  <div class="mailbox-detail-container">
    <!-- 未选择状态 -->
    <div v-if="!item" class="detail-placeholder">
      <div class="placeholder-icon">✉️</div>
      <p>请在左侧选择一封信件或通知查看详情</p>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="loading" class="detail-loading">
      <div class="spinner"></div>
      <span>正在装载信件详情...</span>
    </div>

    <!-- 详情内容展示 -->
    <div v-else class="detail-content">
      <!-- 头部：标题与发布时间 -->
      <header class="detail-header">
        <h2 class="detail-title">{{ displayTitle }}</h2>
        <div class="detail-subtitle">
          <span class="detail-sender">来自: {{ displaySender }}</span>
          <span class="detail-time">{{ formatDate(displayDate) }}</span>
        </div>
      </header>

      <!-- 消息会话线索（仅邮件且有消息时展示） -->
      <div v-if="item.source === 'mail' && threadDetail" class="detail-messages" ref="messageBox">
        <div
          v-for="msg in threadDetail.messages"
          :key="msg.id"
          :class="['message-bubble-wrapper', { 'mine': isMyMessage(msg) }]"
        >
          <div class="message-sender-info">
            <span class="sender-name">{{ msg.senderName }}</span>
            <span class="message-time">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <div class="message-bubble">
            <p class="message-body">{{ msg.body }}</p>
          </div>
        </div>
      </div>

      <!-- 单一正文展示（通知时展示） -->
      <div v-else-if="item.source === 'notification'" class="detail-body-single">
        <p class="notification-body">{{ item.preview }}</p>
      </div>

      <!-- 回复框（只在邮件且允许回复时显示） -->
      <footer v-if="item.source === 'mail' && threadDetail?.thread.allowReply" class="detail-reply-section">
        <form @submit.prevent="sendReply" class="reply-form">
          <textarea
            v-model="replyText"
            class="reply-textarea"
            placeholder="写下你的回复..."
            maxlength="2000"
            required
            :disabled="replying"
          />
          <div class="reply-actions">
            <button
              type="submit"
              class="btn-reply-submit"
              :disabled="replying || !replyText.trim()"
            >
              {{ replying ? '发送中...' : '发送回复' }}
            </button>
          </div>
        </form>
        <p v-if="replyError" class="reply-error">{{ replyError }}</p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { fetchMailboxThread, replyMailboxThread, markNotificationRead } from '../api/postOffice'
import type { AggregatedInboxItem } from './MailboxList.vue'
import type { MailboxThreadDetail, MailboxMessage } from '@alumni/shared'

const props = defineProps<{
  item: AggregatedInboxItem | null
  apiBase: string
}>()

const emit = defineEmits<{
  (e: 'read', item: AggregatedInboxItem): void
  (e: 'replied'): void
}>()

const loading = ref(false)
const replying = ref(false)
const replyText = ref('')
const replyError = ref<string | null>(null)
const threadDetail = ref<MailboxThreadDetail | null>(null)
const messageBox = ref<HTMLDivElement | null>(null)

// 从 sessionStorage 获取当前登录同学的 slug
const mySlug = computed(() => {
  try {
    const studentStr = sessionStorage.getItem('classmate_account_student')
    if (studentStr) {
      const student = JSON.parse(studentStr)
      return student.slug || ''
    }
  } catch (e) {
    console.error('获取登录同学信息失败', e)
  }
  return ''
})

const displayTitle = computed(() => {
  if (!props.item) return ''
  return props.item.title
})

const displaySender = computed(() => {
  if (!props.item) return ''
  return props.item.senderName
})

const displayDate = computed(() => {
  if (!props.item) return ''
  return props.item.date
})

function isMyMessage(msg: MailboxMessage) {
  // 检查发送者类型和 slug 是否是当前用户
  if (msg.senderType === 'student' && msg.senderSlug && mySlug.value) {
    return msg.senderSlug === mySlug.value
  }
  return false
}

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messageBox.value) {
      messageBox.value.scrollTop = messageBox.value.scrollHeight
    }
  })
}

// 加载信件详情
async function loadMailDetail() {
  if (!props.item || props.item.source !== 'mail') return
  loading.value = true
  try {
    const detail = await fetchMailboxThread(props.apiBase, props.item.id)
    threadDetail.value = detail
    scrollToBottom()
    
    // 如果加载的信件未读，则触发已读通知事件（后端在加载详情时会自动标记已读，但需要更新前台的未读数）
    if (props.item.unread) {
      emit('read', props.item)
    }
  } catch (err) {
    console.error('加载邮件详情失败', err)
  } finally {
    loading.value = false
  }
}

// 处理通知的已读动作
async function handleNotificationRead() {
  if (!props.item || props.item.source !== 'notification') return
  
  // 如果通知是未读的，调用接口标记为已读
  if (props.item.unread) {
    try {
      await markNotificationRead(props.apiBase, props.item.id)
      emit('read', props.item)
    } catch (err) {
      console.error('标记通知已读失败', err)
    }
  }
}

// 发送回复
async function sendReply() {
  if (!props.item || props.item.source !== 'mail' || !replyText.value.trim() || replying.value) return
  
  replying.value = true
  replyError.value = null
  try {
    await replyMailboxThread(props.apiBase, props.item.id, replyText.value.trim())
    replyText.value = ''
    
    // 成功后重新加载详情，并触发回复成功事件以更新未读计数和刷新列表
    await loadMailDetail()
    emit('replied')
  } catch (err: any) {
    replyError.value = err.message || '回复发送失败，请稍后重试'
  } finally {
    replying.value = false
  }
}

watch(
  () => props.item,
  async (newItem) => {
    threadDetail.value = null
    replyText.value = ''
    replyError.value = null
    if (newItem) {
      if (newItem.source === 'mail') {
        await loadMailDetail()
      } else if (newItem.source === 'notification') {
        await handleNotificationRead()
      }
    }
  },
  { immediate: true }
)

function formatDate(value: string) {
  const date = new Date(value)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatTime(value: string) {
  const date = new Date(value)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.mailbox-detail-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 400px;
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  overflow: hidden;
}

.detail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
  color: var(--color-paper-muted);
  padding: var(--spacing-xl);
  text-align: center;
}

.placeholder-icon {
  font-size: 48px;
  margin-bottom: var(--spacing-md);
  opacity: 0.5;
}

.detail-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
  color: var(--color-paper-muted);
  gap: var(--spacing-sm);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-paper-border);
  border-top-color: var(--color-paper-brown);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.detail-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 600px;
}

.detail-header {
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-paper-border);
  background: rgba(139, 94, 60, 0.02);
}

.detail-title {
  margin: 0 0 6px 0;
  font-size: var(--type-body-lg-size, 1.2rem);
  font-weight: 700;
  color: var(--color-paper-ink);
}

.detail-subtitle {
  display: flex;
  justify-content: space-between;
  font-size: var(--type-caption-size);
  color: var(--color-paper-muted);
}

/* 消息会话区 */
.detail-messages {
  flex-grow: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  background: rgba(247, 245, 240, 0.5);
  max-height: 380px;
}

.message-bubble-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 85%;
}

.message-bubble-wrapper.mine {
  align-self: flex-end;
  align-items: flex-end;
}

.message-sender-info {
  display: flex;
  gap: var(--spacing-sm);
  font-size: 11px;
  color: var(--color-paper-muted);
  margin-bottom: 4px;
  padding: 0 4px;
}

.message-bubble {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.message-bubble-wrapper.mine .message-bubble {
  background: rgba(139, 94, 60, 0.1);
  border-color: rgba(139, 94, 60, 0.2);
}

.message-body {
  margin: 0;
  font-size: var(--type-body-md-size);
  color: var(--color-paper-ink);
  white-space: pre-wrap;
  line-height: 1.5;
  word-break: break-all;
}

/* 单一文本展示区 */
.detail-body-single {
  flex-grow: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  background: var(--color-paper-card);
}

.notification-body {
  font-size: var(--type-body-md-size);
  color: var(--color-paper-ink);
  white-space: pre-wrap;
  line-height: 1.6;
}

/* 回复部分 */
.detail-reply-section {
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-paper-border);
  background: var(--color-paper-card);
}

.reply-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.reply-textarea {
  width: 100%;
  min-height: 80px;
  max-height: 120px;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  color: var(--color-paper-ink);
  padding: var(--spacing-sm);
  font: inherit;
  resize: vertical;
}

.reply-textarea:focus {
  outline: none;
  border-color: var(--color-paper-brown);
}

.reply-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-reply-submit {
  min-height: 36px;
  padding: 0 var(--spacing-md);
  border: none;
  border-radius: var(--rounded-pill);
  background: var(--color-paper-brown);
  color: var(--color-paper-card);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-reply-submit:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-reply-submit:disabled {
  background: var(--color-paper-border);
  color: var(--color-paper-muted);
  cursor: not-allowed;
}

.reply-error {
  margin: 4px 0 0 0;
  font-size: var(--type-caption-size);
  color: var(--color-error);
}
</style>
