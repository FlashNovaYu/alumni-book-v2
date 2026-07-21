<template>
  <section class="audit-page">
    <header class="page-header"><div><p class="eyebrow">主管理员专属</p><h1 class="page-title">操作日志</h1><p class="intro">记录关键管理操作，不包含密码和会话令牌。</p></div></header>

    <form class="card filters" @submit.prevent="load(true)">
      <label>操作人<select v-model="filters.actorId" class="text-input"><option value="">全部管理员</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.displayName }}</option></select></label>
      <label>操作动作<input v-model.trim="filters.action" class="text-input" placeholder="如：admin_account.disable" /></label>
      <label>资源类型<input v-model.trim="filters.resourceType" class="text-input" placeholder="如：admin_account" /></label>
      <label>开始日期<CalendarDatePicker v-model="filters.from" /></label>
      <label>结束日期<CalendarDatePicker v-model="filters.to" /></label>
      <div class="filter-actions"><button type="button" class="btn-secondary" @click="resetFilters">重置</button><button class="btn-primary" :disabled="loading">筛选</button></div>
    </form>

    <div class="card audit-card">
      <p v-if="loading">正在加载日志…</p>
      <div v-else-if="!logs.length" class="empty">没有符合当前条件的管理操作记录。</div>
      <ol v-else class="audit-list">
        <li v-for="log in logs" :key="log.id">
          <div class="log-heading"><strong>{{ log.admin_display_name }} {{ summaryOf(log).title }}</strong><time>{{ formatDate(log.created_at) }}</time></div>
          <p v-if="summaryOf(log).detail" class="resource">{{ summaryOf(log).detail }}</p>
          <p v-if="summaryOf(log).reason">原因：{{ summaryOf(log).reason }}</p>
          <details v-if="log.before_summary || log.after_summary || hasMetadata(log.metadata)">
            <summary>查看变动详情与 Raw Data</summary>
            <div class="summaries">
              <div v-if="log.before_summary">
                <small>变更前数据 (before)</small>
                <code class="json-payload">{{ formatJson(log.before_summary) }}</code>
              </div>
              <div v-if="log.after_summary">
                <small>变更后数据 (after)</small>
                <code class="json-payload">{{ formatJson(log.after_summary) }}</code>
              </div>
              <div v-if="hasMetadata(log.metadata)">
                <small>附加元数据 (metadata)</small>
                <code class="json-payload">{{ formatJson(log.metadata) }}</code>
              </div>
            </div>
          </details>
        </li>
      </ol>
    </div>
    <button v-if="nextCursor" class="btn-secondary load-more" :disabled="loadingMore" @click="load(false)">
      {{ loadingMore ? '加载中…' : `加载更多（已显示 ${logs.length}${total !== null ? `/${total}` : ''}）` }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { AdminAccountSummary, AdminAuditLog } from '@alumni/shared'
import { listAllAdminAccounts, listAuditLogs, type AuditLogFilters } from '@/api/adminAccounts'
import { summarizeAuditLog } from '@/utils/auditSummary'
import { isAbortError } from '@/api/network'
import { appendUniquePage } from '@/api/pagination'
import CalendarDatePicker from '@/components/CalendarDatePicker.vue'

const logs = ref<AdminAuditLog[]>([])
const accounts = ref<AdminAccountSummary[]>([])
const loading = ref(true)
const filters = reactive<AuditLogFilters>({ actorId: '', action: '', resourceType: '', from: '', to: '' })
const nextCursor = ref<string | null>(null)
const total = ref<number | null>(null)
const loadingMore = ref(false)
let loadController: AbortController | null = null
const accountController = new AbortController()

const summaryOf = summarizeAuditLog
function formatDate(value: string) { return value ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString('zh-CN') : '' }
function formatJson(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') {
    try { return JSON.stringify(JSON.parse(val), null, 2) } catch { return val }
  }
  return JSON.stringify(val, null, 2)
}
function hasMetadata(meta: unknown): boolean {
  if (!meta) return false
  if (typeof meta === 'string') return meta !== '{}' && meta !== 'null'
  if (typeof meta === 'object') return Object.keys(meta).length > 0
  return false
}

async function load(reset = true) {
  if (reset) {
    loadController?.abort()
    logs.value = []
    nextCursor.value = null
  }
  const controller = new AbortController()
  loadController = controller
  loading.value = true
  loadingMore.value = !reset
  try {
    const page = await listAuditLogs(filters, reset ? null : nextCursor.value, controller.signal)
    if (controller.signal.aborted) return
    const merged = reset ? { items: page.items, added: page.items.length } : appendUniquePage(logs.value, page.items, (log) => log.id)
    logs.value = merged.items
    nextCursor.value = merged.added === 0 && !reset ? null : page.nextCursor
    total.value = page.total
  } catch (error) {
    if (!isAbortError(error)) logs.value = reset ? [] : logs.value
  } finally {
    if (loadController === controller) { loading.value = false; loadingMore.value = false }
  }
}
async function resetFilters() {
  Object.assign(filters, { actorId: '', action: '', resourceType: '', from: '', to: '' })
  await load(true)
}
onMounted(async () => {
  try {
    accounts.value = await listAllAdminAccounts(accountController.signal)
    await load(true)
  } catch { loading.value = false }
})
onBeforeUnmount(() => { accountController.abort(); loadController?.abort() })
</script>

<style scoped>
.audit-page{max-width:1040px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--color-primary);margin:0 0 4px}.intro{margin:8px 0 0;color:var(--color-muted);font-size:14px}.filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:var(--spacing-lg)}.filters label{display:grid;gap:5px;font-size:12px;color:var(--color-muted)}.filter-actions{display:flex;align-items:end;justify-content:flex-end;gap:8px;grid-column:span 5}.audit-list{list-style:none;margin:0;padding:0}.audit-list li{padding:15px 0;border-bottom:1px solid var(--color-hairline)}.audit-list li:last-child{border-bottom:0}.log-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.log-heading span{padding:2px 6px;border-radius:var(--rounded-sm);background:var(--color-surface-cream-strong);color:var(--color-primary);font-size:12px}.log-heading time{margin-left:auto;color:var(--color-muted);font-size:12px}.resource{margin:6px 0 0;color:var(--color-muted);font-size:13px}.audit-list p:not(.resource){margin:6px 0 0;font-size:13px}details{margin-top:9px}summary{cursor:pointer;color:var(--color-primary);font-size:13px}.summaries{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}.summaries code,.summaries pre{display:block;margin:0;white-space:pre-wrap;word-break:break-word;padding:9px;background:var(--color-surface-cream);border-radius:var(--rounded-sm);font-size:11px;line-height:1.5;font-family:monospace}.empty{padding:var(--spacing-xl);color:var(--color-muted)}.load-more{display:block;margin:var(--spacing-lg) auto 0}@media(max-width:900px){.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-actions{grid-column:span 2}.summaries{grid-template-columns:1fr}}@media(max-width:560px){.filters{grid-template-columns:1fr}.filter-actions{grid-column:span 1;justify-content:stretch}.filter-actions button{flex:1}.audit-card{padding:var(--spacing-md)}.log-heading time{width:100%;margin-left:0}}
</style>
