<template>
  <div class="dashboard">
    <div class="page-header workbench-header">
      <div>
        <p class="workbench-eyebrow">ADMIN WORKBENCH</p>
        <h1 class="page-title">今日工作台</h1>
        <p class="workbench-intro">只显示你当前可以处理的事项和运营内容。</p>
      </div>
    </div>

    <div v-if="loading" class="workbench-skeleton" aria-label="正在加载工作台">
      <div v-for="i in 3" :key="i" class="skeleton-block skeleton-card"></div>
    </div>

    <div v-else-if="loadError" class="card workbench-empty">
      <p>{{ loadError }}</p>
      <button class="btn-primary" @click="load">重新加载</button>
    </div>

    <div v-else class="workbench-content">
      <section v-if="workbench.todos.length" class="workbench-section" aria-labelledby="todo-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">ACTION QUEUE</p>
            <h2 id="todo-title">待我处理</h2>
          </div>
          <span class="section-count">{{ workbench.todos.length }} 项</span>
        </div>
        <div class="todo-grid">
          <router-link v-for="item in workbench.todos" :key="item.id" :to="item.to" class="todo-card card">
            <span class="todo-label">{{ item.label }}</span>
            <strong class="todo-count">{{ item.count }}</strong>
            <span class="todo-action">前往处理 <span aria-hidden="true">→</span></span>
          </router-link>
        </div>
      </section>

      <section v-if="workbench.summary.length" class="workbench-section" aria-labelledby="summary-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">OPERATIONS OVERVIEW</p>
            <h2 id="summary-title">运营概览</h2>
          </div>
        </div>
        <div class="summary-grid">
          <router-link v-for="item in workbench.summary" :key="item.id" :to="item.to" class="summary-card card">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </router-link>
        </div>
      </section>

      <section class="workbench-section" aria-labelledby="quick-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">SHORTCUTS</p>
            <h2 id="quick-title">快捷操作</h2>
          </div>
        </div>
        <div v-if="quickActions.length" class="quick-grid">
          <router-link v-for="item in quickActions" :key="item.to" :to="item.to" class="quick-action">
            <span>{{ item.label }}</span>
            <span aria-hidden="true">↗</span>
          </router-link>
        </div>
        <div v-else class="card workbench-empty">当前账号暂未分配可操作的后台模块。</div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AdminPermission, ApiResponse } from '@alumni/shared'
import { adminFetch, getCurrentAdmin } from '@/api/client'

type WorkbenchItem = { id: string; label: string; count: number; to: string }
type SummaryItem = { id: string; label: string; value: number; to: string }
type WorkbenchData = { todos: WorkbenchItem[]; summary: SummaryItem[] }

const workbench = ref<WorkbenchData>({ todos: [], summary: [] })
const loading = ref(true)
const loadError = ref('')

function can(permission: AdminPermission) {
  const admin = getCurrentAdmin()
  return !!admin && (admin.isOwner || admin.permissions.includes(permission))
}

const quickActions = computed(() => [
  can('moderation.manage') && { label: '审核留言', to: '/messages' },
  can('notifications.publish') && { label: '发布通知', to: '/mail' },
  can('content.manage') && { label: '维护班级相册', to: '/albums' },
  can('content.manage') && { label: '整理时光轴', to: '/timeline' },
  can('students.manage') && { label: '管理学生档案', to: '/students' },
  can('site.settings.manage') && { label: '调整站点设置', to: '/settings' },
  can('admins.manage') && { label: '管理账号权限', to: '/accounts' },
  can('audit.view') && { label: '查看操作日志', to: '/audit-logs' },
].filter(Boolean) as Array<{ label: string; to: string }>)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await adminFetch<ApiResponse<WorkbenchData>>('/api/admin/workbench')
    workbench.value = response.data || { todos: [], summary: [] }
  } catch (error: any) {
    loadError.value = error.message || '工作台加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.workbench-header { margin-bottom: var(--spacing-xl); }
.workbench-eyebrow,.section-kicker { margin: 0 0 6px; color: var(--color-primary); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.workbench-intro { margin: 8px 0 0; color: var(--color-muted); }
.workbench-section { margin-bottom: var(--spacing-xl); }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--spacing-md); margin-bottom: var(--spacing-md); }
.section-heading h2 { margin: 0; font-size: 20px; }
.section-count { color: var(--color-muted); font-size: 13px; }
.todo-grid,.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--spacing-md); }
.todo-card { min-height: 156px; display: flex; flex-direction: column; align-items: flex-start; padding: var(--spacing-lg); border-top: 3px solid var(--color-primary); text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
.todo-card:hover,.summary-card:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(53, 38, 28, .1); text-decoration: none; }
.todo-label { color: var(--color-muted); font-size: 13px; }
.todo-count { margin: auto 0 12px; color: var(--color-primary); font-family: var(--font-display); font-size: 42px; line-height: 1; }
.todo-action { color: var(--color-ink); font-size: 13px; }
.summary-card { display: flex; flex-direction: column; gap: 6px; padding: var(--spacing-lg); text-decoration: none; }
.summary-card strong { color: var(--color-primary); font-family: var(--font-display); font-size: 32px; line-height: 1; }
.summary-card span { color: var(--color-muted); font-size: 13px; }
.quick-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.quick-action { display: flex; align-items: center; justify-content: space-between; min-height: 50px; padding: 12px 14px; border: 1px solid var(--color-hairline); border-radius: var(--rounded-md); background: var(--color-surface-cream); color: var(--color-ink); transition: border-color .18s ease, background .18s ease; }
.quick-action:hover { border-color: var(--color-primary); background: var(--color-surface-cream-strong); text-decoration: none; }
.workbench-empty { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md); padding: var(--spacing-lg); color: var(--color-muted); }
.workbench-empty p { margin: 0; }
.workbench-skeleton { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--spacing-md); }
.skeleton-card { min-height: 156px; border-radius: var(--rounded-md); }
@media (max-width: 768px) { .workbench-skeleton { grid-template-columns: 1fr; }.todo-grid,.summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.todo-card { min-height: 136px; }.todo-count { font-size: 36px; }.workbench-empty { align-items: flex-start; flex-direction: column; } }
@media (max-width: 390px) { .todo-grid,.summary-grid { grid-template-columns: 1fr; } }
</style>
