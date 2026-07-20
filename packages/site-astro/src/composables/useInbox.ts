import { computed, ref } from 'vue'
import { getClassmateStudent, type ClassmateEntry, type DirectConversation, type DirectMessage, type InboxSummary, type NotificationItem } from '@alumni/shared'
import {
  fetchDirectConversationHistory,
  fetchDirectConversations,
  fetchInboxSummary,
  fetchNotifications,
  markDirectConversationRead,
  markNotificationRead,
  sendDirectMessage,
  startDirectConversation,
  syncInbox,
} from '../api/inbox'
import { useVisibilityPolling } from './useVisibilityPolling'

export type InboxMode = 'direct' | 'notifications'
export type InboxConnectionState = 'ready' | 'syncing' | 'sending' | 'error'
export type DirectInboxMessage = DirectMessage & {
  clientNonce?: string
  deliveryState: 'sent' | 'sending' | 'failed'
}

function nonce() {
  return crypto.randomUUID()
}

function sortByCreatedAt(items: DirectInboxMessage[]) {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function sortConversations(items: DirectConversation[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
}

export function useInbox(apiBase: string) {
  const mode = ref<InboxMode>('direct')
  const conversations = ref<DirectConversation[]>([])
  const notifications = ref<NotificationItem[]>([])
  const selectedConversation = ref<DirectConversation | null>(null)
  const selectedNotification = ref<NotificationItem | null>(null)
  const selectedRecipient = ref<ClassmateEntry | null>(null)
  const messages = ref<DirectInboxMessage[]>([])
  const unread = ref<InboxSummary>({ directUnread: 0, notificationUnread: 0, totalUnread: 0 })
  const loading = ref(false)
  const sending = ref(false)
  const connectionState = ref<InboxConnectionState>('ready')
  const error = ref<string | null>(null)
  const cursor = ref<string | null>(null)
  const histories = new Map<string, DirectInboxMessage[]>()
  const loadedHistory = new Set<string>()
  const currentSlug = getClassmateStudent<{ slug: string }>()?.slug || ''

  const selectedPeer = computed(() => selectedConversation.value?.peer || selectedRecipient.value)

  function setMessages(conversationId: string, items: DirectInboxMessage[]) {
    const sorted = sortByCreatedAt(items)
    histories.set(conversationId, sorted)
    if (selectedConversation.value?.id === conversationId
      || (!selectedConversation.value && selectedRecipient.value && conversationId === `pending-${selectedRecipient.value.slug}`)) {
      messages.value = sorted
    }
  }

  function replaceMessage(conversationId: string, messageId: string, next: DirectInboxMessage) {
    const items = histories.get(conversationId) || []
    setMessages(conversationId, items.map(item => item.id === messageId ? next : item))
  }

  function sameMessage(left: Pick<DirectInboxMessage, 'id' | 'clientNonce'>, right: Pick<DirectInboxMessage, 'id' | 'clientNonce'>) {
    return left.id === right.id || Boolean(left.clientNonce && right.clientNonce && left.clientNonce === right.clientNonce)
  }

  function findMessage(message: Pick<DirectInboxMessage, 'id' | 'clientNonce'>) {
    for (const [conversationId, items] of histories) {
      const item = items.find(candidate => sameMessage(candidate, message))
      if (item) return { conversationId, item }
    }
    return null
  }

  function mergeServerMessage(message: DirectMessage): DirectInboxMessage {
    const located = findMessage(message)
    const sourceItems = located
      ? (histories.get(located.conversationId) || []).map(item => ({ ...item, conversationId: message.conversationId }))
      : []
    if (located && located.conversationId !== message.conversationId) histories.delete(located.conversationId)
    const targetItems = histories.get(message.conversationId) || []
    const sent: DirectInboxMessage = {
      ...message,
      clientNonce: message.clientNonce || located?.item.clientNonce,
      deliveryState: 'sent',
    }
    const candidates = located?.conversationId === message.conversationId
      ? targetItems
      : [...targetItems, ...sourceItems]

    if (!selectedConversation.value && located && selectedRecipient.value) {
      const syncedConversation = conversations.value.find(item => item.id === message.conversationId)
      if (syncedConversation?.peer.slug === selectedRecipient.value.slug) {
        selectedConversation.value = syncedConversation
        selectedRecipient.value = null
      }
    }

    setMessages(message.conversationId, [...candidates.filter(item => !sameMessage(item, sent)), sent])
    return sent
  }

  function upsertConversation(next: DirectConversation) {
    const index = conversations.value.findIndex(item => item.id === next.id)
    const items = [...conversations.value]
    if (index === -1) items.push(next)
    else items[index] = next
    conversations.value = sortConversations(items)
    if (selectedConversation.value?.id === next.id) selectedConversation.value = next
  }

  function replaceNotification(next: NotificationItem) {
    notifications.value = notifications.value.map(item => item.id === next.id ? next : item)
    if (selectedNotification.value?.id === next.id) selectedNotification.value = next
  }

  function reduceUnread(direct = 0, notification = 0) {
    const directUnread = Math.max(0, unread.value.directUnread - direct)
    const notificationUnread = Math.max(0, unread.value.notificationUnread - notification)
    updateUnread({ directUnread, notificationUnread, totalUnread: directUnread + notificationUnread })
  }

  function updateUnread(next: InboxSummary) {
    const directUnread = Math.max(0, next.directUnread)
    const notificationUnread = Math.max(0, next.notificationUnread)
    const updated = { directUnread, notificationUnread, totalUnread: directUnread + notificationUnread }
    const previous = unread.value
    if (previous.directUnread === updated.directUnread && previous.notificationUnread === updated.notificationUnread) return

    unread.value = updated
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('alumni:inbox-changed', { detail: updated }))
    }
  }

  async function loadInitial() {
    loading.value = true
    error.value = null
    try {
      const [conversationData, notificationData, summary] = await Promise.all([
        fetchDirectConversations(apiBase),
        fetchNotifications(apiBase),
        fetchInboxSummary(apiBase),
      ])
      conversations.value = sortConversations(conversationData.items)
      notifications.value = notificationData.items
      updateUnread(summary)
      connectionState.value = 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '信箱加载失败'
      connectionState.value = 'error'
    } finally {
      loading.value = false
    }
  }

  async function selectConversation(conversation: DirectConversation) {
    const conversationId = conversation.id
    selectedConversation.value = conversation
    selectedRecipient.value = null
    selectedNotification.value = null
    mode.value = 'direct'
    error.value = null
    messages.value = histories.get(conversationId) || []

    if (!loadedHistory.has(conversationId)) {
      loading.value = true
      try {
        const history = await fetchDirectConversationHistory(apiBase, conversationId)
        setMessages(conversationId, history.items.map(item => ({ ...item, deliveryState: 'sent' })))
        loadedHistory.add(conversationId)
        if (selectedConversation.value?.id === conversationId) connectionState.value = 'ready'
      } catch (cause) {
        if (selectedConversation.value?.id === conversationId) {
          error.value = cause instanceof Error ? cause.message : '会话记录加载失败'
          connectionState.value = 'error'
        }
      } finally {
        if (selectedConversation.value?.id === conversationId) loading.value = false
      }
    }

    if (selectedConversation.value?.id === conversationId) await markConversationRead(conversation)
  }

  async function selectNotification(notification: NotificationItem) {
    selectedNotification.value = notification
    selectedConversation.value = null
    selectedRecipient.value = null
    mode.value = 'notifications'
    await markCurrentRead()
  }

  function startConversation(recipient: ClassmateEntry) {
    const existing = conversations.value.find(item => item.peer.slug === recipient.slug)
    if (existing) return selectConversation(existing)

    selectedConversation.value = null
    selectedRecipient.value = recipient
    selectedNotification.value = null
    messages.value = []
    mode.value = 'direct'
    return Promise.resolve()
  }

  function clearSelection() {
    selectedConversation.value = null
    selectedNotification.value = null
    selectedRecipient.value = null
    messages.value = []
    error.value = null
  }

  async function transmit(message: DirectInboxMessage) {
    const conversation = selectedConversation.value
    const peer = conversation?.peer || selectedRecipient.value
    if (!peer || !message.clientNonce) return

    const pendingConversationId = message.conversationId
    connectionState.value = 'sending'
    message.deliveryState = 'sending'
    replaceMessage(pendingConversationId, message.id, { ...message })
    try {
      let delivered: DirectMessage
      if (conversation) {
        delivered = await sendDirectMessage(apiBase, conversation.id, { body: message.body, clientNonce: message.clientNonce })
      } else {
        const started = await startDirectConversation(apiBase, { recipientSlug: peer.slug, body: message.body, clientNonce: message.clientNonce })
        upsertConversation(started.conversation)
        if (!selectedConversation.value && selectedRecipient.value?.slug === peer.slug) {
          selectedConversation.value = started.conversation
          selectedRecipient.value = null
        }
        delivered = started.message
      }

      const sent = mergeServerMessage({ ...delivered, clientNonce: delivered.clientNonce || message.clientNonce })
      if (conversation) {
        upsertConversation({
          ...conversation,
          lastMessage: { id: sent.id, senderSlug: sent.senderSlug, body: sent.body, createdAt: sent.createdAt },
          updatedAt: sent.createdAt,
        })
      }
      error.value = null
      connectionState.value = 'ready'
    } catch (cause) {
      const confirmed = findMessage({ id: message.id, clientNonce: message.clientNonce })?.item
      if (confirmed?.deliveryState === 'sent') {
        error.value = null
        connectionState.value = 'ready'
        return
      }
      replaceMessage(pendingConversationId, message.id, { ...message, conversationId: pendingConversationId, deliveryState: 'failed' })
      error.value = cause instanceof Error ? cause.message : '私信发送失败'
      connectionState.value = 'error'
    }
  }

  async function send(body: string) {
    const cleanBody = body.trim()
    const peer = selectedPeer.value
    if (!cleanBody || !peer || sending.value) return

    sending.value = true
    const clientNonce = nonce()
    const conversationId = selectedConversation.value?.id || `pending-${peer.slug}`
    const pending: DirectInboxMessage = {
      id: `pending-${clientNonce}`,
      conversationId,
      senderSlug: currentSlug,
      recipientSlug: peer.slug,
      body: cleanBody,
      createdAt: new Date().toISOString(),
      clientNonce,
      deliveryState: 'sending',
    }
    const items = selectedConversation.value ? histories.get(conversationId) || messages.value : messages.value
    setMessages(conversationId, [...items, pending])
    try {
      await transmit(pending)
    } finally {
      sending.value = false
    }
  }

  async function retry(messageId: string) {
    const message = messages.value.find(item => item.id === messageId)
    if (!message || message.deliveryState !== 'failed' || sending.value) return
    sending.value = true
    try {
      await transmit(message)
    } finally {
      sending.value = false
    }
  }

  async function markConversationRead(conversation: DirectConversation) {
    const latest = (histories.get(conversation.id) || []).at(-1)
    if (!conversation.unreadCount || !latest) return
    try {
      await markDirectConversationRead(apiBase, conversation.id, latest.id)
      upsertConversation({ ...conversation, unreadCount: 0 })
      reduceUnread(conversation.unreadCount, 0)
    } catch {
      // 已读同步失败不阻断会话阅读，后续同步会再次尝试。
    }
  }

  async function markCurrentRead() {
    if (selectedConversation.value) {
      await markConversationRead(selectedConversation.value)
      return
    }

    if (selectedNotification.value && !selectedNotification.value.readAt) {
      const notification = selectedNotification.value
      const read = { ...notification, readAt: new Date().toISOString() }
      replaceNotification(read)
      reduceUnread(0, 1)
      try {
        await markNotificationRead(apiBase, notification.id)
      } catch {
        replaceNotification(notification)
        updateUnread({
          directUnread: unread.value.directUnread,
          notificationUnread: unread.value.notificationUnread + 1,
          totalUnread: unread.value.totalUnread + 1,
        })
      }
    }
  }

  async function syncNow(signal?: AbortSignal) {
    connectionState.value = sending.value ? 'sending' : 'syncing'
    try {
      const result = await syncInbox(apiBase, cursor.value || undefined, { signal })
      cursor.value = result.cursor
      result.conversations.forEach(upsertConversation)
      result.messages.forEach((message) => {
        mergeServerMessage(message)
      })
      result.notifications.forEach((notification) => {
        if (notifications.value.some(item => item.id === notification.id)) replaceNotification(notification)
        else notifications.value = [notification, ...notifications.value]
      })
      updateUnread(result.unread)
      connectionState.value = sending.value ? 'sending' : 'ready'
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') {
        error.value = cause instanceof Error ? cause.message : '信箱同步失败'
        connectionState.value = 'error'
      }
      throw cause
    }
  }

  useVisibilityPolling({ run: syncNow, initialDelay: 5_000, baseDelay: 5_000, maxDelay: 30_000, timeoutMs: 15_000 })

  return {
    mode,
    conversations,
    notifications,
    selectedConversation,
    selectedNotification,
    selectedRecipient,
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
    markCurrentRead,
    syncNow,
  }
}
