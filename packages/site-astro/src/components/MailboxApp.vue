<template>
  <section class="mailbox-app" aria-label="班级信箱">
    <header class="mailbox-toolbar">
      <div class="mailbox-tabs" role="tablist" aria-label="班级信箱内容">
        <button ref="directTab" id="inbox-tab-direct" type="button" role="tab" :tabindex="mode === 'direct' ? 0 : -1" :aria-selected="mode === 'direct'" aria-controls="inbox-panel" @click="mode = 'direct'" @keydown="handleTabKey">私聊<span v-if="unread.directUnread">{{ unread.directUnread }}</span></button>
        <button ref="notificationTab" id="inbox-tab-notification" type="button" role="tab" :tabindex="mode === 'notifications' ? 0 : -1" :aria-selected="mode === 'notifications'" aria-controls="inbox-panel" @click="mode = 'notifications'" @keydown="handleTabKey">通知<span v-if="unread.notificationUnread">{{ unread.notificationUnread }}</span></button>
      </div>
    </header>

    <p v-if="error" class="mailbox-error" role="alert">{{ error }}</p>
    <div id="inbox-panel" class="mailbox-workspace" :class="{ 'has-detail': detailOpen }" role="tabpanel" :aria-labelledby="mode === 'direct' ? 'inbox-tab-direct' : 'inbox-tab-notification'">
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

      <div class="mailbox-detail-pane" :aria-busy="loading">
        <button v-if="detailOpen" type="button" class="mobile-detail-back" @click="closeDetail">返回信箱</button>
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
.mailbox-app { display: grid; gap: var(--spacing-md); }
.mailbox-toolbar { display: flex; align-items: center; gap: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 1px solid var(--color-paper-border); }
.mailbox-tabs { display: inline-flex; align-items: center; gap: 3px; }
.mailbox-tabs button { position: relative; min-height: 40px; padding: 0 var(--spacing-md); color: var(--color-paper-muted); background: transparent; border: 0; border-bottom: 2px solid transparent; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.mailbox-tabs button[aria-selected="true"] { color: var(--color-paper-ink); border-bottom-color: var(--color-paper-stamp-red); }
.mailbox-tabs span { display: inline-grid; min-width: 17px; height: 17px; margin-left: 5px; padding: 0 4px; place-items: center; color: #fffaf2; background: var(--color-paper-stamp-red); border-radius: 9px; font-size: 10px; font-variant-numeric: tabular-nums; }
.mailbox-error { margin: 0; padding: 9px 12px; color: var(--color-paper-stamp-red); background: color-mix(in srgb, var(--color-paper-stamp-red) 7%, var(--color-paper-card)); border: 1px solid color-mix(in srgb, var(--color-paper-stamp-red) 26%, var(--color-paper-border)); font-size: 13px; }
.mailbox-workspace { display: grid; grid-template-columns: clamp(320px, 30vw, 360px) minmax(0, 1fr); min-height: 640px; border-top: 1px solid var(--color-paper-border); }
.mailbox-sidebar { min-width: 0; background: var(--color-paper-card); border-right: 1px solid var(--color-paper-border); }
.mailbox-detail-pane { min-width: 0; }
.mobile-detail-back { display: none; }
@media (max-width: 768px) {
  .mailbox-toolbar { align-items: flex-start; }
  .mailbox-workspace { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .mailbox-sidebar { border-right: 0; border-bottom: 1px solid var(--color-paper-border); }
  .mailbox-workspace.has-detail .mailbox-sidebar { display: none; }
  .mailbox-workspace:not(.has-detail) .mailbox-detail-pane { display: none; }
  .mobile-detail-back { display: inline-flex; align-items: center; min-height: 40px; padding: 0; color: var(--color-paper-brown); background: transparent; border: 0; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
}
</style>
