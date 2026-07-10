import { ref } from 'vue'
import {
  fetchPublicMessages,
  fetchMyPublicMessages,
  submitPublicMessage,
  reactToPublicMessage
} from '../api/postOffice'

export type PublicMessage = {
  id: string
  authorName: string
  content: string
  cardStyle: string
  status: string
  reviewReason?: string | null
  reactions?: Record<string, number>
  createdAt: string
}

export function usePublicMessages(apiBase: string) {
  const approved = ref<PublicMessage[]>([])
  const mine = ref<PublicMessage[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadApproved() {
    loading.value = true
    try {
      const data = await fetchPublicMessages(apiBase)
      if (data.success) {
        approved.value = data.data?.items || []
      }
    } catch (err) {
      console.error('Failed to load approved messages:', err)
    } finally {
      loading.value = false
    }
  }

  async function loadMine() {
    loading.value = true
    try {
      const data = await fetchMyPublicMessages(apiBase)
      if (data.success) {
        mine.value = data.data?.items || []
      }
    } catch (err) {
      console.error('Failed to load my messages:', err)
    } finally {
      loading.value = false
    }
  }

  async function submit(content: string, cardStyle: string): Promise<boolean> {
    submitting.value = true
    notice.value = null
    try {
      const data = await submitPublicMessage(apiBase, content.trim(), cardStyle)
      if (data.success) {
        notice.value = { type: 'success', text: data.message || '留言已提交，等待审核' }
        await loadMine()
        return true
      } else {
        notice.value = { type: 'error', text: data.message || '提交失败' }
        return false
      }
    } catch (err) {
      notice.value = { type: 'error', text: '网络错误，请稍后重试' }
      return false
    } finally {
      submitting.value = false
    }
  }

  async function react(id: string, reaction: string) {
    try {
      const data = await reactToPublicMessage(apiBase, id, reaction)
      if (data && data.reactions) {
        const updatedReactions = data.reactions
        
        // 更新 approved 列表中的对应留言
        const approvedMsg = approved.value.find(m => m.id === id)
        if (approvedMsg) {
          approvedMsg.reactions = updatedReactions
        }
        
        // 更新 mine 列表中的对应留言
        const mineMsg = mine.value.find(m => m.id === id)
        if (mineMsg) {
          mineMsg.reactions = updatedReactions
        }
      }
    } catch (err) {
      console.error('Failed to update reaction:', err)
    }
  }

  return {
    approved,
    mine,
    loading,
    submitting,
    notice,
    loadApproved,
    loadMine,
    submit,
    react,
  }
}
