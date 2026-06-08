<template>
  <div class="messages-page">
    <div class="page-header">
      <h1 class="page-title">留言管理</h1>
      <div class="filter-tabs">
        <button :class="['tab-btn', { active: filter === 'all' }]" @click="filter = 'all'">全部</button>
        <button :class="['tab-btn', { active: filter === 'pending' }]" @click="filter = 'pending'">待审核</button>
        <button :class="['tab-btn', { active: filter === 'approved' }]" @click="filter = 'approved'">已通过</button>
      </div>
    </div>

    <!-- 批量操作区 -->
    <div v-if="selectedIds.length > 0" class="batch-actions-panel card">
      <span class="batch-count">已选中 <strong>{{ selectedIds.length }}</strong> 条：</span>
      <div class="batch-buttons">
        <button class="btn-primary btn-sm" @click="batchAction('approve')">批量通过</button>
        <button class="btn-secondary btn-sm" @click="batchAction('hide', true)">批量隐藏</button>
        <button class="btn-secondary btn-sm" @click="batchAction('hide', false)">批量取消隐藏</button>
        <button class="btn-danger btn-sm" @click="batchAction('delete')">批量删除</button>
        <button class="btn-secondary btn-sm" @click="selectedIds = []">取消选择</button>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else class="msg-list">
      <div v-for="msg in filteredMessages" :key="msg.id" class="msg-card card" :class="{ 'msg-pinned': msg.pinned }">
        <div class="msg-card-inner">
          <!-- 选择框 -->
          <div class="msg-select-col">
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
              <button v-if="!msg.isApproved" class="btn-primary btn-sm" @click="approve(msg.id)">审核通过</button>
              <button class="btn-secondary btn-sm" @click="togglePin(msg.id, !msg.pinned)">
                {{ msg.pinned ? '取消置顶' : '置顶' }}
              </button>
              <button v-if="!msg.isHidden" class="btn-secondary btn-sm" @click="toggleHide(msg.id, true)">隐藏</button>
              <button v-else class="btn-secondary btn-sm" @click="toggleHide(msg.id, false)">取消隐藏</button>
              <button class="btn-danger btn-sm" @click="remove(msg.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="filteredMessages.length === 0" class="empty-notice">
        没有找到对应的留言
      </div>
    </div>

    <Transition name="toast">
      <div v-if="toast" :class="'toast toast-' + toast.type">{{ toast.message }}</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { adminFetch } from '@/api/client'

interface Message {
  id: string; studentSlug: string; authorName: string; content: string
  isApproved: boolean; isHidden: boolean; createdAt: string
  pinned: boolean; cardStyle: string
  reactions?: Record<string, number>; reply?: string | null; replyAt?: string | null
}

const messages = ref<Message[]>([])
const filter = ref('pending')
const loading = ref(true)
const selectedIds = ref<string[]>([])
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  setTimeout(() => { toast.value = null }, 3000)
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

async function load() {
  try {
    const res = await adminFetch<{ success: boolean; data: Message[] }>('/api/admin/messages')
    if (res.data) messages.value = res.data
  } catch (e: any) {
    showToast('error', e.message)
  } finally { loading.value = false }
}

async function approve(id: string) {
  try {
    await adminFetch(`/api/admin/messages/${id}/approve`, { method: 'PUT' })
    const msg = messages.value.find(m => m.id === id)
    if (msg) msg.isApproved = true
    showToast('success', '已审核通过')
  } catch (e: any) {
    showToast('error', e.message)
  }
}

async function togglePin(id: string, pinned: boolean) {
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
  }
}

async function toggleHide(id: string, hidden: boolean) {
  try {
    await adminFetch(`/api/admin/messages/${id}/hide`, {
      method: 'PUT',
      body: JSON.stringify({ hidden }),
    })
    const msg = messages.value.find(m => m.id === id)
    if (msg) msg.isHidden = hidden
    showToast('success', hidden ? '已隐藏' : '已取消隐藏')
  } catch (e: any) {
    showToast('error', e.message)
  }
}

async function remove(id: string) {
  if (!confirm('确定删除？')) return
  try {
    await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE' })
    messages.value = messages.value.filter(m => m.id !== id)
    showToast('success', '已删除')
  } catch (e: any) {
    showToast('error', e.message)
  }
}

async function batchAction(action: string, hidden?: boolean) {
  if (action === 'delete' && !confirm(`确定删除选中的 ${selectedIds.value.length} 条留言？`)) return
  try {
    await adminFetch('/api/admin/messages/batch', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds.value, action, hidden })
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
  }
}

onMounted(load)
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--spacing-md); }
.filter-tabs { display: flex; gap: var(--spacing-xs); }
.tab-btn {
  padding: 6px 16px;
  font-size: var(--type-body-sm-size);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-pill);
  background: transparent;
  cursor: pointer;
  color: var(--color-muted);
}
.tab-btn.active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); }
.msg-list { display: flex; flex-direction: column; gap: var(--spacing-md); margin-top: var(--spacing-lg); }
.msg-card { padding: var(--spacing-lg); border-left: 4px solid transparent; transition: all 0.3s; }
.msg-pinned {
  border-left-color: #ffd700;
  background-color: #fffde7;
}
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
.react-badge { font-size: 12px; padding: 2px 8px; background: var(--color-surface-cream-strong); border-radius: 10px; }
.msg-reply-inline { font-size: 13px; padding: 8px 12px; background: rgba(204,120,92,0.08); border-left: 3px solid var(--color-primary); border-radius: 4px; margin-bottom: 8px; }
.msg-actions { display: flex; gap: var(--spacing-xs); }
.badge { padding: 2px 8px; border-radius: var(--rounded-pill); font-size: 11px; }
.badge-pending { background: var(--color-warning); color: white; }
.badge-hidden { background: var(--color-muted); color: white; }
.badge-pinned { background: #ffd700; color: #5d4037; font-weight: 600; }
.btn-sm { height: 28px; padding: 0 10px; font-size: 12px; cursor: pointer; }
.loading { text-align: center; padding: var(--spacing-xxl); color: var(--color-muted); }

.batch-actions-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  background-color: var(--color-surface-cream-strong, #eedfd4);
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

</style>
