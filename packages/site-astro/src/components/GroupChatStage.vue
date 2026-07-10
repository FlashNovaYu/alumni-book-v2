<template>
  <div class="group-chat-stage">
    <!-- 连接状态指示器 -->
    <div class="stage-header">
      <div class="header-left">
        <span class="header-emoji">💬</span>
        <h3 class="header-title">同学群聊</h3>
      </div>
      <div class="connection-status" :class="connectionState">
        <span class="status-dot"></span>
        <span class="status-text">
          {{ connectionState === 'connected' ? '已连接' : (connectionState === 'connecting' ? '同步中...' : '网络异常') }}
        </span>
      </div>
    </div>

    <!-- 滚动容器区 -->
    <div class="messages-viewport-container">
      <div 
        ref="scrollContainer" 
        class="messages-scroll-area"
        @scroll="handleScroll"
      >
        <!-- 历史加载中 Loading -->
        <div v-if="isFetchingOlder" class="history-loading">
          <span class="spinner"></span>
          <span>加载历史消息...</span>
        </div>

        <!-- 聊天消息流 -->
        <div class="messages-list">
          <GroupChatMessage
            v-for="item in items"
            :key="item.id"
            :message="item"
            :my-slug="mySlug"
            :aria-live="ariaLive"
            @retry="retry"
            @react="react"
            @recall="recall"
          />
        </div>
      </div>

      <!-- 有新消息悬浮浮标 -->
      <transition name="fade">
        <button
          v-if="newMessageCount > 0"
          class="new-messages-floating-badge"
          title="点击滚动到最新消息"
          aria-label="查看新消息"
          @click="scrollToBottom"
        >
          👇 有 {{ newMessageCount }} 条新消息
        </button>
      </transition>
    </div>

    <!-- 发送框 -->
    <GroupChatComposer
      :mute="mute"
      :sending="sending"
      @send="handleSend"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useGroupChat } from '../composables/useGroupChat'
import { useVisibilityPolling } from '../composables/useVisibilityPolling'
import GroupChatMessage from './GroupChatMessage.vue'
import GroupChatComposer from './GroupChatComposer.vue'
import type { GroupChatMessage as IGroupChatMessage } from '@alumni/shared'

const props = defineProps<{
  apiBase: string
  initialItems: IGroupChatMessage[]
  initialCursor: string
  initialMute: { reason: string; mutedUntil: string | null } | null
  mySlug: string
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const sending = ref(false)
const ariaLive = ref<'polite' | 'off'>('off')

const {
  items,
  mute,
  connectionState,
  newMessageCount,
  isFetchingOlder,
  send,
  retry,
  loadOlder,
  syncNow,
  setNearBottom,
  consumeNewMessages,
  react,
  recall
} = useGroupChat(props.apiBase, props.initialItems, props.initialCursor, props.initialMute)

// 可见性智能轮询，10 秒同步一次消息
useVisibilityPolling(props.apiBase, 10000, async () => {
  await syncNow()
})

function handleScroll() {
  const container = scrollContainer.value
  if (!container) return

  // 距离底部 60px 内认为接近底部
  const isNear = container.scrollHeight - container.scrollTop - container.clientHeight < 60
  setNearBottom(isNear)

  // 滚动到顶部拉取历史
  if (container.scrollTop <= 5 && !isFetchingOlder.value) {
    fetchHistory()
  }
}

async function fetchHistory() {
  const container = scrollContainer.value
  if (!container) return

  const oldHeight = container.scrollHeight
  const oldScrollTop = container.scrollTop

  await loadOlder()

  // 保持滚动锚点，防画面抖动
  nextTick(() => {
    const newHeight = container.scrollHeight
    container.scrollTop = oldScrollTop + (newHeight - oldHeight)
  })
}

async function handleSend(body: string) {
  sending.value = true
  try {
    await send(body)
    scrollToBottom()
  } finally {
    sending.value = false
  }
}

function scrollToBottom() {
  nextTick(() => {
    const container = scrollContainer.value
    if (container) {
      container.scrollTop = container.scrollHeight - container.clientHeight
    }
    consumeNewMessages()
  })
}

onMounted(() => {
  scrollToBottom()
  // 1.5秒后激活无障碍推送，消除初始列表批量读屏的噪音
  setTimeout(() => {
    ariaLive.value = 'polite'
  }, 1500)
})
</script>

<style scoped>
.group-chat-stage {
  border: 1px solid var(--color-paper-border, #eedec4);
  background: var(--color-paper-card, #fcfaf2);
  border-radius: var(--rounded-lg, 12px);
  box-shadow: var(--shadow-paper-card, 0 4px 12px rgba(139,120,95,0.06));
  display: flex;
  flex-direction: column;
  height: 600px;
  overflow: hidden;
}

.stage-header {
  height: 52px;
  padding: 0 var(--spacing-md, 16px);
  border-bottom: 1px solid var(--color-paper-border, #eedec4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-surface-cream, #fbfaf7);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-emoji {
  font-size: 18px;
}

.header-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-paper-ink, #4a3e3d);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  transition: background-color var(--duration-fast) ease;
}

.connection-status.connected .status-dot {
  background-color: var(--color-success, #48bb78);
}

.connection-status.connecting .status-dot {
  background-color: var(--color-paper-brown, #b8903a);
  animation: pulse 1s infinite alternate;
}

.connection-status.disconnected .status-dot {
  background-color: var(--color-error, #f56565);
}

.status-text {
  color: var(--color-paper-muted, #8b785f);
}

/* 视口容器 */
.messages-viewport-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #fff;
}

.messages-scroll-area {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  padding: var(--spacing-md, 16px) 0;
  display: flex;
  flex-direction: column;
}

.messages-list {
  display: flex;
  flex-direction: column;
}

/* 历史 Loading */
.history-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--spacing-sm, 10px) 0;
  font-size: 12px;
  color: var(--color-paper-muted, #8b785f);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(0,0,0,0.1);
  border-top-color: var(--color-paper-brown);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* 新消息浮标 */
.new-messages-floating-badge {
  position: absolute;
  bottom: var(--spacing-md, 16px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-paper-brown, #b8903a);
  color: #fff;
  border: none;
  border-radius: 9999px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(184, 144, 58, 0.25);
  transition: background-color var(--duration-fast) ease;
  z-index: 10;
}

.new-messages-floating-badge:hover {
  background: #a37c2f;
}

/* 动画 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}

@keyframes pulse {
  from { opacity: 0.5; }
  to { opacity: 1; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
