<template>
  <div class="admin-layout">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar--collapsed': isMobile && !mobileMenuOpen }">
      <!-- Brand -->
      <div class="sidebar__brand">
        <span class="sidebar__brand-mark">✦</span>
        <span class="sidebar__brand-text">同学录管理</span>
      </div>

      <!-- Navigation -->
      <nav class="sidebar__nav">
        <!-- 内容治理 -->
        <div v-if="can('moderation.view')" class="sidebar__group">
          <p class="sidebar__group-label">内容治理</p>
          <router-link to="/messages" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span>审核中心</span>
          </router-link>
        </div>

        <!-- 内容运营 -->
        <div v-if="can('content.manage') || can('notifications.view') || can('notifications.publish')" class="sidebar__group">
          <p class="sidebar__group-label">内容运营</p>
          <router-link v-if="can('notifications.view') || can('notifications.publish')" to="/mail" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>通知中心</span>
          </router-link>
          <router-link v-if="can('content.manage')" to="/albums" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span>相册管理</span>
          </router-link>
          <router-link v-if="can('content.manage')" to="/timeline" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>时光轴</span>
          </router-link>
        </div>

        <!-- 主管理员 -->
        <div v-if="isOwner || can('students.manage') || can('site.settings.manage') || can('admins.manage') || can('audit.view')" class="sidebar__group">
          <p class="sidebar__group-label">主管理员</p>
          <router-link v-if="can('students.manage')" to="/students" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>学生管理</span>
          </router-link>
          <router-link v-if="can('site.settings.manage')" to="/settings" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>站点设置</span>
          </router-link>
          <router-link v-if="can('admins.manage')" to="/accounts" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>账号与权限</span>
          </router-link>
          <router-link v-if="can('audit.view')" to="/audit-logs" class="sidebar__item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>操作日志</span>
          </router-link>
        </div>
      </nav>

      <!-- Footer -->
      <div class="sidebar__footer">
        <div class="sidebar__identity">
          <div class="sidebar__avatar">
            {{ adminInitial }}
          </div>
          <div class="sidebar__identity-info">
            <span class="sidebar__identity-name">{{ admin?.displayName || '管理员' }}</span>
            <span class="sidebar__identity-role">{{ isOwner ? '主管理员' : '管理员' }}</span>
          </div>
        </div>
        <button class="sidebar__logout" @click="handleLogout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          退出登录
        </button>
      </div>
    </aside>

    <!-- Mobile Menu Toggle -->
    <button
      v-if="isMobile"
      class="mobile-menu-toggle"
      :class="{ 'mobile-menu-toggle--open': mobileMenuOpen }"
      @click="mobileMenuOpen = !mobileMenuOpen"
      aria-label="切换菜单"
    >
      <svg v-if="!mobileMenuOpen" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
      <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>

    <!-- Main Content -->
    <main class="admin-main">
      <!-- Top Bar -->
      <header class="admin-topbar">
        <div class="admin-topbar__breadcrumb">
          <span class="admin-topbar__brand">同学录管理</span>
          <span class="admin-topbar__separator">/</span>
          <span class="admin-topbar__page">{{ currentPageTitle }}</span>
        </div>
        <div class="admin-topbar__actions">
          <a :href="siteUrl" target="_blank" class="admin-topbar__link" title="查看前台站点">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            查看站点
          </a>
        </div>
      </header>

      <!-- Router View -->
      <div class="admin-main__content">
        <RouteLoadingSkeleton v-if="routeLoading" />
        <router-view v-else />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AdminPermission } from '@alumni/shared'
import { adminLogout, getCurrentAdmin } from '@/api/client'
import RouteLoadingSkeleton from '@/components/RouteLoadingSkeleton.vue'

const admin = computed(() => getCurrentAdmin())
const isOwner = computed(() => !!admin.value?.isOwner)
const route = useRoute()
const router = useRouter()
const mobileMenuOpen = ref(false)
const isMobile = ref(false)
const routeLoading = ref(false)
let removeBeforeRouteHook: (() => void) | null = null
let removeAfterRouteHook: (() => void) | null = null

function can(permission: AdminPermission) {
  return !!admin.value && (admin.value.isOwner || admin.value.permissions.includes(permission))
}

async function handleLogout() {
  await adminLogout()
}

const adminInitial = computed(() => {
  const name = admin.value?.displayName || '管'
  return name.charAt(0).toUpperCase()
})

const pageTitles: Record<string, string> = {
  '/dashboard': '工作台',
  '/messages': '审核中心',
  '/mail': '通知中心',
  '/albums': '相册管理',
  '/timeline': '时光轴',
  '/students': '学生管理',
  '/settings': '站点设置',
  '/accounts': '账号与权限',
  '/audit-logs': '操作日志',
}

const currentPageTitle = computed(() => {
  return pageTitles[route.path] || '管理后台'
})

const siteUrl = computed(() => {
  return import.meta.env.VITE_SITE_URL || '/'
})

function checkMobile() {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  removeBeforeRouteHook = router.beforeEach(() => { routeLoading.value = true })
  removeAfterRouteHook = router.afterEach(() => {
    requestAnimationFrame(() => { routeLoading.value = false })
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  removeBeforeRouteHook?.()
  removeAfterRouteHook?.()
})
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

/* ── Sidebar ── */
.sidebar {
  width: 260px;
  background: var(--bg-surface);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: var(--z-nav);
  overflow-y: auto;
  transition: transform var(--duration-normal) var(--ease-out-expo);
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.sidebar__brand-mark {
  color: var(--accent);
  font-size: 20px;
}

.sidebar__brand-text {
  font-family: var(--font-display);
  font-size: var(--type-title-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.sidebar__nav {
  flex: 1;
  padding: var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sidebar__group-label {
  margin: var(--space-2) var(--space-3) var(--space-1);
  color: var(--text-muted);

  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--type-body-md);
  font-weight: var(--weight-medium);
  text-decoration: none;
  transition:
    background-color var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo);
  position: relative;
}

.sidebar__item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: var(--accent);
  border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
  transition: height var(--duration-fast) var(--ease-out-expo);
}

.sidebar__item:hover {
  background: var(--bg-soft);
  color: var(--text-primary);
}

.sidebar__item.router-link-active {
  background: var(--bg-raised);
  color: var(--accent);
}

.sidebar__item.router-link-active::before {
  height: 24px;
}

.sidebar__item svg {
  flex-shrink: 0;
  opacity: 0.7;
}

.sidebar__item.router-link-active svg {
  opacity: 1;
  color: var(--accent);
}

/* Footer */
.sidebar__footer {
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sidebar__identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sidebar__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--accent-active));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: var(--weight-semibold);
  color: var(--text-inverse);
  flex-shrink: 0;
}

.sidebar__identity-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sidebar__identity-name {
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__identity-role {
  font-size: var(--type-caption);
  color: var(--text-muted);
}

.sidebar__logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo),
    background-color var(--duration-fast) var(--ease-out-expo);
}

.sidebar__logout:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: var(--bg-soft);
}

/* ── Mobile Menu Toggle ── */
.mobile-menu-toggle {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: calc(var(--z-nav) + 1);
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: 50%;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out-expo);
}

.mobile-menu-toggle:hover {
  transform: scale(1.05);
}

.mobile-menu-toggle--open {
  background: var(--error);
}

/* ── Main Content ── */
.admin-main {
  flex: 1;
  margin-left: 260px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Top Bar */
.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: calc(var(--z-nav) - 1);
}

.admin-topbar__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--type-body-sm);
  color: var(--text-muted);
}

.admin-topbar__brand {
  font-weight: var(--weight-medium);
  color: var(--text-secondary);
}

.admin-topbar__separator {
  color: var(--border-strong);
}

.admin-topbar__page {
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.admin-topbar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.admin-topbar__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  color: var(--accent);
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  text-decoration: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-out-expo),
    background-color var(--duration-fast) var(--ease-out-expo);
}

.admin-topbar__link:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.admin-main__content {
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    width: 280px;
  }

  .sidebar--collapsed {
    transform: translateX(-100%);
  }

  .sidebar:not(.sidebar--collapsed) {
    transform: translateX(0);
  }

  .admin-main {
    margin-left: 0;
  }

  .admin-topbar {
    padding: var(--space-3) var(--space-4);
  }

  .admin-main__content {
    padding: var(--space-4);
  }
}

@media (min-width: 769px) {
  .mobile-menu-toggle {
    display: none;
  }
}
</style>
