<template>
  <div class="messages-page">
    <div class="page-header">
      <div class="header-main-tabs">
        <h1 class="page-title">留言管理</h1>
        <div class="filter-tabs tab-group-main">
          <button :class="['tab-btn', { active: messageType === 'profile' }]" @click="changeMessageType('profile')">个人留言</button>
          <button :class="['tab-btn', { active: messageType === 'public' }]" @click="changeMessageType('public')">公共留言</button>
        </div>
      </div>
      <div v-if="messageType === 'profile'" class="filter-tabs tab-group-sub">
        <button :class="['tab-btn tab-btn-sm', { active: filter === 'all' }]" @click="filter = 'all'">全部</button>
        <button :class="['tab-btn tab-btn-sm', { active: filter === 'pending' }]" @click="filter = 'pending'">待审核</button>
        <button :class="['tab-btn tab-btn-sm', { active: filter === 'approved' }]" @click="filter = 'approved'">已通过</button>
      </div>
    </div>

    <!-- 批量操作区 -->
    <div v-if="canManage && messageType === 'profile' && selectedIds.length > 0" class="batch-actions-panel card">
      <span class="batch-count">已选中 <strong>{{ selectedIds.length }}</strong> 条：</span>
      <div class="batch-buttons">
        <button class="btn-primary btn-sm" @click="batchAction('approve')" :disabled="processing">批量通过</button>
        <button class="btn-secondary btn-sm" @click="batchAction('hide', true)" :disabled="processing">批量隐藏</button>
        <button class="btn-secondary btn-sm" @click="batchAction('hide', false)" :disabled="processing">批量取消隐藏</button>
        <button class="btn-danger btn-sm" @click="batchAction('delete')" :disabled="processing">批量删除</button>
        <button class="btn-secondary btn-sm" @click="selectedIds = []" :disabled="processing">取消选择</button>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <!-- 个人留言列表 -->
    <div v-else-if="messageType === 'profile'" class="msg-list">
      <div v-for="msg in filteredMessages" :key="msg.id" class="msg-card card" :class="{ 'msg-pinned': msg.pinned }">
        <div class="msg-card-inner">
          <!-- 选择框 -->
          <div v-if="canManage" class="msg-select-col">
            <input type="checkbox" v-model="selectedIds" :value="msg.id" class="msg-checkbox" />
          </div>
          
          <!-- 主要内容 -->
          <div class="msg-content-col">
            <div class="msg-meta">
              <span class="msg-student">学生: {{ msg.studentSlug }}</span>
              <span class="msg-author">留言者: {{ msg.authorName }}</span>
              <span class="msg-time">{{ msg.createdAt }}</span>
              <span class="msg-style">款式: {{ getStyleLabel(msg.cardStyle) }}</span>
              <span v-if="msg.pinned" class="badge badge-pinned">📌 已置顶</span>
              <span v-if="!msg.isApproved" class="badge badge-pending">待审核</span>
              <span v-if="msg.isHidden" class="badge badge-hidden">已隐藏</span>
            </div>
            <p class="msg-content">{{ msg.content }}</p>
            <div v-if="msg.reactions && Object.keys(msg.reactions).length" class="msg-reactions-inline">
              <span v-for="(count, emoji) in msg.reactions" :key="emoji" class="react-badge">{{ emoji }} {{ count }}</span>
            </div>
            <div v-if="msg.reply" class="msg-reply-inline">回复：{{ msg.reply }}</div>
            <div class="msg-actions">
              <button v-if="canManage && !msg.isApproved" class="btn-primary btn-sm" @click="approve(msg.id)" :disabled="processing">审核通过</button>
              <button v-if="canManage" class="btn-secondary btn-sm" @click="togglePin(msg.id, !msg.pinned)" :disabled="processing">
                {{ msg.pinned ? '取消置顶' : '置顶' }}
              </button>
              <button v-if="canManage && !msg.isHidden" class="btn-secondary btn-sm" @click="toggleHide(msg.id, true)" :disabled="processing">隐藏</button>
              <button v-else-if="canManage" class="btn-secondary btn-sm" @click="toggleHide(msg.id, false)" :disabled="processing">取消隐藏</button>
              <button v-if="canManage" class="btn-danger btn-sm" @click="remove(msg.id)" :disabled="processing">删除</button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="filteredMessages.length === 0" class="empty-notice">
        没有找到对应的留言
      </div>
    </div>

    <!-- 公共留言列表 -->
    <div v-else-if="messageType === 'public'" class="msg-list">
      <div v-for="msg in publicMessages" :key="msg.id" class="msg-card card">
        <div class="msg-card-inner">
          <div class="msg-content-col">
            <div class="msg-meta">
              <span class="msg-student">作者 slug: {{ msg.authorSlug }}</span>
              <span class="msg-author">留言者: {{ msg.authorName }}</span>
              <span class="msg-time">{{ msg.createdAt }}</span>
              <span class="msg-style">款式: {{ getStyleLabel(msg.cardStyle) }}</span>
              <span v-if="msg.status === 'pending'" class="badge badge-pending">待审核</span>
              <span v-else-if="msg.status === 'approved'" class="badge badge-approved" style="background: var(--color-success); color: white;">已通过</span>
              <span v-else-if="msg.status === 'rejected'" class="badge badge-rejected" style="background: var(--color-error); color: white;">已退回</span>
              <span v-else-if="msg.status === 'hidden'" class="badge badge-hidden">已隐藏</span>
              <span v-if="msg.reviewedBy" class="msg-style">审核人：{{ msg.reviewedBy }}</span>
            </div>
            <p class="msg-content">{{ msg.content }}</p>
            <div v-if="msg.status === 'rejected' && msg.reviewReason" class="msg-reply-inline" style="border-left-color: var(--color-error); background: color-mix(in srgb, var(--color-error) 8%, transparent);">
              退回原因：{{ msg.reviewReason }}
            </div>
            <div class="msg-actions">
              <button v-if="canManage && msg.status === 'pending'" class="btn-primary btn-sm" @click="approvePublic(msg.id)" :disabled="processing">审核通过</button>
              <button v-if="canManage && msg.status === 'pending'" class="btn-danger btn-sm" @click="rejectPublic(msg.id)" :disabled="processing">退回</button>
              <button v-if="canManage" class="btn-secondary btn-sm" @click="togglePublicPin(msg.id, !msg.pinned)" :disabled="processing">{{ msg.pinned ? '取消置顶' : '置顶' }}</button>
              <button v-if="canManage" class="btn-secondary btn-sm" @click="togglePublicFeature(msg.id, !msg.featured)" :disabled="processing">{{ msg.featured ? '取消精选' : '设为精选' }}</button>
              <button v-if="canManage && msg.status !== 'hidden'" class="btn-secondary btn-sm" @click="togglePublicHide(msg.id, true)" :disabled="processing">隐藏</button>
              <button v-else-if="canManage" class="btn-secondary btn-sm" @click="togglePublicHide(msg.id, false)" :disabled="processing">取消隐藏</button>
              <button v-if="canManage" class="btn-danger btn-sm" @click="removePublic(msg.id)" :disabled="processing">删除</button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="publicMessages.length === 0" class="empty-notice">
        没有找到对应的公共留言
      </div>
    </div>


    <Transition name="toast">
      <div v-if="toast" :class="'toast toast-' + toast.type">{{ toast.message }}</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { adminFetch, getCurrentAdmin } from '@/api/client'

interface Message {
  id: string; studentSlug: string; authorName: string; content: string
  isApproved: boolean; isHidden: boolean; createdAt: string
  pinned: boolean; cardStyle: string
  reactions?: Record<string, number>; reply?: string | null; replyAt?: string | null
}

const messages = ref<Message[]>([])
const filter = ref('pending')
const loading = ref(true)
const processing = ref(false)
const selectedIds = ref<string[]>([])
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const messageType = ref<'profile' | 'public'>('profile')
const publicMessages = ref<any[]>([])
const canManage = computed(() => {
  const admin = getCurrentAdmin()
  return !!admin && (admin.isOwner || admin.permissions.includes('moderation.manage'))
})

let toastTimeout: any = null
function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.value = null }, 3000)
}

const filteredMessages = computed(() => {
  if (filter.value === 'pending') return messages.value.filter(m => !m.isApproved)
  if (filter.value === 'approved') return messages.value.filter(m => m.isApproved)
  return messages.value
})

function getStyleLabel(style?: string) {
  const map: Record<string, string> = {
    paper: '复古纸张',
    chalkboard: '粉笔黑板',
    photoback: '相片背面',
    letter: '横格信笺'
  }
  return map[style || ''] || '默认纸张'
}

function changeMessageType(type: 'profile' | 'public') {
  messageType.value = type
  selectedIds.value = []
  load()
}

let currentLoadType = ''
async function load() {
  const type = messageType.value
  currentLoadType = type
  loading.value = true
  try {
    if (type === 'public') {
      const res = await adminFetch<{ success: boolean; data: any[] }>('/api/admin/public-messages')
      if (currentLoadType === type) {
        if (res.data) publicMessages.value = res.data
      }
    } else {
      const res = await adminFetch<{ success: boolean; data: Message[] }>('/api/admin/messages')
      if (currentLoadType === type) {
        if (res.data) messages.value = res.data
      }
    }
  } catch (e: any) {
    if (currentLoadType === type) {
      showToast('error', e.message)
    }
  } finally {
    if (currentLoadType === type) {
      loading.value = false
    }
  }
}

async function approvePublic(id: string) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/approve`, { method: 'PUT' })
    const msg = publicMessages.value.find(m => m.id === id)
    if (msg) msg.status = 'approved'
    showToast('success', '已审核通过')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

async function rejectPublic(id: string) {
  const reason = prompt('请输入退回原因：')
  if (reason === null) return
  const trimmed = reason.trim()
  if (!trimmed) {
    showToast('error', '退回原因不能为空')
    return
  }
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason: trimmed }),
    })
    const msg = publicMessages.value.find(m => m.id === id)
    if (msg) {
      msg.status = 'rejected'
      msg.reviewReason = trimmed
    }
    showToast('success', '已退回留言')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

function findPublicMessage(id: string) {
  return publicMessages.value.find(message => message.id === id)
}

async function togglePublicHide(id: string, hidden: boolean) {
  const reason = hidden ? prompt('请输入隐藏原因：') : ''
  if (hidden && reason === null) return
  if (hidden && !reason?.trim()) { showToast('error', '隐藏原因不能为空'); return }
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/hide`, {
      method: 'PUT', body: JSON.stringify({ hidden, reason: reason?.trim() }),
    })
    const message = findPublicMessage(id)
    if (message) message.status = hidden ? 'hidden' : 'approved'
    showToast('success', hidden ? '已隐藏' : '已取消隐藏')
  } catch (error: any) { showToast('error', error.message) }
  finally { processing.value = false }
}

async function togglePublicPin(id: string, pinned: boolean) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) })
    const message = findPublicMessage(id)
    if (message) message.pinned = pinned
    showToast('success', pinned ? '已置顶' : '已取消置顶')
  } catch (error: any) { showToast('error', error.message) }
  finally { processing.value = false }
}

async function togglePublicFeature(id: string, featured: boolean) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/feature`, { method: 'PUT', body: JSON.stringify({ featured }) })
    const message = findPublicMessage(id)
    if (message) message.featured = featured
    showToast('success', featured ? '已设为精选' : '已取消精选')
  } catch (error: any) { showToast('error', error.message) }
  finally { processing.value = false }
}

async function removePublic(id: string) {
  if (!confirm('确定删除这条公共留言？')) return
  const reason = prompt('请输入删除原因：')
  if (reason === null) return
  if (!reason.trim()) { showToast('error', '删除原因不能为空'); return }
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: reason.trim() }) })
    publicMessages.value = publicMessages.value.filter(message => message.id !== id)
    showToast('success', '已删除')
  } catch (error: any) { showToast('error', error.message) }
  finally { processing.value = false }
}

async function approve(id: string) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/messages/${id}/approve`, { method: 'PUT' })
    const msg = messages.value.find(m => m.id === id)
    if (msg) msg.isApproved = true
    showToast('success', '已审核通过')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

async function togglePin(id: string, pinned: boolean) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/messages/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pinned })
    })
    const msg = messages.value.find(m => m.id === id)
    if (msg) msg.pinned = pinned
    showToast('success', pinned ? '已置顶' : '已取消置顶')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

async function toggleHide(id: string, hidden: boolean) {
  const reason = hidden ? prompt('请输入隐藏原因：') : ''
  if (hidden && reason === null) return
  if (hidden && !reason?.trim()) { showToast('error', '隐藏原因不能为空'); return }
  processing.value = true
  try {
    await adminFetch(`/api/admin/messages/${id}/hide`, {
      method: 'PUT',
      body: JSON.stringify({ hidden, reason: reason?.trim() }),
    })
    const msg = messages.value.find(m => m.id === id)
    if (msg) msg.isHidden = hidden
    showToast('success', hidden ? '已隐藏' : '已取消隐藏')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

async function remove(id: string) {
  if (!confirm('确定删除？')) return
  const reason = prompt('请输入删除原因：')
  if (reason === null) return
  if (!reason.trim()) { showToast('error', '删除原因不能为空'); return }
  processing.value = true
  try {
    await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: reason.trim() }) })
    messages.value = messages.value.filter(m => m.id !== id)
    showToast('success', '已删除')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

async function batchAction(action: string, hidden?: boolean) {
  if (action === 'delete' && !confirm(`确定删除选中的 ${selectedIds.value.length} 条留言？`)) return
  const needsReason = action === 'delete' || (action === 'hide' && hidden)
  const reason = needsReason ? prompt('请输入本次操作原因：') : ''
  if (needsReason && reason === null) return
  if (needsReason && !reason?.trim()) { showToast('error', '操作原因不能为空'); return }
  processing.value = true
  try {
    await adminFetch('/api/admin/messages/batch', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds.value, action, hidden, reason: reason?.trim() })
    })
    if (action === 'approve') {
      messages.value.forEach(m => {
        if (selectedIds.value.includes(m.id)) m.isApproved = true
      })
    } else if (action === 'hide') {
      messages.value.forEach(m => {
        if (selectedIds.value.includes(m.id)) m.isHidden = hidden!
      })
    } else if (action === 'delete') {
      messages.value = messages.value.filter(m => !selectedIds.value.includes(m.id))
    }
    showToast('success', '操作成功')
    selectedIds.value = []
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--spacing-md); }
.filter-tabs { display: flex; gap: var(--spacing-xs); }
.header-main-tabs { display: flex; align-items: center; gap: var(--spacing-lg); }
.tab-group-main { background-color: var(--color-surface-cream-strong); padding: 4px; border-radius: var(--rounded-pill); border: 1px solid var(--color-hairline); }
.tab-group-main .tab-btn { border: none; border-radius: var(--rounded-pill); padding: 6px 20px; font-weight: 500; transition: all 0.2s ease; }
.tab-group-main .tab-btn:hover:not(.active) { background-color: var(--color-surface-cream); color: var(--color-ink); }
.tab-btn-sm { padding: 4px 12px; font-size: var(--type-caption-size); }
.tab-btn { padding: 6px 16px; font-size: var(--type-body-sm-size); border: 1px solid var(--color-hairline); border-radius: var(--rounded-pill); background: transparent; cursor: pointer; color: var(--color-muted); }
.tab-btn.active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); }
.msg-list { display: flex; flex-direction: column; gap: var(--spacing-md); margin-top: var(--spacing-lg); }
.msg-card { padding: var(--spacing-lg); border-left: 4px solid transparent; transition: all 0.3s; }
.msg-pinned { border-left-color: var(--color-gold); background-color: color-mix(in srgb, var(--color-warning) 8%, var(--color-surface-cream)); }
.msg-card-inner {
  display: flex;
  gap: var(--spacing-md);
  align-items: flex-start;
}
.msg-select-col {
  padding-top: 4px;
}
.msg-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}
.msg-content-col {
  flex: 1;
}
.msg-meta { display: flex; gap: var(--spacing-md); flex-wrap: wrap; font-size: var(--type-caption-size); color: var(--color-muted); margin-bottom: var(--spacing-sm); }
.msg-content { font-size: var(--type-body-md-size); line-height: 1.6; margin-bottom: var(--spacing-sm); }
.msg-reactions-inline { margin-bottom: 8px; display: flex; gap: 6px; }
.react-badge { font-size: 12px; padding: 2px 8px; background: var(--color-surface-cream-strong); border-radius: var(--rounded-pill); }
.msg-reply-inline { font-size: 13px; padding: 8px 12px; background: color-mix(in srgb, var(--color-primary) 8%, transparent); border-left: 3px solid var(--color-primary); border-radius: var(--rounded-sm); margin-bottom: 8px; }
.msg-actions { display: flex; gap: var(--spacing-xs); }
.badge { padding: 2px 8px; border-radius: var(--rounded-pill); font-size: 11px; }
.badge-pending { background: var(--color-warning); color: white; }
.badge-hidden { background: var(--color-muted); color: white; }
.badge-pinned { background: var(--color-gold); color: #fff; font-weight: 600; }
.loading { text-align: center; padding: var(--spacing-xxl); color: var(--color-muted); }

.batch-actions-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  background-color: var(--color-surface-cream-strong);
  border: 1px solid var(--color-hairline);
  margin-top: var(--spacing-lg);
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}
.batch-count {
  font-size: var(--type-body-sm-size);
  color: var(--color-ink);
}
.batch-buttons {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}
.empty-notice {
  text-align: center;
  padding: var(--spacing-xxl) 0;
  color: var(--color-muted);
  font-size: var(--type-body-md-size);
}

@media (max-width: 600px) {
  .header-main-tabs {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
    width: 100%;
  }
  .tab-group-main {
    width: 100%;
    display: flex;
  }
  .tab-group-main .tab-btn {
    flex: 1;
    text-align: center;
  }
  .msg-card-inner {
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .msg-select-col {
    padding-top: 0;
  }
  .msg-meta {
    gap: var(--spacing-xs);
  }
  .msg-actions {
    width: 100%;
    flex-wrap: wrap;
    gap: var(--spacing-xxs);
  }
  .msg-actions .btn-sm {
    flex: 1;
    min-width: 80px;
    text-align: center;
  }
  .batch-actions-panel {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }
  .batch-buttons {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-xs);
  }
  .batch-buttons .btn-sm {
    width: 100%;
    text-align: center;
  }
}
</style>
