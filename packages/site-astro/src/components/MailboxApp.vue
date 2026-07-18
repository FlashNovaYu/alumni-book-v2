<template>
  <section class="mailbox-app" aria-label="班级信箱">
    <!-- Header -->
    <header class="mailbox-header">
      <div class="mailbox-header__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        <span>班级信箱</span>
      </div>
      <div class="mailbox-tabs" role="tablist" aria-label="班级信箱内容">
        <button
          ref="directTab"
          id="inbox-tab-direct"
          type="button"
          role="tab"
          :tabindex="mode === 'direct' ? 0 : -1"
          :aria-selected="mode === 'direct'"
          aria-controls="inbox-panel"
          :class="['mailbox-tab', { 'mailbox-tab--active': mode === 'direct' }]"
          @click="mode = 'direct'"
          @keydown="handleTabKey"
        >
          私聊
          <span v-if="unread.directUnread" class="mailbox-tab__badge">{{ unread.directUnread }}</span>
        </button>
        <button
          ref="notificationTab"
          id="inbox-tab-notification"
          type="button"
          role="tab"
          :tabindex="mode === 'notifications' ? 0 : -1"
          :aria-selected="mode === 'notifications'"
          aria-controls="inbox-panel"
          :class="['mailbox-tab', { 'mailbox-tab--active': mode === 'notifications' }]"
          @click="mode = 'notifications'"
          @keydown="handleTabKey"
        >
          通知
          <span v-if="unread.notificationUnread" class="mailbox-tab__badge">{{ unread.notificationUnread }}</span>
        </button>
      </div>
    </header>

    <!-- Error -->
    <p v-if="error" class="mailbox-error" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {{ error }}
    </p>

    <!-- Workspace -->
    <div
      id="inbox-panel"
      class="mailbox-workspace"
      :class="{ 'has-detail': detailOpen }"
      role="tabpanel"
      :aria-labelledby="mode === 'direct' ? 'inbox-tab-direct' : 'inbox-tab-notification'"
    >
      <!-- Sidebar -->
      <aside class="mailbox-sidebar">
        <DirectConversationList
          v-if="mode === 'direct'"
          :items="conversations"
          :selected-id="selectedConversation?.id"
          :api-base="apiBase"
          @select="openConversation"
          @new="newConversationOpen = true"
        />
        <NotificationList
          v-else
          :items="notifications"
          :selected-id="selectedNotification?.id"
          @select="openNotification"
        />
      </aside>

      <!-- Detail -->
      <div class="mailbox-detail-pane" :aria-busy="loading">
        <button v-if="detailOpen" type="button" class="mobile-detail-back" @click="closeDetail">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回信箱
        </button>
        <DirectConversationView
          v-if="mode === 'direct'"
          :peer="selectedPeer"
          :messages="messages"
          :current-slug="currentSlug"
          :sending="sending"
          :connection-state="connectionState"
          @send="send"
          @retry="retry"
        />
        <NotificationDetail v-else :notification="selectedNotification" />
      </div>
    </div>

    <!-- New Conversation Dialog -->
    <NewConversationDialog :open="newConversationOpen" :api-base="apiBase" @close="newConversationOpen = false" @choose="chooseRecipient" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getClassmateStudent } from '@alumni/shared'
import type { DirectConversation, NotificationItem } from '@alumni/shared'
import { fetchInboxClassmates } from '../api/inbox'
import { useInbox } from '../composables/useInbox'
import DirectConversationList from './DirectConversationList.vue'
import DirectConversationView from './DirectConversationView.vue'
import NewConversationDialog from './NewConversationDialog.vue'
import NotificationDetail from './NotificationDetail.vue'
import NotificationList from './NotificationList.vue'

const props = defineProps<{ apiBase: string; defaultRecipient?: string }>()
const newConversationOpen = ref(false)
const directTab = ref<HTMLButtonElement | null>(null)
const notificationTab = ref<HTMLButtonElement | null>(null)
const currentSlug = getClassmateStudent<{ slug: string }>()?.slug || ''

const {
  mode,
  conversations,
  notifications,
  selectedConversation,
  selectedNotification,
  selectedPeer,
  messages,
  unread,
  loading,
  sending,
  connectionState,
  error,
  loadInitial,
  selectConversation,
  selectNotification,
  startConversation,
  clearSelection,
  send,
  retry,
} = useInbox(props.apiBase)

const detailOpen = computed(() => Boolean(selectedConversation.value || selectedNotification.value || selectedPeer.value))

async function chooseRecipient(recipient: Parameters<typeof startConversation>[0]) {
  await startConversation(recipient)
}

function handleTabKey(event: KeyboardEvent) {
  const nextMode = event.key === 'ArrowRight' || event.key === 'End'
    ? 'notifications'
    : event.key === 'ArrowLeft' || event.key === 'Home'
      ? 'direct'
      : null
  if (!nextMode) return
  event.preventDefault()
  mode.value = nextMode
  void nextTick(() => (nextMode === 'direct' ? directTab.value : notificationTab.value)?.focus())
}

function writeDetailUrl(key: 'conversation' | 'notification', value: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete('conversation')
  url.searchParams.delete('notification')
  url.searchParams.set(key, value)
  window.history.pushState({ alumniInbox: true }, '', url)
}

async function openConversation(conversation: DirectConversation, updateUrl = true) {
  await selectConversation(conversation)
  if (updateUrl) writeDetailUrl('conversation', conversation.id)
}

async function openNotification(notification: NotificationItem, updateUrl = true) {
  await selectNotification(notification)
  if (updateUrl) writeDetailUrl('notification', notification.id)
}

function closeDetail() {
  if (window.history.state?.alumniInbox) {
    window.history.back()
    return
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('conversation')
  url.searchParams.delete('notification')
  window.history.replaceState(window.history.state, '', url)
  clearSelection()
}

function restoreFromLocation() {
  const params = new URLSearchParams(window.location.search)
  const conversation = conversations.value.find(item => item.id === params.get('conversation'))
  const notification = notifications.value.find(item => item.id === params.get('notification'))
  if (conversation) return void openConversation(conversation, false)
  if (notification) return void openNotification(notification, false)
  clearSelection()
}

onMounted(async () => {
  await loadInitial()
  restoreFromLocation()
  if (!props.defaultRecipient) return

  const existing = conversations.value.find(item => item.peer.slug === props.defaultRecipient)
  if (existing) {
    await selectConversation(existing)
    return
  }

  try {
    const classmates = await fetchInboxClassmates(props.apiBase)
    const recipient = classmates.find(item => item.slug === props.defaultRecipient)
    if (recipient) await startConversation(recipient)
  } catch {
    newConversationOpen.value = true
  }
})

onMounted(() => window.addEventListener('popstate', restoreFromLocation))
onBeforeUnmount(() => window.removeEventListener('popstate', restoreFromLocation))
</script>

<style scoped>
.mailbox-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

/* Header */
.mailbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--bg-raised);
}

.mailbox-header__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--type-body-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.mailbox-header__title svg {
  color: var(--accent);
}

/* Tabs */
.mailbox-tabs {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: var(--bg-soft);
  padding: 3px;
  border-radius: var(--radius-md);
}

.mailbox-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 36px;
  padding: 0 var(--space-4);
  color: var(--text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-expo),
    background-color var(--duration-fast) var(--ease-out-expo);
}

.mailbox-tab:hover {
  color: var(--text-primary);
}

.mailbox-tab--active {
  color: var(--text-primary);
  background: var(--bg-raised);
  box-shadow: var(--shadow-sm);
}

.mailbox-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  color: var(--bg-raised);
  background: var(--error);
  border-radius: var(--radius-pill);
  font-size: var(--type-caption);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}

/* Error */
.mailbox-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-4) var(--space-5) 0;
  padding: var(--space-3) var(--space-4);
  color: var(--error);
  background: rgba(198, 69, 69, 0.06);
  border: 1px solid rgba(198, 69, 69, 0.15);
  border-radius: var(--radius-md);
  font-size: var(--type-body-sm);
}

.mailbox-error svg {
  flex-shrink: 0;
}

/* Workspace */
.mailbox-workspace {
  display: grid;
  grid-template-columns: clamp(280px, 30vw, 340px) minmax(0, 1fr);
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.mailbox-sidebar {
  min-width: 0;
  background: var(--bg-soft);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.mailbox-detail-pane {
  min-width: 0;
  overflow-y: auto;
  background: var(--bg-raised);
}

.mobile-detail-back {
  display: none;
}

/* Responsive */
@media (max-width: 768px) {
  .mailbox-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .mailbox-workspace {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .mailbox-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .mailbox-workspace.has-detail .mailbox-sidebar {
    display: none;
  }

  .mailbox-workspace:not(.has-detail) .mailbox-detail-pane {
    display: none;
  }

  .mobile-detail-back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding: var(--space-3) var(--space-4);
    color: var(--accent);
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--border);
    font: inherit;
    font-size: var(--type-body-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    width: 100%;
  }
}
</style>
