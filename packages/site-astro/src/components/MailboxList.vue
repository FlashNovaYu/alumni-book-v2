<template>
  <div class="mailbox-list-container">
    <div v-if="loading" class="mailbox-loading">
      <div class="spinner"></div>
      <span>正在整理信箱...</span>
    </div>

    <div v-else-if="aggregatedItems.length === 0" class="mailbox-empty">
      暂时没有收到任何信件或通知。
    </div>

    <div v-else class="mailbox-items">
      <article
        v-for="item in aggregatedItems"
        :key="`${item.source}-${item.id}`"
        :class="[
          'mailbox-item',
          { unread: item.unread },
          { active: isSelected(item) }
        ]"
        @click="emit('select', item)"
      >
        <!-- 状态标签/邮戳 -->
        <div class="item-badge-wrapper">
          <span :class="['item-badge', item.source, item.threadType]">
            {{ getBadgeText(item) }}
          </span>
          <span v-if="item.unread" class="unread-dot"></span>
        </div>

        <!-- 内容区域 -->
        <div class="item-content">
          <div class="item-header">
            <h3 class="item-title">{{ item.title }}</h3>
            <span class="item-time">{{ formatDate(item.date) }}</span>
          </div>
          <p class="item-preview">{{ item.preview }}</p>
          <div class="item-meta">
            <span class="item-sender">来自: {{ item.senderName }}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NotificationItem, MailboxThread } from '@alumni/shared'

export interface AggregatedInboxItem {
  id: string
  source: 'notification' | 'mail'
  title: string
  preview: string
  unread: boolean
  senderName: string
  date: string
  threadType?: string
}

const props = defineProps<{
  notifications: NotificationItem[]
  mails: MailboxThread[]
  loading: boolean
  selectedItem: AggregatedInboxItem | null
}>()

const emit = defineEmits<{
  (e: 'select', item: AggregatedInboxItem): void
}>()

// 聚合通知与邮件，按时间倒序排列
const aggregatedItems = computed<AggregatedInboxItem[]>(() => {
  const list: AggregatedInboxItem[] = []

  // 处理通知
  props.notifications.forEach(n => {
    list.push({
      id: n.id,
      source: 'notification',
      title: n.title,
      preview: n.body,
      unread: !n.readAt,
      senderName: '系统通知',
      date: n.createdAt
    })
  })

  // 处理邮件
  props.mails.forEach(m => {
    list.push({
      id: m.id,
      source: 'mail',
      title: m.subject,
      preview: m.preview,
      unread: m.unread,
      senderName: m.senderName,
      date: m.updatedAt,
      threadType: m.threadType
    })
  })

  // 按时间降序排序
  return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

function isSelected(item: AggregatedInboxItem) {
  return (
    props.selectedItem &&
    props.selectedItem.id === item.id &&
    props.selectedItem.source === item.source
  )
}

function getBadgeText(item: AggregatedInboxItem) {
  if (item.source === 'notification') {
    return '通知'
  }
  if (item.threadType === 'system') {
    return '系统信'
  }
  if (item.threadType === 'admin') {
    return '管理信'
  }
  return '私人信'
}

function formatDate(value: string) {
  const date = new Date(value)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.mailbox-list-container {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.mailbox-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl) 0;
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

.mailbox-empty {
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-md);
  color: var(--color-paper-muted);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  font-size: var(--type-caption-size);
}

.mailbox-items {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.mailbox-item {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  position: relative;
  overflow: hidden;
}

.mailbox-item:hover {
  border-color: var(--color-paper-brown);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.mailbox-item.active {
  border-color: var(--color-paper-brown);
  background: rgba(139, 94, 60, 0.03);
}

/* 未读状态高亮 */
.mailbox-item.unread {
  border-left: 3px solid var(--color-paper-stamp-red);
  background: rgba(192, 41, 43, 0.01);
}

.mailbox-item.unread.active {
  background: rgba(139, 94, 60, 0.03);
}

.item-badge-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.item-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--rounded-sm, 4px);
  font-weight: 600;
  text-transform: uppercase;
}

/* 勋章颜色适配 */
.item-badge.notification {
  background: rgba(41, 128, 185, 0.1);
  color: #2980b9;
}

.item-badge.mail.system {
  background: rgba(39, 174, 96, 0.1);
  color: #27ae60;
}

.item-badge.mail.admin {
  background: rgba(142, 68, 173, 0.1);
  color: #8e44ad;
}

.item-badge.mail.private {
  background: rgba(139, 94, 60, 0.1);
  color: var(--color-paper-brown);
}

.unread-dot {
  width: 6px;
  height: 6px;
  background: var(--color-paper-stamp-red);
  border-radius: 50%;
}

.item-content {
  flex-grow: 1;
  min-width: 0; /* 允许文本截断 */
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-bottom: 4px;
}

.item-title {
  font-size: var(--type-body-md-size);
  font-weight: 600;
  color: var(--color-paper-ink);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-time {
  font-size: 11px;
  color: var(--color-paper-muted);
  flex-shrink: 0;
}

.item-preview {
  font-size: var(--type-caption-size);
  color: var(--color-paper-muted);
  margin: 4px 0 6px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.item-meta {
  display: flex;
  font-size: 11px;
  color: var(--color-paper-muted);
}

.item-sender {
  font-style: italic;
}
</style>
