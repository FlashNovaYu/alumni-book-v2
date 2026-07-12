import { computed, ref } from 'vue'
import { getClassmateStudent, type ClassmateSessionStudent, type GroupChatMessage } from '@alumni/shared'
import {
  fetchGroupChatMessages,
  fetchMyGroupChatMessages,
  reactToGroupChatMessage,
  recallGroupChatMessage,
  sendGroupChatMessage,
  syncGroupChat,
  type GroupChatMute,
} from '../api/groupChat'
import { useVisibilityPolling } from './useVisibilityPolling'

export type GroupChatDeliveryState = 'sent' | 'sending' | 'failed'
export interface GroupChatUiMessage extends GroupChatMessage { clientNonce?: string; deliveryState: GroupChatDeliveryState }
export interface UseGroupChatOptions { apiBase: string; initialItems: GroupChatMessage[]; initialCursor: string | null; initialMute: GroupChatMute | null }

const createClientNonce = () => globalThis.crypto?.randomUUID?.() || `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`
const orderMessages = (a: GroupChatUiMessage, b: GroupChatUiMessage) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id)

export function useGroupChat(options: UseGroupChatOptions) {
  const store = ref(new Map<string, GroupChatUiMessage>())
  const historyCursor = ref<string | null>(options.initialCursor || null)
  const syncCursor = ref<string | null>(null)
  const reactionWriteQueues = new Map<string, Promise<void>>()
  const mute = ref<GroupChatMute | null>(options.initialMute)
  const replyTarget = ref<GroupChatUiMessage | null>(null)
  const mine = ref<GroupChatMessage[]>([])
  const loadingOlder = ref(false)
  const mineLoading = ref(false)
  const sending = ref(false)
  const connectionState = ref<'ready' | 'syncing' | 'error'>('ready')
  const newMessageCount = ref(0)
  const nearBottom = ref(true)
  const items = computed(() => Array.from(store.value.values()).sort(orderMessages))
  const canLoadOlder = computed(() => Boolean(historyCursor.value))

  const replaceStore = (mutator: (next: Map<string, GroupChatUiMessage>) => void) => {
    const next = new Map(store.value); mutator(next); store.value = next
  }
  const mergeServerMessage = (message: GroupChatMessage) => replaceStore((next) => {
    if (message.status === 'hidden') next.delete(message.id)
    else next.set(message.id, { ...message, deliveryState: 'sent' })
  })

  async function sendPending(message: GroupChatUiMessage) {
    replaceStore((next) => next.set(message.id, { ...message, deliveryState: 'sending' }))
    sending.value = true
    try {
      const saved = await sendGroupChatMessage(options.apiBase, { content: message.content || '', clientNonce: message.clientNonce || createClientNonce(), replyToId: message.replyTo?.id })
      replaceStore((next) => { next.delete(message.id); next.set(saved.id, { ...saved, deliveryState: 'sent' }) })
    } catch {
      replaceStore((next) => next.set(message.id, { ...message, deliveryState: 'failed' }))
      connectionState.value = 'error'
    } finally { sending.value = false }
  }

  async function send(content: string) {
    const body = content.trim(); if (!body) return
    const student = getClassmateStudent<ClassmateSessionStudent>(); if (!student) throw new Error('请先登录同学账号')
    const target = replyTarget.value
    const clientNonce = createClientNonce()
    const pending: GroupChatUiMessage = {
      id: `local:${clientNonce}`, author: student, content: body, status: 'visible',
      replyTo: target ? { id: target.id, authorName: target.author.name, preview: target.content || '原消息不可用' } : null,
      reactionCounts: {}, myReaction: null, canRecall: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), clientNonce, deliveryState: 'sending',
    }
    replyTarget.value = null
    replaceStore((next) => next.set(pending.id, pending))
    await sendPending(pending)
  }

  async function retry(messageId: string) { const pending = store.value.get(messageId); if (pending?.deliveryState === 'failed' && pending.content) await sendPending(pending) }
  async function loadOlder() {
    if (loadingOlder.value || !historyCursor.value) return
    loadingOlder.value = true
    try { const page = await fetchGroupChatMessages(options.apiBase, { before: historyCursor.value }); page.items.forEach(mergeServerMessage); historyCursor.value = page.nextCursor }
    finally { loadingOlder.value = false }
  }
  async function syncNow(signal?: AbortSignal) {
    connectionState.value = 'syncing'
    try {
      const payload = await syncGroupChat(options.apiBase, syncCursor.value || undefined, { signal }); let added = 0
      replaceStore((next) => payload.items.forEach((message) => {
        if (!next.has(message.id) && message.status !== 'hidden') added += 1
        if (message.status === 'hidden') next.delete(message.id); else next.set(message.id, { ...message, deliveryState: 'sent' })
      }))
      syncCursor.value = payload.cursor; mute.value = payload.mute
      if (!nearBottom.value && added) newMessageCount.value += added
      connectionState.value = 'ready'
    } catch (error) { if ((error as Error).name !== 'AbortError') connectionState.value = 'error'; throw error }
  }
  async function react(messageId: string, reaction: string) {
    const previousWrite = reactionWriteQueues.get(messageId) || Promise.resolve()
    let releaseWrite!: () => void
    const currentWrite = new Promise<void>((resolve) => { releaseWrite = resolve })
    reactionWriteQueues.set(messageId, currentWrite)

    await previousWrite
    try {
      const updated = await reactToGroupChatMessage(options.apiBase, messageId, reaction)
      replaceStore((next) => { const current = next.get(messageId); if (current) next.set(messageId, { ...current, ...updated }) })
    } finally {
      releaseWrite()
      if (reactionWriteQueues.get(messageId) === currentWrite) reactionWriteQueues.delete(messageId)
    }
  }
  async function recall(messageId: string) {
    const recalled = await recallGroupChatMessage(options.apiBase, messageId); mergeServerMessage(recalled)
    if (replyTarget.value?.id === messageId) replyTarget.value = null
  }
  async function loadMine() {
    mineLoading.value = true
    try { const page = await fetchMyGroupChatMessages(options.apiBase); mine.value = page.items }
    finally { mineLoading.value = false }
  }
  const setReplyTarget = (message: GroupChatUiMessage) => { replyTarget.value = message }
  const clearReplyTarget = () => { replyTarget.value = null }
  const setNearBottom = (value: boolean) => { nearBottom.value = value; if (value) newMessageCount.value = 0 }
  const consumeNewMessages = () => { newMessageCount.value = 0 }

  options.initialItems.forEach(mergeServerMessage)
  useVisibilityPolling({ run: syncNow, initialDelay: 5_000, baseDelay: 5_000, maxDelay: 30_000 })

  return { items, mute, replyTarget, mine, mineLoading, loadingOlder, canLoadOlder, sending, connectionState, newMessageCount, send, retry, loadOlder, syncNow, react, recall, loadMine, setReplyTarget, clearReplyTarget, setNearBottom, consumeNewMessages }
}
