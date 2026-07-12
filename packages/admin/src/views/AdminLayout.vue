<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/></svg></span>
        <span class="brand-text">同学录管理</span>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/dashboard" class="nav-item" title="控制台" aria-label="控制台"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> <span>控制台</span></router-link>
        <router-link to="/students" class="nav-item" title="学生管理" aria-label="学生管理"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> <span>学生管理</span></router-link>
        <router-link to="/albums" class="nav-item" title="相册管理" aria-label="相册管理"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> <span>相册管理</span></router-link>
        <router-link to="/messages" class="nav-item" title="留言审核" aria-label="留言审核"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> <span>留言审核</span></router-link>
        <router-link to="/mail" class="nav-item" title="班级邮局" aria-label="班级邮局">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>
          <span>通知中心</span>
        </router-link>
        <router-link to="/timeline" class="nav-item" title="时光轴" aria-label="时光轴"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> <span>时光轴</span></router-link>
        <router-link to="/settings" class="nav-item" title="站点设置" aria-label="站点设置"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> <span>站点设置</span></router-link>
      </nav>
      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout">退出登录</button>
      </div>
    </aside>
    <main class="admin-main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { adminLogout } from '@/api/client'
async function handleLogout() {
  await adminLogout()
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background-color: var(--color-surface-dark);
  color: var(--color-on-dark);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--duration-normal) var(--ease-out-quart);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-surface-dark-elevated);
}

.brand-mark {
  color: var(--color-primary);
  font-size: 18px;
}

.brand-text {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
}

.sidebar-nav {
  flex: 1;
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 10px 14px;
  border-radius: var(--rounded-md);
  color: var(--color-on-dark-soft);
  font-size: var(--type-body-sm-size);
  text-decoration: none;
  transition: background-color var(--duration-fast) var(--ease-out-quart),
              color var(--duration-fast) var(--ease-out-quart);
}

.nav-item:hover {
  background-color: var(--color-surface-dark-elevated);
  color: var(--color-on-dark);
  text-decoration: none;
}

.nav-item.router-link-active {
  background-color: var(--color-surface-dark-elevated);
  color: var(--color-on-dark);
}

.nav-item.router-link-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background-color: var(--color-primary);
  border-radius: 0 2px 2px 0;
}

.sidebar-footer {
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-surface-dark-elevated);
}

.logout-btn {
  width: 100%;
  padding: 8px;
  color: var(--color-on-dark-soft);
  font-size: var(--type-body-sm-size);
  border-radius: var(--rounded-md);
  transition: background-color var(--duration-fast) var(--ease-out-quart);
}

.logout-btn:hover {
  background-color: var(--color-surface-dark-elevated);
  color: var(--color-on-dark);
}

.admin-main {
  flex: 1;
  padding: var(--spacing-xl);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .sidebar {
    width: 60px;
  }

  .brand-text,
  .nav-item span,
  .logout-btn {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 12px;
  }

  .sidebar-brand {
    justify-content: center;
  }
}
</style>
