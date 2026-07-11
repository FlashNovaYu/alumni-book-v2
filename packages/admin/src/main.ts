import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import '@alumni/shared/src/tokens.css'
import './styles/admin.css'
import { fetchCurrentAdmin } from './api/client'

const adminBase = import.meta.env.BASE_URL || '/admin/'
const router = createRouter({
  history: createWebHashHistory(adminBase),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/setup', name: 'setup', component: () => import('./views/AdminSetupView.vue') },
    { path: '/classmate', name: 'classmate-entry', component: () => import('./views/ClassmateEntryView.vue') },
    { path: '/', component: () => import('./views/AdminLayout.vue'), children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
      { path: 'students', name: 'students', component: () => import('./views/StudentsView.vue') },
      { path: 'students/:id', name: 'student-edit', component: () => import('./views/StudentEditView.vue') },
      { path: 'albums', name: 'albums', component: () => import('./views/AlbumsView.vue') },
      { path: 'messages', name: 'messages', component: () => import('./views/MessagesView.vue') },
      { path: 'timeline', name: 'timeline', component: () => import('./views/TimelineEventsView.vue') },
      { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
      { path: 'mail', name: 'mail', component: () => import('./views/MailView.vue') },
      { path: 'accounts', name: 'accounts', component: () => import('./views/AdminAccountsView.vue') },
      { path: 'audit-logs', name: 'audit-logs', component: () => import('./views/AuditLogView.vue') },
    ] },
  ],
})

router.beforeEach(async (to) => {
  if (['login', 'setup', 'classmate-entry'].includes(String(to.name))) {
    if (to.name === 'login' && sessionStorage.getItem('admin_token')) return { name: 'dashboard' }
    return true
  }
  if (!sessionStorage.getItem('admin_token')) return { name: 'login' }
  try {
    await fetchCurrentAdmin()
    return true
  } catch {
    sessionStorage.removeItem('admin_token')
    return { name: 'login' }
  }
})

createApp(App).use(router).mount('#app')
