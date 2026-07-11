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

export type InboxMode = 'direct' | 'notifications'
export type InboxConnectionState = 'ready' | 'syncing' | 'error'
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
    if (selectedConversation.value?.id === conversationId) messages.value = sorted
  }

  function replaceMessage(conversationId: string, messageId: string, next: DirectInboxMessage) {
    const items = histories.get(conversationId) || []
    setMessages(conversationId, items.map(item => item.id === messageId ? next : item))
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
    unread.value = { directUnread, notificationUnread, totalUnread: directUnread + notificationUnread }
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
      unread.value = summary
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

  async function transmit(message: DirectInboxMessage) {
    const conversation = selectedConversation.value
    const peer = conversation?.peer || selectedRecipient.value
    if (!peer || !message.clientNonce) return

    const pendingConversationId = message.conversationId
    connectionState.value = 'syncing'
    message.deliveryState = 'sending'
    replaceMessage(pendingConversationId, message.id, { ...message })
    try {
      let delivered: DirectMessage
      if (conversation) {
        delivered = await sendDirectMessage(apiBase, conversation.id, { body: message.body, clientNonce: message.clientNonce })
      } else {
        const started = await startDirectConversation(apiBase, { recipientSlug: peer.slug, body: message.body, clientNonce: message.clientNonce })
        upsertConversation(started.conversation)
        const pendingItems = histories.get(pendingConversationId) || []
        histories.delete(pendingConversationId)
        const startedItems: DirectInboxMessage[] = pendingItems.map(item => item.id === message.id
          ? { ...started.message, deliveryState: 'sent' as const }
          : { ...item, conversationId: started.conversation.id },
        )
        if (!selectedConversation.value && selectedRecipient.value?.slug === peer.slug) {
          selectedConversation.value = started.conversation
          selectedRecipient.value = null
        }
        setMessages(started.conversation.id, startedItems)
        delivered = started.message
      }

      const sent: DirectInboxMessage = { ...delivered, deliveryState: 'sent' }
      if (conversation) replaceMessage(pendingConversationId, message.id, sent)
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
    await transmit(pending)
    sending.value = false
  }

  async function retry(messageId: string) {
    const message = messages.value.find(item => item.id === messageId)
    if (!message || message.deliveryState !== 'failed' || sending.value) return
    sending.value = true
    await transmit(message)
    sending.value = false
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
        unread.value = {
          directUnread: unread.value.directUnread,
          notificationUnread: unread.value.notificationUnread + 1,
          totalUnread: unread.value.totalUnread + 1,
        }
      }
    }
  }

  async function syncNow() {
    connectionState.value = 'syncing'
    try {
      const result = await syncInbox(apiBase, cursor.value || undefined)
      cursor.value = result.cursor
      result.conversations.forEach(upsertConversation)
      result.messages.forEach((message) => {
        const items = histories.get(message.conversationId) || []
        if (!items.some(item => item.id === message.id)) setMessages(message.conversationId, [...items, { ...message, deliveryState: 'sent' }])
      })
      result.notifications.forEach((notification) => {
        if (notifications.value.some(item => item.id === notification.id)) replaceNotification(notification)
        else notifications.value = [notification, ...notifications.value]
      })
      unread.value = result.unread
      connectionState.value = 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '信箱同步失败'
      connectionState.value = 'error'
    }
  }

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
    send,
    retry,
    markCurrentRead,
    syncNow,
  }
}
