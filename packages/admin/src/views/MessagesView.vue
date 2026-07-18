<template>
  <div class="messages-page">
    <header class="page-header">
      <div class="header-main-tabs">
        <h1 class="page-title">留言管理</h1>
        <div class="filter-tabs tab-group-main" role="tablist" aria-label="留言类型">
          <button :class="['tab-btn', { active: messageType === 'profile' }]" @click="changeMessageType('profile')">个人留言</button>
          <button :class="['tab-btn', { active: messageType === 'group' }]" @click="changeMessageType('group')">公共群聊</button>
          <button :class="['tab-btn', { active: messageType === 'legacy' }]" @click="changeMessageType('legacy')">历史公共投稿</button>
        </div>
      </div>
      <div v-if="messageType === 'profile'" class="filter-tabs tab-group-sub">
        <button :class="['tab-btn tab-btn-sm', { active: profileFilter === 'all' }]" @click="changeProfileFilter('all')">全部</button>
        <button :class="['tab-btn tab-btn-sm', { active: profileFilter === 'pending' }]" @click="changeProfileFilter('pending')">待审核</button>
        <button :class="['tab-btn tab-btn-sm', { active: profileFilter === 'approved' }]" @click="changeProfileFilter('approved')">已通过</button>
      </div>
      <div v-else-if="messageType === 'group'" class="filter-tabs tab-group-sub">
        <button v-for="option in groupFilters" :key="option.value" :class="['tab-btn tab-btn-sm', { active: groupFilter === option.value }]" @click="changeGroupFilter(option.value)">{{ option.label }}</button>
      </div>
    </header>

    <div v-if="canManage && messageType === 'profile' && selectedIds.length" class="batch-actions-panel card">
      <span class="batch-count">已选中 <strong>{{ selectedIds.length }}</strong> 条：</span>
      <div class="batch-buttons">
        <button class="btn-primary btn-sm" :disabled="processing" @click="batchAction('approve')">批量通过</button>
        <button class="btn-secondary btn-sm" :disabled="processing" @click="batchAction('hide', true)">批量隐藏</button>
        <button class="btn-secondary btn-sm" :disabled="processing" @click="batchAction('hide', false)">批量取消隐藏</button>
        <button class="btn-danger btn-sm" :disabled="processing" @click="batchAction('delete')">批量删除</button>
        <button class="btn-secondary btn-sm" :disabled="processing" @click="selectedIds = []">取消选择</button>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中…</div>

    <div v-else-if="messageType === 'profile'" class="msg-list">
      <article v-for="message in filteredMessages" :key="message.id" class="msg-card card" :class="{ 'msg-pinned': message.pinned }">
        <div class="msg-card-inner">
          <input v-if="canManage" v-model="selectedIds" :value="message.id" class="msg-checkbox" type="checkbox" :aria-label="`选择 ${message.authorName} 的留言`" />
          <div class="msg-content-col">
            <div class="msg-meta"><span>学生：{{ message.studentSlug }}</span><span>留言者：{{ message.authorName }}</span><time>{{ message.createdAt }}</time><span v-if="!message.isApproved" class="badge badge-pending">待审核</span><span v-if="message.isHidden" class="badge badge-hidden">已隐藏</span></div>
            <p class="msg-content">{{ message.content }}</p>
            <p v-if="message.reply" class="msg-reply-inline">回复：{{ message.reply }}</p>
            <div class="msg-actions">
              <button v-if="canManage && !message.isApproved" class="btn-primary btn-sm" :disabled="processing" @click="approve(message.id)">审核通过</button>
              <button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="togglePin(message.id, !message.pinned)">{{ message.pinned ? '取消置顶' : '置顶' }}</button>
              <button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="toggleHide(message.id, !message.isHidden)">{{ message.isHidden ? '取消隐藏' : '隐藏' }}</button>
              <button v-if="canManage" class="btn-danger btn-sm" :disabled="processing" @click="remove(message.id)">删除</button>
            </div>
          </div>
        </div>
      </article>
      <p v-if="!filteredMessages.length" class="empty-notice">没有找到对应的留言。</p>
    </div>

    <div v-else-if="messageType === 'group'" class="msg-list">
      <article v-for="message in groupMessages" :key="message.id" class="msg-card card" :data-status="message.status">
        <div class="msg-content-col">
          <div class="msg-meta"><span>同学：{{ message.author.name }}</span><span>{{ message.author.slug }}</span><time>{{ message.createdAt }}</time><span class="badge" :class="`badge-${message.status}`">{{ groupStatusLabel(message.status) }}</span></div>
          <p class="msg-content">{{ message.content || '这条消息已撤回。' }}</p>
          <p v-if="message.moderationReason" class="msg-reply-inline">治理原因：{{ message.moderationReason }}</p>
          <div class="msg-actions">
            <button v-if="canManage && message.status === 'visible'" class="btn-secondary btn-sm" :disabled="processing" @click="openModeration('hide', message)">隐藏</button>
            <button v-if="canManage && message.status === 'hidden'" class="btn-secondary btn-sm" :disabled="processing" @click="openModeration('restore', message)">恢复</button>
            <button v-if="canManage && (message.status === 'visible' || message.status === 'hidden')" class="btn-danger btn-sm" :disabled="processing" @click="openModeration('recall', message)">管理员撤回</button>
            <button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="openModeration('mute', message)">禁言</button>
            <button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="unmute(message)">解除禁言</button>
          </div>
        </div>
      </article>
      <p v-if="!groupMessages.length" class="empty-notice">当前筛选条件下没有群聊消息。</p>
    </div>

    <div v-else class="msg-list">
      <article v-for="message in legacyMessages" :key="message.id" class="msg-card card">
        <div class="msg-content-col">
          <div class="msg-meta"><span>投稿者：{{ message.authorName }}</span><span>{{ message.authorSlug }}</span><time>{{ message.createdAt }}</time><span class="badge" :class="`badge-${message.status}`">{{ message.status }}</span><span v-if="message.pinned" class="badge">已置顶</span><span v-if="message.featured" class="badge">已精选</span><span v-if="message.reviewedBy">审核人：{{ message.reviewedBy }}</span></div>
          <p class="msg-content">{{ message.content }}</p>
          <p v-if="message.reviewReason" class="msg-reply-inline">审核说明：{{ message.reviewReason }}</p>
          <div class="msg-actions">
            <button v-if="canManage && message.status === 'pending'" class="btn-primary btn-sm" :disabled="processing" @click="approveLegacy(message.id)">审核通过</button>
            <button v-if="canManage && message.status === 'pending'" class="btn-danger btn-sm" :disabled="processing" @click="rejectLegacy(message.id)">退回</button>
            <button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="togglePublicPin(message.id, !message.pinned)">{{ message.pinned ? '取消置顶' : '置顶' }}</button>
            <button v-if="canManage" class="btn-secondary btn-sm" :disabled="processing" @click="togglePublicFeature(message.id, !message.featured)">{{ message.featured ? '取消精选' : '精选' }}</button>
            <button v-if="canManage && (message.status === 'approved' || message.status === 'hidden')" class="btn-secondary btn-sm" :disabled="processing" @click="togglePublicHide(message.id, message.status !== 'hidden')">{{ message.status === 'hidden' ? '恢复' : '隐藏' }}</button>
            <button v-if="canManage" class="btn-danger btn-sm" :disabled="processing" @click="removePublic(message.id)">删除</button>
          </div>
        </div>
      </article>
      <p v-if="!legacyMessages.length" class="empty-notice">没有历史公共投稿。</p>
    </div>
    <button v-if="nextCursor" class="btn-secondary load-more" :disabled="loadingMore" @click="load()">
      {{ loadingMore ? '加载中…' : `加载更多（已显示 ${currentListLength}${total !== null ? `/${total}` : ''}）` }}
    </button>

    <div v-if="moderation" class="modal-backdrop" @click.self="closeModeration">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="moderation-title">
        <h2 id="moderation-title">{{ moderationTitle }}</h2>
        <p>{{ moderation.message.author.name }}：{{ moderation.message.content || '已撤回消息' }}</p>
        <label>治理原因<textarea v-model="moderationReason" class="textarea" maxlength="240" autofocus /></label>
        <label v-if="moderation.kind === 'mute'">禁言时长<select v-model="muteDuration" class="text-input"><option value="permanent">永久禁言</option><option value="day">24 小时</option><option value="week">7 天</option></select></label>
        <div class="modal-actions"><button class="btn-secondary" type="button" @click="closeModeration">取消</button><button class="btn-danger" type="button" :disabled="processing || !moderationReason.trim()" @click="submitModeration">确认{{ moderationTitle }}</button></div>
      </section>
    </div>

    <Transition name="toast"><p v-if="toast" :class="['toast', `toast-${toast.type}`]">{{ toast.message }}</p></Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { adminFetch, getCurrentAdmin } from '@/api/client'
import { RequestLifecycle } from '@/api/requestLifecycle'
import { appendUniquePage, DEFAULT_PAGE_SIZE, normalizePageResult, pageSearchParams } from '@/api/pagination'
import { listProfileMessages, type ProfileMessage } from '@/api/messages'
import {
  fetchGroupChatMessages,
  muteClassmate,
  recallGroupChatMessage,
  setGroupChatHidden,
  unmuteClassmate,
  type AdminGroupChatMessage,
  type AdminGroupChatStatus,
} from '@/api/community'

interface LegacyMessage { id: string; authorSlug: string; authorName: string; content: string; status: 'pending' | 'approved' | 'rejected' | 'hidden'; reviewReason?: string | null; reviewedBy?: string | null; reviewedAt?: string | null; featured: boolean; pinned: boolean; createdAt: string }
type MessageType = 'profile' | 'group' | 'legacy'
type ModerationKind = 'hide' | 'restore' | 'recall' | 'mute'

const messages = ref<ProfileMessage[]>([])
const legacyMessages = ref<LegacyMessage[]>([])
const groupMessages = ref<AdminGroupChatMessage[]>([])
const route = useRoute()
const messageType = ref<MessageType>(route.query.tab === 'group' ? 'group' : 'profile')
const profileFilter = ref<'all' | 'pending' | 'approved'>('pending')
const groupFilter = ref<'all' | AdminGroupChatStatus>('all')
const loading = ref(true)
const processing = ref(false)
const selectedIds = ref<string[]>([])
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const moderation = ref<{ kind: ModerationKind; message: AdminGroupChatMessage } | null>(null)
const moderationReason = ref('')
const muteDuration = ref<'permanent' | 'day' | 'week'>('permanent')
const nextCursor = ref<string | null>(null)
const total = ref<number | null>(null)
const loadingMore = ref(false)
const groupFilters: Array<{ value: 'all' | AdminGroupChatStatus; label: string }> = [
  { value: 'all', label: '全部' }, { value: 'visible', label: '最新' }, { value: 'hidden', label: '已隐藏' }, { value: 'recalled_by_admin', label: '管理员撤回' }, { value: 'recalled_by_author', label: '同学撤回' },
]
const canManage = computed(() => {
  const admin = getCurrentAdmin()
  return !!admin && (admin.isOwner || admin.permissions.includes('moderation.manage'))
})

let toastTimer: ReturnType<typeof setTimeout> | null = null
let loadVersion = 0
const requestLifecycle = new RequestLifecycle()
const filteredMessages = computed(() => profileFilter.value === 'all' ? messages.value : messages.value.filter((message) => profileFilter.value === 'pending' ? !message.isApproved : message.isApproved))
const currentListLength = computed(() => messageType.value === 'profile' ? filteredMessages.value.length : messageType.value === 'group' ? groupMessages.value.length : legacyMessages.value.length)
const moderationTitle = computed(() => ({ hide: '隐藏群聊消息', restore: '恢复群聊消息', recall: '撤回群聊消息', mute: '禁言同学' }[moderation.value?.kind || 'hide']))

function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

function groupStatusLabel(status: AdminGroupChatStatus) {
  return ({ visible: '正常显示', hidden: '已隐藏', recalled_by_author: '同学撤回', recalled_by_admin: '管理员撤回' }[status])
}

async function load(reset = false) {
  const activeType = messageType.value
  const version = ++loadVersion
  if (reset) {
    nextCursor.value = null
    selectedIds.value = []
  }
  const cursor = reset ? null : nextCursor.value
  const controller = requestLifecycle.begin()
  loading.value = true
  loadingMore.value = !reset
  try {
    if (activeType === 'profile') {
      const page = await listProfileMessages(profileFilter.value, cursor, controller.signal)
      if (version === loadVersion && messageType.value === activeType) requestLifecycle.commit(controller, () => {
        const merged = reset ? { items: page.items, added: page.items.length } : appendUniquePage(messages.value, page.items, (message) => message.id)
        messages.value = merged.items
        nextCursor.value = merged.added === 0 && !reset ? null : page.nextCursor
        total.value = page.total
      })
    }
    if (activeType === 'group') {
      const page = await fetchGroupChatMessages(groupFilter.value === 'all' ? undefined : groupFilter.value, cursor, controller.signal)
      if (version === loadVersion && messageType.value === activeType) requestLifecycle.commit(controller, () => {
        const merged = reset ? { items: page.items, added: page.items.length } : appendUniquePage(groupMessages.value, page.items, (message) => message.id)
        groupMessages.value = merged.items
        nextCursor.value = merged.added === 0 && !reset ? null : page.nextCursor
        total.value = page.total
      })
    }
    if (activeType === 'legacy') {
      const query = pageSearchParams(DEFAULT_PAGE_SIZE, cursor)
      const result = await adminFetch<{ data?: LegacyMessage[] | { items: LegacyMessage[]; nextCursor: string | null; total: number } }>(`/api/admin/public-messages?${query}`, { signal: controller.signal })
      const page = normalizePageResult(result.data, DEFAULT_PAGE_SIZE, cursor)
      if (version === loadVersion && messageType.value === activeType) requestLifecycle.commit(controller, () => {
        const merged = reset ? { items: page.items, added: page.items.length } : appendUniquePage(legacyMessages.value, page.items, (message) => message.id)
        legacyMessages.value = merged.items
        nextCursor.value = merged.added === 0 && !reset ? null : page.nextCursor
        total.value = page.total
      })
    }
  } catch (error) {
    if (version === loadVersion && messageType.value === activeType && requestLifecycle.shouldReport(error, controller)) showToast('error', error instanceof Error ? error.message : '留言加载失败')
  } finally {
    if (version === loadVersion && messageType.value === activeType && requestLifecycle.finish(controller)) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function changeMessageType(type: MessageType) { messageType.value = type; void load(true) }
function changeProfileFilter(filter: 'all' | 'pending' | 'approved') { profileFilter.value = filter; void load(true) }
function changeGroupFilter(filter: 'all' | AdminGroupChatStatus) { groupFilter.value = filter; void load(true) }
function replaceGroupMessage(next: AdminGroupChatMessage) { groupMessages.value = groupMessages.value.map((message) => message.id === next.id ? next : message) }
function openModeration(kind: ModerationKind, message: AdminGroupChatMessage) { moderation.value = { kind, message }; moderationReason.value = ''; muteDuration.value = 'permanent' }
function closeModeration() { if (!processing.value) moderation.value = null }

async function submitModeration() {
  const action = moderation.value
  const reason = moderationReason.value.trim()
  if (!action || !reason) return
  processing.value = true
  try {
    if (action.kind === 'hide') replaceGroupMessage(await setGroupChatHidden(action.message.id, true, reason))
    if (action.kind === 'restore') replaceGroupMessage(await setGroupChatHidden(action.message.id, false, reason))
    if (action.kind === 'recall') replaceGroupMessage(await recallGroupChatMessage(action.message.id, reason))
    if (action.kind === 'mute') {
      const mutedUntil = muteDuration.value === 'permanent' ? null : new Date(Date.now() + (muteDuration.value === 'day' ? 86_400_000 : 604_800_000)).toISOString()
      await muteClassmate(action.message.author.slug, reason, mutedUntil)
    }
    showToast('success', `${moderationTitle.value}已完成`)
    moderation.value = null
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '治理操作失败')
  } finally {
    processing.value = false
  }
}

async function unmute(message: AdminGroupChatMessage) {
  if (!window.confirm(`确认解除 ${message.author.name} 的禁言？`)) return
  processing.value = true
  try { await unmuteClassmate(message.author.slug); showToast('success', '已解除禁言') } catch (error) { showToast('error', error instanceof Error ? error.message : '解除禁言失败') } finally { processing.value = false }
}

async function approveLegacy(id: string) {
  processing.value = true
  try { await adminFetch(`/api/admin/public-messages/${id}/approve`, { method: 'PUT' }); const item = legacyMessages.value.find((message) => message.id === id); if (item) item.status = 'approved'; showToast('success', '已审核通过') } catch (error) { showToast('error', error instanceof Error ? error.message : '审核失败') } finally { processing.value = false }
}
async function rejectLegacy(id: string) {
  const reason = window.prompt('请输入退回原因：')?.trim()
  if (!reason) return
  processing.value = true
  try { await adminFetch(`/api/admin/public-messages/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) }); const item = legacyMessages.value.find((message) => message.id === id); if (item) { item.status = 'rejected'; item.reviewReason = reason }; showToast('success', '已退回投稿') } catch (error) { showToast('error', error instanceof Error ? error.message : '退回失败') } finally { processing.value = false }
}
async function togglePublicHide(id: string, hidden: boolean) {
  const reason = hidden ? window.prompt('请输入隐藏原因：')?.trim() : ''
  if (hidden && !reason) return
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/hide`, { method: 'PUT', body: JSON.stringify({ hidden, reason }) })
    const item = legacyMessages.value.find(message => message.id === id)
    if (item) item.status = hidden ? 'hidden' : 'approved'
    showToast('success', hidden ? '已隐藏' : '已恢复')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '操作失败')
  } finally {
    processing.value = false
  }
}

async function togglePublicPin(id: string, pinned: boolean) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) })
    const item = legacyMessages.value.find(message => message.id === id)
    if (item) item.pinned = pinned
    showToast('success', pinned ? '已置顶' : '已取消置顶')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '操作失败')
  } finally {
    processing.value = false
  }
}

async function togglePublicFeature(id: string, featured: boolean) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/feature`, { method: 'PUT', body: JSON.stringify({ featured }) })
    const item = legacyMessages.value.find(message => message.id === id)
    if (item) item.featured = featured
    showToast('success', featured ? '已精选' : '已取消精选')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '操作失败')
  } finally {
    processing.value = false
  }
}

async function removePublic(id: string) {
  const reason = window.prompt('请输入删除原因：')?.trim()
  if (!reason) return
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) })
    legacyMessages.value = legacyMessages.value.filter((message) => message.id !== id)
    showToast('success', '历史投稿已删除')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '删除失败')
  } finally {
    processing.value = false
  }
}
async function approve(id: string) { processing.value = true; try { await adminFetch(`/api/admin/messages/${id}/approve`, { method: 'PUT' }); const item = messages.value.find((message) => message.id === id); if (item) item.isApproved = true; showToast('success', '已审核通过') } catch (error) { showToast('error', error instanceof Error ? error.message : '审核失败') } finally { processing.value = false } }
async function togglePin(id: string, pinned: boolean) { processing.value = true; try { await adminFetch(`/api/admin/messages/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) }); const item = messages.value.find((message) => message.id === id); if (item) item.pinned = pinned; showToast('success', pinned ? '已置顶' : '已取消置顶') } catch (error) { showToast('error', error instanceof Error ? error.message : '置顶失败') } finally { processing.value = false } }
async function toggleHide(id: string, hidden: boolean) {
  const reason = window.prompt(`请输入${hidden ? '隐藏' : '恢复'}原因：`)?.trim()
  if (!reason) return
  processing.value = true
  try { await adminFetch(`/api/admin/messages/${id}/hide`, { method: 'PUT', body: JSON.stringify({ hidden, reason }) }); const item = messages.value.find((message) => message.id === id); if (item) item.isHidden = hidden; showToast('success', hidden ? '已隐藏' : '已取消隐藏') } catch (error) { showToast('error', error instanceof Error ? error.message : '隐藏失败') } finally { processing.value = false }
}
async function remove(id: string) {
  const reason = window.prompt('请输入删除原因：')?.trim()
  if (!reason) return
  processing.value = true
  try { await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }); messages.value = messages.value.filter((message) => message.id !== id); showToast('success', '已删除') } catch (error) { showToast('error', error instanceof Error ? error.message : '删除失败') } finally { processing.value = false }
}
async function batchAction(action: string, hidden?: boolean) {
  const reason = action === 'approve' ? undefined : window.prompt('请输入批量操作原因：')?.trim()
  if (action !== 'approve' && !reason) return
  processing.value = true
  try { await adminFetch('/api/admin/messages/batch', { method: 'POST', body: JSON.stringify({ ids: selectedIds.value, action, hidden, reason }) }); if (action === 'approve') messages.value.forEach((message) => { if (selectedIds.value.includes(message.id)) message.isApproved = true }); if (action === 'hide') messages.value.forEach((message) => { if (selectedIds.value.includes(message.id)) message.isHidden = Boolean(hidden) }); if (action === 'delete') messages.value = messages.value.filter((message) => !selectedIds.value.includes(message.id)); selectedIds.value = []; showToast('success', '操作成功') } catch (error) { showToast('error', error instanceof Error ? error.message : '批量操作失败') } finally { processing.value = false }
}

watch(() => route.query.tab, (tab) => {
  const type: MessageType = tab === 'group' ? 'group' : 'profile'
  if (type !== messageType.value) changeMessageType(type)
})

onMounted(() => { void load(true) })
onBeforeUnmount(() => { requestLifecycle.abort(); if (toastTimer) clearTimeout(toastTimer) })
</script>

<style scoped>
.messages-page { display: grid; gap: var(--spacing-lg); }
.page-header { display: grid; gap: var(--spacing-md); margin: 0; }
.header-main-tabs { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacing-lg); }
.filter-tabs { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); }
.tab-group-main { padding: 3px; background: var(--color-surface-cream-strong); border: 1px solid var(--color-hairline); border-radius: var(--rounded-md); }
.tab-btn { min-height: 34px; padding: 0 var(--spacing-md); color: var(--color-muted); border: 1px solid var(--color-hairline); border-radius: var(--rounded-sm); font: inherit; font-size: var(--type-body-sm-size); cursor: pointer; }
.tab-group-main .tab-btn { border-color: transparent; }
.tab-btn.active { color: var(--color-on-primary); background: var(--color-primary); border-color: var(--color-primary); }
.tab-btn-sm { min-height: 30px; padding: 0 var(--spacing-sm); }
.batch-actions-panel { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md); padding: var(--spacing-md) var(--spacing-lg); }
.batch-buttons, .msg-actions { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); }
.load-more { justify-self: center; }
.loading, .empty-notice { padding: var(--spacing-xxl); color: var(--color-muted); text-align: center; }
.msg-list { display: grid; gap: var(--spacing-md); }
.msg-card { padding: var(--spacing-lg); border-left: 4px solid transparent; }
.msg-card[data-status="hidden"] { border-left-color: var(--color-warning); }
.msg-card[data-status^="recalled"] { border-left-color: var(--color-error); }
.msg-pinned { border-left-color: var(--color-gold); }
.msg-card-inner { display: flex; align-items: flex-start; gap: var(--spacing-md); }
.msg-checkbox { width: 18px; height: 18px; margin-top: 3px; }
.msg-content-col { min-width: 0; flex: 1; }
.msg-meta { display: flex; flex-wrap: wrap; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); color: var(--color-muted); font-size: var(--type-caption-size); }
.msg-content { margin: 0 0 var(--spacing-sm); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
.msg-reply-inline { margin: 0 0 var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); color: var(--color-muted); background: var(--color-surface-cream-strong); border-left: 3px solid var(--color-primary); font-size: var(--type-body-sm-size); overflow-wrap: anywhere; }
.badge { padding: 2px 7px; color: #fff; background: var(--color-muted); border-radius: var(--rounded-sm); font-size: 11px; }
.badge-pending { background: var(--color-warning); }.badge-visible { background: var(--color-success); }.badge-hidden { background: var(--color-muted); }.badge-recalled_by_admin, .badge-recalled_by_author, .badge-rejected { background: var(--color-error); }.badge-approved { background: var(--color-success); }
.modal-backdrop { position: fixed; inset: 0; z-index: var(--z-modal); display: grid; padding: var(--spacing-lg); place-items: center; background: rgba(25, 21, 17, 0.4); }
.modal { display: grid; width: min(520px, 100%); gap: var(--spacing-md); padding: var(--spacing-xl); background: var(--color-surface-card); border-radius: var(--rounded-md); box-shadow: var(--shadow-elevated); }
.modal h2, .modal p { margin: 0; }.modal p { color: var(--color-muted); line-height: 1.55; }.modal label { display: grid; gap: var(--spacing-xs); color: var(--color-muted); font-size: var(--type-body-sm-size); }.modal-actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); }
@media (max-width: 600px) { .header-main-tabs, .batch-actions-panel { align-items: stretch; flex-direction: column; }.tab-group-main { width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }.tab-btn { padding: 0 var(--spacing-xs); }.batch-buttons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }.msg-card { padding: var(--spacing-md); }.msg-card-inner { gap: var(--spacing-sm); }.msg-actions .btn-sm { flex: 1; }.modal { padding: var(--spacing-lg); } }
</style>
