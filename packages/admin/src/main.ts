import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import '@alumni/shared/src/tokens.css'
import './styles/admin.css'
import { fetchCurrentAdmin } from './api/client'
import type { AdminIdentity, AdminPermission } from '@alumni/shared'

const adminBase = import.meta.env.BASE_URL || '/admin/'
const router = createRouter({
  history: createWebHashHistory(adminBase),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/setup', name: 'setup', component: () => import('./views/AdminSetupView.vue') },
    { path: '/classmate', name: 'classmate-entry', component: () => import('./views/ClassmateEntryView.vue') },
    { path: '/change-password', name: 'change-password', component: () => import('./views/ChangeAdminPasswordView.vue') },
    { path: '/', component: () => import('./views/AdminLayout.vue'), children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { permission: 'dashboard.view' } },
      { path: 'students', name: 'students', component: () => import('./views/StudentsView.vue'), meta: { permission: 'students.manage' } },
      { path: 'students/:id', name: 'student-edit', component: () => import('./views/StudentEditView.vue'), meta: { permission: 'students.manage' } },
      { path: 'albums', name: 'albums', component: () => import('./views/AlbumsView.vue'), meta: { permission: 'content.manage' } },
      { path: 'messages', name: 'messages', component: () => import('./views/MessagesView.vue'), meta: { permission: 'moderation.view' } },
      { path: 'timeline', name: 'timeline', component: () => import('./views/TimelineEventsView.vue'), meta: { permission: 'content.manage' } },
      { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { permission: 'site.settings.manage' } },
      { path: 'mail', name: 'notifications', component: () => import('./views/MailView.vue'), meta: { permission: 'notifications.view' } },
      { path: 'accounts', name: 'accounts', component: () => import('./views/AdminAccountsView.vue'), meta: { permission: 'admins.manage' } },
      { path: 'audit-logs', name: 'audit-logs', component: () => import('./views/AuditLogView.vue'), meta: { permission: 'audit.view' } },
    ] },
  ],
})

function canAccess(admin: AdminIdentity, permission?: AdminPermission) {
  return !permission || admin.isOwner || admin.permissions.includes(permission)
}

function firstAccessibleRoute(admin: AdminIdentity): string | null {
  const routes: Array<{ name: string; permission: AdminPermission }> = [
    { name: 'dashboard', permission: 'dashboard.view' },
    { name: 'messages', permission: 'moderation.view' },
    { name: 'notifications', permission: 'notifications.view' },
    { name: 'albums', permission: 'content.manage' },
    { name: 'timeline', permission: 'content.manage' },
    { name: 'students', permission: 'students.manage' },
    { name: 'settings', permission: 'site.settings.manage' },
    { name: 'accounts', permission: 'admins.manage' },
    { name: 'audit-logs', permission: 'audit.view' },
  ]
  return routes.find(route => canAccess(admin, route.permission))?.name || null
}

router.beforeEach(async (to) => {
  if (to.name === 'change-password') {
    if (!sessionStorage.getItem('admin_token')) return { name: 'login' }
    try {
      const admin = await fetchCurrentAdmin()
      if (admin.mustChangePassword) return true
      const destination = firstAccessibleRoute(admin)
      return destination ? { name: destination } : { name: 'login' }
    } catch {
      return sessionStorage.getItem('admin_token') ? true : { name: 'login' }
    }
  }
  if (['login', 'setup', 'classmate-entry'].includes(String(to.name))) {
    if (to.name === 'login' && sessionStorage.getItem('admin_token')) {
      try {
        const admin = await fetchCurrentAdmin()
        const destination = firstAccessibleRoute(admin)
        if (destination) return { name: destination }
        sessionStorage.removeItem('admin_token')
      } catch {
        if (!sessionStorage.getItem('admin_token')) return true
      }
    }
    return true
  }
  if (!sessionStorage.getItem('admin_token')) return { name: 'login' }
  try {
    const admin = await fetchCurrentAdmin()
    if (admin.mustChangePassword) return { name: 'change-password' }
    const permission = to.meta.permission as AdminPermission | undefined
    if (!canAccess(admin, permission)) {
      const destination = firstAccessibleRoute(admin)
      if (destination) return { name: destination }
      sessionStorage.removeItem('admin_token')
      return { name: 'login' }
    }
    return true
  } catch {
    return sessionStorage.getItem('admin_token') ? true : { name: 'login' }
  }
})

createApp(App).use(router).mount('#app')
