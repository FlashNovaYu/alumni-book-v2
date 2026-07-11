import { computed, ref } from 'vue'
import { getClassmateStudent, type ClassmateSessionStudent, type GroupChatMessage } from '@alumni/shared'
import {
  fetchGroupChatMessages,
  sendGroupChatMessage,
  syncGroupChat,
  type GroupChatMute,
} from '../api/groupChat'

export type GroupChatDeliveryState = 'sent' | 'sending' | 'failed'

export interface GroupChatUiMessage extends GroupChatMessage {
  clientNonce?: string
  deliveryState: GroupChatDeliveryState
}

export interface UseGroupChatOptions {
  apiBase: string
  initialItems: GroupChatMessage[]
  initialCursor: string
  initialMute: GroupChatMute | null
}

function createClientNonce() {
  return globalThis.crypto?.randomUUID?.() || `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function orderMessages(a: GroupChatUiMessage, b: GroupChatUiMessage) {
  const time = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  return time || a.id.localeCompare(b.id)
}

export function useGroupChat(options: UseGroupChatOptions) {
  const store = ref(new Map<string, GroupChatUiMessage>())
  const historyCursor = ref<string | null>(options.initialCursor || null)
  const syncCursor = ref<string | null>(null)
  const mute = ref<GroupChatMute | null>(options.initialMute)
  const loadingOlder = ref(false)
  const connectionState = ref<'ready' | 'syncing' | 'error'>('ready')
  const newMessageCount = ref(0)
  const nearBottom = ref(true)

  const items = computed(() => Array.from(store.value.values()).sort(orderMessages))

  function replaceStore(mutator: (next: Map<string, GroupChatUiMessage>) => void) {
    const next = new Map(store.value)
    mutator(next)
    store.value = next
  }

  function mergeServerMessage(message: GroupChatMessage) {
    replaceStore((next) => {
      if (message.status === 'hidden') next.delete(message.id)
      else next.set(message.id, { ...message, deliveryState: 'sent' })
    })
  }

  async function sendPending(message: GroupChatUiMessage) {
    replaceStore((next) => next.set(message.id, { ...message, deliveryState: 'sending' }))
    connectionState.value = 'syncing'
    try {
      const saved = await sendGroupChatMessage(options.apiBase, {
        content: message.content || '',
        clientNonce: message.clientNonce || createClientNonce(),
      })
      replaceStore((next) => {
        next.delete(message.id)
        next.set(saved.id, { ...saved, deliveryState: 'sent' })
      })
      connectionState.value = 'ready'
    } catch {
      replaceStore((next) => next.set(message.id, { ...message, deliveryState: 'failed' }))
      connectionState.value = 'error'
    }
  }

  async function send(content: string) {
    const body = content.trim()
    if (!body) return
    const student = getClassmateStudent<ClassmateSessionStudent>()
    if (!student) throw new Error('请先登录同学账号')

    const clientNonce = createClientNonce()
    const pending: GroupChatUiMessage = {
      id: `local:${clientNonce}`,
      author: student,
      content: body,
      status: 'visible',
      replyTo: null,
      reactionCounts: {},
      myReaction: null,
      canRecall: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientNonce,
      deliveryState: 'sending',
    }
    replaceStore((next) => next.set(pending.id, pending))
    await sendPending(pending)
  }

  async function retry(messageId: string) {
    const pending = store.value.get(messageId)
    if (!pending || pending.deliveryState !== 'failed' || !pending.content) return
    await sendPending(pending)
  }

  async function loadOlder() {
    if (loadingOlder.value || !historyCursor.value) return
    loadingOlder.value = true
    try {
      const page = await fetchGroupChatMessages(options.apiBase, { before: historyCursor.value })
      page.items.forEach(mergeServerMessage)
      historyCursor.value = page.items.length ? page.nextCursor : null
    } finally {
      loadingOlder.value = false
    }
  }

  async function syncNow(signal?: AbortSignal) {
    connectionState.value = 'syncing'
    try {
      const payload = await syncGroupChat(options.apiBase, syncCursor.value || undefined, { signal })
      let added = 0
      replaceStore((next) => {
        for (const message of payload.items) {
          if (!next.has(message.id) && message.status !== 'hidden') added += 1
          if (message.status === 'hidden') next.delete(message.id)
          else next.set(message.id, { ...message, deliveryState: 'sent' })
        }
      })
      syncCursor.value = payload.cursor
      mute.value = payload.mute
      if (!nearBottom.value && added) newMessageCount.value += added
      connectionState.value = 'ready'
    } catch (error) {
      if ((error as Error).name !== 'AbortError') connectionState.value = 'error'
      throw error
    }
  }

  function setNearBottom(value: boolean) {
    nearBottom.value = value
    if (value) newMessageCount.value = 0
  }

  function consumeNewMessages() {
    newMessageCount.value = 0
  }

  for (const message of options.initialItems) mergeServerMessage(message)

  return {
    items,
    mute,
    loadingOlder,
    connectionState,
    newMessageCount,
    send,
    retry,
    loadOlder,
    syncNow,
    setNearBottom,
    consumeNewMessages,
  }
}
