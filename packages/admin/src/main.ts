import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import { verifyAdminToken } from './api/client'
import '@alumni/shared/src/tokens.css'
import './styles/admin.css'

const adminBase = import.meta.env.BASE_URL || '/admin/'

const router = createRouter({
  history: createWebHashHistory(adminBase),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
    },
    {
      path: '/',
      component: () => import('./views/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
        { path: 'students', name: 'students', component: () => import('./views/StudentsView.vue') },
        { path: 'students/:id', name: 'student-edit', component: () => import('./views/StudentEditView.vue') },
        { path: 'albums', name: 'albums', component: () => import('./views/AlbumsView.vue') },
        { path: 'messages', name: 'messages', component: () => import('./views/MessagesView.vue') },
        { path: 'timeline', name: 'timeline', component: () => import('./views/TimelineEventsView.vue') },
        { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
        { path: 'mail', name: 'mail', component: () => import('./views/MailView.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const token = sessionStorage.getItem('admin_token')
  const isLoggedIn = !!token

  if (to.name !== 'login') {
    if (!isLoggedIn) {
      return { name: 'login' }
    }
    if (!(window as any).__admin_token_verified) {
      try {
        const isValid = await verifyAdminToken(token)
        if (!isValid) {
          sessionStorage.removeItem('admin_token')
          return { name: 'login' }
        }
        (window as any).__admin_token_verified = true
      } catch {
        // 网络连接失败暂不强制退出，保持高可用性
      }
    }
  } else {
    if (isLoggedIn) {
      return { name: 'dashboard' }
    }
  }
})

const app = createApp(App)
app.use(router)
app.mount('#app')
