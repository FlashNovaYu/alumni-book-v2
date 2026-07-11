<template>
  <section><header class="page-header"><p class="eyebrow">主管理员专属</p><h1 class="page-title">操作日志</h1></header><div class="card"><p v-if="loading">正在加载日志…</p><div v-else-if="!logs.length" class="empty">暂无管理操作记录</div><ol v-else class="audit-list"><li v-for="log in logs" :key="log.id"><strong>{{ log.admin_display_name }}</strong><span>{{ log.action }}</span><small>{{ log.resource_type }} · {{ log.resource_id }} · {{ log.created_at }}</small><p v-if="log.reason">原因：{{ log.reason }}</p></li></ol></div></section>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AdminAuditLog } from '@alumni/shared'
import { listAuditLogs } from '@/api/adminAccounts'
const logs = ref<AdminAuditLog[]>([])
const loading = ref(true)
onMounted(async () => { try { logs.value = await listAuditLogs() } finally { loading.value = false } })
</script>
<style scoped>.eyebrow{font-size:12px;color:var(--color-muted);margin-bottom:4px}.audit-list{list-style:none;display:grid;gap:0}.audit-list li{padding:14px 0;border-bottom:1px solid var(--color-hairline)}.audit-list span{margin-left:8px;color:var(--color-primary)}small{display:block;color:var(--color-muted);margin-top:5px}.audit-list p{font-size:13px;margin-top:6px}.empty{color:var(--color-muted);padding:var(--spacing-xl)}</style>
