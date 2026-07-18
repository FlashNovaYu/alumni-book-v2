<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="dashboard__header">
      <div>
        <p class="dashboard__eyebrow">ADMIN WORKBENCH</p>
        <h1 class="dashboard__title">今日工作台</h1>
        <p class="dashboard__intro">只显示你当前可以处理的事项和运营内容。</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="dashboard__skeleton" aria-label="正在加载工作台">
      <UiSkeleton v-for="i in 3" :key="i" variant="card" />
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="dashboard__error">
      <UiEmptyState
        title="加载失败"
        :description="loadError"
      >
        <template #action>
          <button class="btn-primary" @click="load">重新加载</button>
        </template>
      </UiEmptyState>
    </div>

    <!-- Content -->
    <div v-else class="dashboard__content">
      <!-- Todo Section -->
      <section v-if="workbench.todos.length" class="dashboard__section" aria-labelledby="todo-title">
        <div class="dashboard__section-header">
          <div>
            <p class="dashboard__section-kicker">ACTION QUEUE</p>
            <h2 id="todo-title" class="dashboard__section-title">待我处理</h2>
          </div>
          <UiBadge variant="accent" size="sm">{{ workbench.todos.length }} 项</UiBadge>
        </div>
        <div class="todo-grid">
          <router-link
            v-for="item in workbench.todos"
            :key="item.id"
            :to="item.to"
            class="todo-card"
          >
            <span class="todo-card__label">{{ item.label }}</span>
            <strong class="todo-card__count">{{ item.count }}</strong>
            <span class="todo-card__action">
              前往处理
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </router-link>
        </div>
      </section>

      <!-- Summary Section -->
      <section v-if="workbench.summary.length" class="dashboard__section" aria-labelledby="summary-title">
        <div class="dashboard__section-header">
          <div>
            <p class="dashboard__section-kicker">OPERATIONS OVERVIEW</p>
            <h2 id="summary-title" class="dashboard__section-title">运营概览</h2>
          </div>
        </div>
        <div class="summary-grid">
          <router-link
            v-for="item in workbench.summary"
            :key="item.id"
            :to="item.to"
            class="summary-card"
          >
            <strong class="summary-card__value">{{ item.value }}</strong>
            <span class="summary-card__label">{{ item.label }}</span>
          </router-link>
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="dashboard__section" aria-labelledby="quick-title">
        <div class="dashboard__section-header">
          <div>
            <p class="dashboard__section-kicker">SHORTCUTS</p>
            <h2 id="quick-title" class="dashboard__section-title">快捷操作</h2>
          </div>
        </div>
        <div v-if="quickActions.length" class="quick-grid">
          <router-link
            v-for="item in quickActions"
            :key="item.to"
            :to="item.to"
            class="quick-action"
          >
            <span>{{ item.label }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </router-link>
        </div>
        <div v-else class="dashboard__empty">
          <UiEmptyState
            title="暂无快捷操作"
            description="当前账号暂未分配可操作的后台模块。"
            compact
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AdminPermission, ApiResponse } from '@alumni/shared'
import { adminFetch, getCurrentAdmin } from '@/api/client'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiBadge from '@/components/ui/UiBadge.vue'

type WorkbenchItem = { id: string; label: string; count: number; to: string }
type SummaryItem = { id: string; label: string; value: number; to: string }
type WorkbenchData = { todos: WorkbenchItem[]; summary: SummaryItem[] }

const workbench = ref<WorkbenchData>({ todos: [], summary: [] })
const loading = ref(true)
const loadError = ref<string | null>(null)

const admin = computed(() => getCurrentAdmin())
const isOwner = computed(() => !!admin.value?.isOwner)

function can(permission: AdminPermission) {
  return !!admin.value && (admin.value.isOwner || admin.value.permissions.includes(permission))
}

const quickActions = computed(() => {
  const actions: { label: string; to: string }[] = []
  if (can('students.manage')) actions.push({ label: '添加学生', to: '/students' })
  if (can('content.manage')) actions.push({ label: '上传照片', to: '/albums' })
  if (can('content.manage')) actions.push({ label: '添加事件', to: '/timeline' })
  if (can('notifications.publish')) actions.push({ label: '发送通知', to: '/mail' })
  if (can('moderation.manage')) actions.push({ label: '审核留言', to: '/messages' })
  if (can('site.settings.manage')) actions.push({ label: '站点设置', to: '/settings' })
  return actions
})

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const data = await adminFetch<ApiResponse<WorkbenchData>>('/api/admin/workbench')
    if (data.success && data.data) {
      workbench.value = data.data
    } else {
      loadError.value = data.message || '加载工作台数据失败'
    }
  } catch (e: any) {
    loadError.value = e.message || '网络错误'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
})
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.dashboard__header {
  margin-bottom: var(--space-7);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--border);
}

.dashboard__eyebrow {
  font-size: var(--type-caption-uppercase);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 var(--space-2) 0;
}

.dashboard__title {
  font-family: var(--font-display);
  font-size: var(--type-display-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2) 0;
}

.dashboard__intro {
  font-size: var(--type-body-md);
  color: var(--text-muted);
  margin: 0;
}

/* Skeleton */
.dashboard__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

/* Error */
.dashboard__error {
  padding: var(--space-8) 0;
}

/* Section */
.dashboard__section {
  margin-bottom: var(--space-8);
}

.dashboard__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.dashboard__section-kicker {
  font-size: var(--type-caption-uppercase);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 var(--space-1) 0;
}

.dashboard__section-title {
  font-family: var(--font-display);
  font-size: var(--type-title-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
  margin: 0;
}

/* Todo Grid */
.todo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-4);
}

.todo-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  transition:
    transform var(--duration-normal) var(--ease-out-expo),
    box-shadow var(--duration-normal) var(--ease-out-expo);
}

.todo-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-card-hover);
}

.todo-card__label {
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
}

.todo-card__count {
  font-family: var(--font-display);
  font-size: 42px;
  font-weight: var(--weight-semibold);
  color: var(--accent);
  line-height: var(--leading-tight);
}

.todo-card__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  color: var(--accent);
  transition: gap var(--duration-fast) var(--ease-out-expo);
}

.todo-card:hover .todo-card__action {
  gap: var(--space-2);
}

/* Summary Grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-4);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition:
    transform var(--duration-normal) var(--ease-out-expo),
    box-shadow var(--duration-normal) var(--ease-out-expo);
}

.summary-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-card-hover);
}

.summary-card__value {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.summary-card__label {
  font-size: var(--type-body-sm);
  color: var(--text-muted);
}

/* Quick Actions */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}

.quick-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--type-body-md);
  font-weight: var(--weight-medium);
  text-decoration: none;
  transition:
    background-color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo);
}

.quick-action:hover {
  background: var(--bg-soft);
  border-color: var(--accent);
}

.quick-action svg {
  color: var(--text-muted);
  transition: color var(--duration-fast) var(--ease-out-expo);
}

.quick-action:hover svg {
  color: var(--accent);
}

/* Empty */
.dashboard__empty {
  padding: var(--space-6) 0;
}

/* Responsive */
@media (max-width: 768px) {
  .dashboard__header {
    margin-bottom: var(--space-5);
  }

  .dashboard__title {
    font-size: var(--type-title-lg);
  }

  .todo-grid,
  .summary-grid,
  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .todo-card__count {
    font-size: 32px;
  }
}

@media (max-width: 480px) {
  .todo-grid,
  .summary-grid,
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
