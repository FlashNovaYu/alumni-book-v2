<template>
  <section class="audit-page">
    <header class="page-header"><div><p class="eyebrow">主管理员专属</p><h1 class="page-title">操作日志</h1><p class="intro">记录关键管理操作，不包含密码和会话令牌。</p></div></header>

    <form class="card filters" @submit.prevent="load">
      <label>操作人<select v-model="filters.actorId" class="text-input"><option value="">全部管理员</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.displayName }}</option></select></label>
      <label>操作动作<input v-model.trim="filters.action" class="text-input" placeholder="如：admin_account.disable" /></label>
      <label>资源类型<input v-model.trim="filters.resourceType" class="text-input" placeholder="如：admin_account" /></label>
      <label>开始日期<input v-model="filters.from" class="text-input" type="date" /></label>
      <label>结束日期<input v-model="filters.to" class="text-input" type="date" /></label>
      <div class="filter-actions"><button type="button" class="btn-secondary" @click="resetFilters">重置</button><button class="btn-primary" :disabled="loading">筛选</button></div>
    </form>

    <div class="card audit-card">
      <p v-if="loading">正在加载日志…</p>
      <div v-else-if="!logs.length" class="empty">没有符合当前条件的管理操作记录。</div>
      <ol v-else class="audit-list">
        <li v-for="log in logs" :key="log.id">
          <div class="log-heading"><strong>{{ log.admin_display_name }}</strong><span>{{ log.action }}</span><time>{{ formatDate(log.created_at) }}</time></div>
          <p class="resource">{{ log.resource_type }} · {{ log.resource_id }}</p>
          <p v-if="log.reason">原因：{{ log.reason }}</p>
          <details v-if="log.before_summary || log.after_summary"><summary>查看变更摘要</summary><div class="summaries"><pre v-if="log.before_summary">变更前：{{ pretty(log.before_summary) }}</pre><pre v-if="log.after_summary">变更后：{{ pretty(log.after_summary) }}</pre></div></details>
        </li>
      </ol>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { AdminAccountSummary, AdminAuditLog } from '@alumni/shared'
import { listAdminAccounts, listAuditLogs, type AuditLogFilters } from '@/api/adminAccounts'

const logs = ref<AdminAuditLog[]>([])
const accounts = ref<AdminAccountSummary[]>([])
const loading = ref(true)
const filters = reactive<AuditLogFilters>({ actorId: '', action: '', resourceType: '', from: '', to: '' })

function pretty(summary: string) {
  try { return JSON.stringify(JSON.parse(summary), null, 2) } catch { return summary }
}
function formatDate(value: string) { return value ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString('zh-CN') : '' }
async function load() {
  loading.value = true
  try { logs.value = await listAuditLogs(filters) }
  finally { loading.value = false }
}
async function resetFilters() {
  Object.assign(filters, { actorId: '', action: '', resourceType: '', from: '', to: '' })
  await load()
}
onMounted(async () => { try { accounts.value = await listAdminAccounts(); await load() } catch { loading.value = false } })
</script>

<style scoped>
.audit-page{max-width:1040px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--color-primary);margin:0 0 4px}.intro{margin:8px 0 0;color:var(--color-muted);font-size:14px}.filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:var(--spacing-lg)}.filters label{display:grid;gap:5px;font-size:12px;color:var(--color-muted)}.filter-actions{display:flex;align-items:end;justify-content:flex-end;gap:8px;grid-column:span 5}.audit-list{list-style:none;margin:0;padding:0}.audit-list li{padding:15px 0;border-bottom:1px solid var(--color-hairline)}.audit-list li:last-child{border-bottom:0}.log-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.log-heading span{padding:2px 6px;border-radius:var(--rounded-sm);background:var(--color-surface-cream-strong);color:var(--color-primary);font-size:12px}.log-heading time{margin-left:auto;color:var(--color-muted);font-size:12px}.resource{margin:6px 0 0;color:var(--color-muted);font-size:13px}.audit-list p:not(.resource){margin:6px 0 0;font-size:13px}details{margin-top:9px}summary{cursor:pointer;color:var(--color-primary);font-size:13px}.summaries{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}.summaries pre{margin:0;white-space:pre-wrap;word-break:break-word;padding:9px;background:var(--color-surface-cream);border-radius:var(--rounded-sm);font-size:11px;line-height:1.5}.empty{padding:var(--spacing-xl);color:var(--color-muted)}@media(max-width:900px){.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-actions{grid-column:span 2}.summaries{grid-template-columns:1fr}}@media(max-width:560px){.filters{grid-template-columns:1fr}.filter-actions{grid-column:span 1;justify-content:stretch}.filter-actions button{flex:1}.audit-card{padding:var(--spacing-md)}.log-heading time{width:100%;margin-left:0}}
</style>
