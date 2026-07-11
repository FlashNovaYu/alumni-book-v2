<template>
  <section class="mailbox-app">
    <!-- 工具栏/模式切换 -->
    <div class="mailbox-toolbar">
      <button :class="{ active: mode === 'inbox' }" @click="switchMode('inbox')">
        收件箱
      </button>
      <button :class="{ active: mode === 'compose' }" @click="switchMode('compose')">
        写信
      </button>
    </div>

    <p v-if="loadError" class="mailbox-load-error" role="alert">{{ loadError }}</p>

    <!-- 写信模式 -->
    <div v-if="mode === 'compose'" class="compose-container">
      <MailComposer
        ref="composerRef"
        :api-base="apiBase"
        :sending="sending"
        :notice="notice"
        :default-recipient-slug="defaultRecipient"
        @submit="handleSendMail"
      />
    </div>

    <!-- 收件箱模式（左右布局或单栏响应式切换） -->
    <div v-else class="mailbox-layout" :class="{ 'has-selection': selectedItem }">
      <!-- 左侧列表栏 -->
      <div class="mailbox-list-pane">
        <MailboxList
          v-if="!loadError"
          :notifications="notifications"
          :mails="mails"
          :loading="loading"
          :selected-item="selectedItem"
          @select="handleSelectItem"
        />
      </div>

      <!-- 右侧详情栏 -->
      <div class="mailbox-detail-pane">
        <!-- 移动端返回按钮 -->
        <div v-if="selectedItem" class="mobile-detail-header">
          <button type="button" class="btn-back-link" @click="selectedItem = null">
            ← 返回信箱
          </button>
        </div>
        <MailboxDetail
          :item="selectedItem"
          :api-base="apiBase"
          @read="handleItemRead"
          @replied="handleReplied"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import MailboxList, { type AggregatedInboxItem } from './MailboxList.vue'
import MailboxDetail from './MailboxDetail.vue'
import MailComposer from './MailComposer.vue'
import { fetchMailboxThreads, fetchNotifications, sendMailboxThread } from '../api/postOffice'
import type { NotificationItem, MailboxThread } from '@alumni/shared'

const props = defineProps<{
  apiBase: string
  defaultRecipient?: string
}>()

const mode = ref<'inbox' | 'compose'>(props.defaultRecipient ? 'compose' : 'inbox')
const loading = ref(false)
const sending = ref(false)
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const mails = ref<MailboxThread[]>([])
const notifications = ref<NotificationItem[]>([])
const selectedItem = ref<AggregatedInboxItem | null>(null)
const composerRef = ref<InstanceType<typeof MailComposer> | null>(null)
const loadError = ref<string | null>(null)

// 广播自定义事件通知更新未读数
function broadcastInboxChanged() {
  const event = new CustomEvent('alumni:inbox-changed')
  window.dispatchEvent(event)
}

// 切换收发件模式
function switchMode(newMode: 'inbox' | 'compose') {
  mode.value = newMode
  notice.value = null
  if (newMode === 'inbox') {
    selectedItem.value = null
    loadData()
  }
}

// 并行加载通知与邮件列表
async function loadData() {
  loading.value = true
  loadError.value = null
  try {
    const [threadsRes, notifRes] = await Promise.all([
      fetchMailboxThreads(props.apiBase),
      fetchNotifications(props.apiBase)
    ])
    if (threadsRes.success) {
      mails.value = threadsRes.data?.items || []
    }
    notifications.value = notifRes.items || []
  } catch (err) {
    console.error('加载信箱数据失败', err)
    loadError.value = err instanceof Error ? err.message : '加载信箱数据失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function handleSelectItem(item: AggregatedInboxItem) {
  selectedItem.value = item
}

// 处理已读更新状态
function handleItemRead(item: AggregatedInboxItem) {
  if (item.source === 'mail') {
    const found = mails.value.find(m => m.id === item.id)
    if (found && found.unread) {
      found.unread = false
      broadcastInboxChanged()
    }
  } else if (item.source === 'notification') {
    const found = notifications.value.find(n => n.id === item.id)
    if (found && !found.readAt) {
      found.readAt = new Date().toISOString()
      broadcastInboxChanged()
    }
  }
}

// 回复成功，触发广播
function handleReplied() {
  broadcastInboxChanged()
}

// 新建邮件发送
async function handleSendMail(payload: { recipientSlug: string; subject: string; body: string }) {
  sending.value = true
  notice.value = null
  try {
    const data = await sendMailboxThread(props.apiBase, payload)
    if (data.success) {
      notice.value = { type: 'success', text: '信件已寄出' }
      if (composerRef.value) {
        composerRef.value.reset()
      }
      
      // 发送成功后重新加载数据并广播通知
      await loadData()
      broadcastInboxChanged()
      
      // 成功寄出后延时切回列表
      setTimeout(() => {
        mode.value = 'inbox'
        selectedItem.value = null
        notice.value = null
      }, 1000)
    } else {
      notice.value = { type: 'error', text: data.message || '发送失败' }
    }
  } catch (err) {
    notice.value = { type: 'error', text: err instanceof Error ? err.message : '网络错误，请稍后重试' }
  } finally {
    sending.value = false
  }
}

onMounted(loadData)
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
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.mailbox-toolbar button.active {
  border-color: var(--color-paper-brown);
  color: var(--color-paper-brown);
  background: rgba(139, 94, 60, 0.05);
}

.mailbox-load-error {
  margin: 0;
  color: var(--color-error, #c53030);
  font-weight: 600;
}

.compose-container {
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

/* 左右分栏布局 */
.mailbox-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: var(--spacing-lg);
  align-items: start;
}

.mailbox-list-pane {
  min-width: 0;
}

.mailbox-detail-pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.mobile-detail-header {
  display: none;
}

.btn-back-link {
  background: none;
  border: none;
  color: var(--color-paper-brown);
  font-weight: 600;
  cursor: pointer;
  padding: var(--spacing-xs) 0;
  font-size: var(--type-body-md-size);
}

@media (max-width: 992px) {
  .mailbox-layout {
    grid-template-columns: 320px 1fr;
  }
}

/* 移动端响应式布局 */
@media (max-width: 768px) {
  .mailbox-layout {
    grid-template-columns: 1fr;
  }
  
  .mailbox-layout .mailbox-detail-pane {
    display: none;
  }
  
  .mailbox-layout.has-selection .mailbox-list-pane {
    display: none;
  }
  
  .mailbox-layout.has-selection .mailbox-detail-pane {
    display: flex;
  }
  
  .mobile-detail-header {
    display: block;
    margin-bottom: var(--spacing-sm);
  }
}
</style>
