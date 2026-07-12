<template>
  <div class="notification-center">
    <header class="page-header">
      <h1 class="page-title">通知中心</h1>
      <p>向指定同学或全班发送站内通知。</p>
    </header>

    <section v-if="canPublish" class="card notification-composer">
      <div class="notice-mode-tabs" role="tablist" aria-label="通知范围">
        <button type="button" role="tab" :aria-selected="audience === 'single'" :tabindex="audience === 'single' ? 0 : -1" @click="audience = 'single'">单人通知</button>
        <button type="button" role="tab" :aria-selected="audience === 'all'" :tabindex="audience === 'all' ? 0 : -1" @click="audience = 'all'">全班通知</button>
      </div>

      <form class="notice-form" @submit.prevent="send">
        <label v-if="audience === 'single'">
          收件同学
          <select v-model="form.recipientSlug" class="text-input" :disabled="recipientLoading">
            <option value="">{{ recipientLoading ? '正在载入同学名单…' : '请选择同学' }}</option>
            <option v-for="student in recipients" :key="student.slug" :value="student.slug">{{ student.name }}（{{ student.slug }}）</option>
          </select>
        </label>
        <label>
          标题
          <input v-model="form.title" class="text-input" maxlength="80" required />
        </label>
        <label>
          正文
          <textarea v-model="form.body" class="textarea notice-body" maxlength="2000" required />
        </label>
        <div class="actions">
          <button class="btn-primary" :disabled="sending || !canSend">{{ sending ? '发送中…' : audience === 'all' ? '发送全班通知' : '发送通知' }}</button>
        </div>
      </form>
      <p v-if="toast" :class="['toast-inline', toast.type]">{{ toast.message }}</p>
    </section>
    <section v-else class="card permission-notice">当前账号可以查看通知记录，但没有发布通知的权限。</section>

    <section class="card notification-history" aria-labelledby="notice-history-title">
      <header>
        <div>
          <h2 id="notice-history-title">发送记录</h2>
          <p>按一条通知的收件范围汇总已读情况。</p>
        </div>
        <button class="btn-secondary btn-sm" type="button" :disabled="historyLoading" @click="loadHistory">刷新</button>
      </header>
      <p v-if="historyError" class="history-error" role="alert">{{ historyError }}</p>
      <div v-else-if="historyLoading" class="history-empty">正在读取通知记录…</div>
      <div v-else-if="!history.length" class="history-empty">还没有发送过管理员通知。</div>
      <div v-else class="history-table-wrap">
        <table>
          <thead><tr><th>标题</th><th>发送时间</th><th>收件人</th><th>已读</th></tr></thead>
          <tbody>
            <tr v-for="item in history" :key="item.relatedId">
              <td>{{ item.title }}</td>
              <td>{{ formatDate(item.createdAt) }}</td>
              <td>{{ item.recipientCount }}</td>
              <td>{{ item.readCount }} / {{ item.recipientCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  broadcastAdminNotification,
  fetchAdminNotificationHistory,
  fetchNotificationRecipients,
  sendAdminNotification,
  type NotificationHistoryItem,
  type NotificationRecipient,
} from '@/api/community'
import { getCurrentAdmin } from '@/api/client'

const audience = ref<'single' | 'all'>('single')
const sending = ref(false)
const recipientLoading = ref(false)
const historyLoading = ref(false)
const historyError = ref<string | null>(null)
const recipients = ref<NotificationRecipient[]>([])
const history = ref<NotificationHistoryItem[]>([])
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const form = reactive({ recipientSlug: '', title: '', body: '' })
const canPublish = computed(() => {
  const admin = getCurrentAdmin()
  return !!admin && (admin.isOwner || admin.permissions.includes('notifications.publish'))
})
const canSend = computed(() => canPublish.value && Boolean(form.title.trim() && form.body.trim() && (audience.value === 'all' || form.recipientSlug)))

let toastTimeout: ReturnType<typeof setTimeout> | null = null
let historyRequest = 0
function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.value = null }, 3000)
}

async function loadRecipients() {
  recipientLoading.value = true
  try {
    recipients.value = await fetchNotificationRecipients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '同学名单加载失败')
  } finally {
    recipientLoading.value = false
  }
}

async function loadHistory() {
  const request = ++historyRequest
  historyLoading.value = true
  historyError.value = null
  try {
    const result = await fetchAdminNotificationHistory()
    if (request === historyRequest) history.value = result.items
  } catch (error) {
    if (request === historyRequest) historyError.value = error instanceof Error ? error.message : '通知记录加载失败'
  } finally {
    if (request === historyRequest) historyLoading.value = false
  }
}

async function send() {
  if (!canSend.value) return
  if (audience.value === 'all' && !window.confirm('确认向全班发送这条通知？')) return

  sending.value = true
  try {
    const title = form.title.trim()
    const body = form.body.trim()
    const result = audience.value === 'all'
      ? await broadcastAdminNotification({ title, body })
      : await sendAdminNotification({ recipientSlug: form.recipientSlug, title, body })
    form.title = ''
    form.body = ''
    if (audience.value === 'single') form.recipientSlug = ''
    showToast('success', `通知已发送给 ${result.sentCount} 位同学`)
    await loadHistory()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '通知发送失败')
  } finally {
    sending.value = false
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  if (canPublish.value) void loadRecipients()
  void loadHistory()
})
</script>

<style scoped>
.notification-center { display: grid; gap: var(--spacing-xl); max-width: 980px; }
.page-header { margin: 0; }
.page-header p, .notification-history header p { margin: var(--spacing-xs) 0 0; color: var(--color-muted); font-size: var(--type-body-sm-size); }
.notification-composer { display: grid; gap: var(--spacing-lg); }
.notice-mode-tabs { display: inline-flex; width: fit-content; padding: 3px; background: var(--color-surface-cream-strong); border: 1px solid var(--color-hairline); border-radius: var(--rounded-md); }
.notice-mode-tabs button { min-height: 36px; padding: 0 var(--spacing-md); color: var(--color-muted); border-radius: var(--rounded-sm); font: inherit; font-size: var(--type-body-sm-size); font-weight: 600; }
.notice-mode-tabs button[aria-selected="true"] { color: var(--color-on-primary); background: var(--color-primary); }
.notice-form { display: grid; gap: var(--spacing-md); }
.notice-form label { display: grid; gap: var(--spacing-xs); color: var(--color-muted); font-size: var(--type-body-sm-size); }
.notice-body { min-height: 180px; }
.actions { display: flex; justify-content: flex-end; }
.toast-inline { margin: 0; font-size: var(--type-body-sm-size); }
.toast-inline.success { color: var(--color-success); }
.toast-inline.error, .history-error { color: var(--color-error); }
.notification-history { display: grid; gap: var(--spacing-lg); }
.notification-history header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--spacing-md); }
.notification-history h2 { margin: 0; color: var(--color-ink); font-family: var(--font-display); font-size: var(--type-display-xs-size); }
.history-empty { padding: var(--spacing-xl) 0; color: var(--color-muted); text-align: center; }
.history-table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: var(--type-body-sm-size); }
th, td { padding: var(--spacing-sm); border-bottom: 1px solid var(--color-hairline); text-align: left; white-space: nowrap; }
th { color: var(--color-muted); font-weight: 600; }
td:first-child { min-width: 180px; white-space: normal; }
@media (max-width: 600px) {
  .notification-center { gap: var(--spacing-lg); }
  .notification-composer, .notification-history { padding: var(--spacing-lg); }
  .notice-mode-tabs { width: 100%; }
  .notice-mode-tabs button { flex: 1; }
}
</style>
