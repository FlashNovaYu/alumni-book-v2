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

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else class="msg-list">
      <div v-for="msg in filteredMessages" :key="msg.id" class="msg-card card">
        <div class="msg-meta">
          <span class="msg-student">学生: {{ msg.studentSlug }}</span>
          <span class="msg-author">留言者: {{ msg.authorName }}</span>
          <span class="msg-time">{{ msg.createdAt }}</span>
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
          <button v-if="!msg.isHidden" class="btn-secondary btn-sm" @click="toggleHide(msg.id, true)">隐藏</button>
          <button v-else class="btn-secondary btn-sm" @click="toggleHide(msg.id, false)">取消隐藏</button>
          <button class="btn-danger btn-sm" @click="remove(msg.id)">删除</button>
        </div>
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
  reactions?: Record<string, number>; reply?: string | null; replyAt?: string | null
}

const messages = ref<Message[]>([])
const filter = ref('pending')
const loading = ref(true)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const filteredMessages = computed(() => {
  if (filter.value === 'pending') return messages.value.filter(m => !m.isApproved)
  if (filter.value === 'approved') return messages.value.filter(m => m.isApproved)
  return messages.value
})

async function load() {
  try {
    const res = await adminFetch<{ success: boolean; data: Message[] }>('/api/admin/messages')
    if (res.data) messages.value = res.data
  } catch (e: any) {
    toast.value = { type: 'error', message: e.message }
  } finally { loading.value = false }
}

async function approve(id: string) {
  try {
    await adminFetch(`/api/admin/messages/${id}/approve`, { method: 'PUT' })
    const msg = messages.value.find(m => m.id === id)
    if (msg) msg.isApproved = true
    toast.value = { type: 'success', message: '已审核通过' }
  } catch (e: any) {
    toast.value = { type: 'error', message: e.message }
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
    toast.value = { type: 'success', message: hidden ? '已隐藏' : '已取消隐藏' }
  } catch (e: any) {
    toast.value = { type: 'error', message: e.message }
  }
}

async function remove(id: string) {
  if (!confirm('确定删除？')) return
  try {
    await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE' })
    messages.value = messages.value.filter(m => m.id !== id)
    toast.value = { type: 'success', message: '已删除' }
  } catch (e: any) {
    toast.value = { type: 'error', message: e.message }
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
.msg-card { padding: var(--spacing-lg); }
.msg-meta { display: flex; gap: var(--spacing-md); flex-wrap: wrap; font-size: var(--type-caption-size); color: var(--color-muted); margin-bottom: var(--spacing-sm); }
.msg-content { font-size: var(--type-body-md-size); line-height: 1.6; margin-bottom: var(--spacing-sm); }
.msg-reactions-inline { margin-bottom: 8px; display: flex; gap: 6px; }
.react-badge { font-size: 12px; padding: 2px 8px; background: var(--color-surface-cream-strong); border-radius: 10px; }
.msg-reply-inline { font-size: 13px; padding: 8px 12px; background: rgba(204,120,92,0.08); border-left: 3px solid var(--color-primary); border-radius: 4px; margin-bottom: 8px; }
.msg-actions { display: flex; gap: var(--spacing-xs); }
.badge { padding: 2px 8px; border-radius: var(--rounded-pill); font-size: 11px; }
.badge-pending { background: var(--color-warning); color: white; }
.badge-hidden { background: var(--color-muted); color: white; }
.btn-sm { height: 28px; padding: 0 10px; font-size: 12px; }
.loading { text-align: center; padding: var(--spacing-xxl); color: var(--color-muted); }
</style>
