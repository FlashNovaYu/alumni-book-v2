import { ref, computed } from 'vue'
import type { GroupChatMessage, ClassmateSessionStudent } from '@alumni/shared'
import { 
  listGroupMessages, 
  syncGroupChat, 
  sendGroupMessage, 
  recallGroupMessage, 
  reactToGroupMessage 
} from '../api/groupChat'

export type GroupChatStatusExt = GroupChatMessage & {
  sending?: boolean
  failed?: boolean
  clientNonce?: string
}

function getLocalStudent(): ClassmateSessionStudent {
  try {
    const str = sessionStorage.getItem('classmate_account_student')
    if (str) {
      const parsed = JSON.parse(str)
      return {
        name: parsed.name || '我',
        slug: parsed.slug || 'me',
        avatarUrl: parsed.avatarUrl || null
      }
    }
  } catch {}
  return { name: '我', slug: 'me', avatarUrl: null }
}

export function useGroupChat(
  apiBase: string,
  initialItems: GroupChatMessage[],
  initialCursor: string,
  initialMute: { reason: string; mutedUntil: string | null } | null
) {
  const messageMap = ref<Map<string, GroupChatStatusExt>>(new Map())
  const cursor = ref<string>(initialCursor)
  const mute = ref<any>(initialMute)
  const connectionState = ref<'connected' | 'connecting' | 'disconnected'>('connected')
  const newMessageCount = ref(0)
  const nearBottom = ref(true)
  const isFetchingOlder = ref(false)

  // 初始化装填
  initialItems.forEach(item => {
    messageMap.value.set(item.id, { ...item })
  })

  const items = computed(() => {
    return Array.from(messageMap.value.values()).sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  })

  function setNearBottom(isNear: boolean) {
    nearBottom.value = isNear
    if (isNear) {
      consumeNewMessages()
    }
  }

  function consumeNewMessages() {
    newMessageCount.value = 0
  }

  async function syncNow() {
    connectionState.value = 'connecting'
    try {
      const res = await syncGroupChat(apiBase, cursor.value)
      connectionState.value = 'connected'

      mute.value = res.mute
      cursor.value = res.cursor

      let newMsgCount = 0
      const localAuthor = getLocalStudent()
      res.items.forEach(item => {
        const existing = messageMap.value.get(item.id)
        if (!existing) {
          if (item.author.slug !== localAuthor.slug && !nearBottom.value) {
            newMsgCount++
          }
        }
        messageMap.value.set(item.id, { ...item })
      })

      if (newMsgCount > 0) {
        newMessageCount.value += newMsgCount
      }
    } catch (e) {
      connectionState.value = 'disconnected'
      console.error('[Group Chat Sync] Failed:', e)
    }
  }

  async function executeSend(tempId: string, nonce: string, body: string, replyToId?: string | null) {
    try {
      const res = await sendGroupMessage(apiBase, {
        content: body,
        clientNonce: nonce,
        replyToId: replyToId || null
      })

      messageMap.value.delete(tempId)
      messageMap.value.set(res.id, { ...res })

      if (nearBottom.value) {
        consumeNewMessages()
      }
    } catch (err) {
      console.error('[Group Chat Send] Failed:', err)
      const existing = messageMap.value.get(tempId)
      if (existing) {
        existing.sending = false
        existing.failed = true
      }
    }
  }

  async function send(body: string, replyToId?: string | null) {
    const author = getLocalStudent()
    const nonce = 'nonce-' + Math.random().toString(36).substring(2, 15) + Date.now().toString()
    const tempId = `local:${nonce}`

    const tempMessage: GroupChatStatusExt = {
      id: tempId,
      author,
      content: body,
      status: 'visible',
      replyTo: null,
      reactionCounts: {},
      myReaction: null,
      canRecall: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sending: true,
      failed: false,
      clientNonce: nonce
    }

    messageMap.value.set(tempId, tempMessage)
    await executeSend(tempId, nonce, body, replyToId)
  }

  async function retry(clientNonce: string) {
    let targetTempId: string | null = null
    let body = ''

    for (const [id, msg] of messageMap.value.entries()) {
      if (msg.clientNonce === clientNonce && msg.failed) {
        targetTempId = id
        body = msg.content || ''
        break
      }
    }

    if (!targetTempId) return

    const existing = messageMap.value.get(targetTempId)
    if (existing) {
      existing.sending = true
      existing.failed = false
    }

    await executeSend(targetTempId, clientNonce, body)
  }

  async function loadOlder() {
    if (isFetchingOlder.value) return
    isFetchingOlder.value = true

    try {
      const sorted = items.value
      const oldest = sorted[0]
      const beforeCursor = oldest ? oldest.id : undefined

      const res = await listGroupMessages(apiBase, {
        limit: 30,
        before: beforeCursor
      })

      res.items.forEach(item => {
        if (!messageMap.value.has(item.id)) {
          messageMap.value.set(item.id, { ...item })
        }
      })
    } catch (e) {
      console.error('[Group Chat Load Older] Failed:', e)
    } finally {
      isFetchingOlder.value = false
    }
  }

  async function react(messageId: string, reaction: string | null) {
    try {
      const res = await reactToGroupMessage(apiBase, messageId, reaction)
      const existing = messageMap.value.get(messageId)
      if (existing) {
        existing.myReaction = res.myReaction
        existing.reactionCounts = res.reactionCounts
      }
    } catch (e) {
      console.error('[Group Chat Reaction] Failed:', e)
    }
  }

  async function recall(messageId: string) {
    try {
      const res = await recallGroupMessage(apiBase, messageId)
      messageMap.value.set(messageId, { ...res })
    } catch (e) {
      console.error('[Group Chat Recall] Failed:', e)
      throw e
    }
  }

  return {
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
  }
}
