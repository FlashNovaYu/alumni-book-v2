<template>
  <div class="account-center-card card">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>正在加载账号信息...</p>
    </div>
    
    <div v-else-if="!student" class="unauthorized-state">
      <p>未检测到登录身份，请先登录。</p>
      <button class="btn btn-primary" @click="goToLogin">前往首页登录</button>
    </div>

    <div v-else class="account-dashboard">
      <!-- 身份展示区 -->
      <div class="profile-summary">
        <div class="avatar-container">
          <img v-if="student.avatarUrl" :src="student.avatarUrl" class="user-avatar" alt="头像" />
          <div v-else class="avatar-fallback">{{ student.name.charAt(0) }}</div>
        </div>
        <div class="profile-info">
          <h2 class="user-name">{{ student.name }}</h2>
          <span class="badge">已登录同学</span>
        </div>
      </div>

      <!-- 快速导航操作区 -->
      <div class="quick-links">
        <a :href="`/student/${student.slug}/`" class="link-item btn-secondary">
          <span class="icon">👤</span>
          <span>查看个人主页</span>
        </a>
        <a :href="`/student/${student.slug}/?edit=1`" class="link-item btn-secondary">
          <span class="icon">✏️</span>
          <span>编辑个人资料</span>
        </a>
      </div>

      <!-- 修改密码表单 -->
      <div class="password-change-section">
        <h3>安全设置</h3>
        <p class="section-desc">修改您的专属登录密码（不少于 8 位）</p>
        
        <form @submit.prevent="handlePasswordChange" class="password-form">
          <div class="form-group">
            <label for="old-password">原密码</label>
            <input 
              id="old-password" 
              type="password" 
              v-model="passwordForm.oldPassword" 
              required 
              placeholder="请输入当前密码" 
            />
          </div>

          <div class="form-group">
            <label for="new-password">新密码</label>
            <input 
              id="new-password" 
              type="password" 
              v-model="passwordForm.newPassword" 
              required 
              placeholder="最少 8 位新密码" 
            />
          </div>

          <div class="form-group">
            <label for="confirm-password">确认新密码</label>
            <input 
              id="confirm-password" 
              type="password" 
              v-model="passwordForm.confirmPassword" 
              required 
              placeholder="请再次输入新密码" 
            />
          </div>

          <div v-if="formError" class="error-msg">⚠️ {{ formError }}</div>
          <div v-if="formSuccess" class="success-msg">✨ {{ formSuccess }}</div>

          <button 
            type="submit" 
            class="btn btn-primary w-full" 
            :disabled="submitting"
          >
            {{ submitting ? '正在提交...' : '确认修改密码' }}
          </button>
        </form>
      </div>

      <!-- 登出区域 -->
      <div class="logout-section">
        <button class="btn btn-danger w-full" @click="handleLogout" :disabled="submitting">
          退出当前账号
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { getClassmateStudent, clearClassmateSession } from '@alumni/shared'
import { changeClassmatePassword, logoutClassmate } from '../api/classmateAuth'

const props = defineProps<{
  apiBase: string
}>()

interface StudentInfo {
  name: string
  slug: string
  avatarUrl: string | null
}

const student = ref<StudentInfo | null>(null)
const loading = ref(true)
const submitting = ref(false)
const formError = ref('')
const formSuccess = ref('')

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

onMounted(() => {
  const current = getClassmateStudent<StudentInfo>()
  if (current) {
    student.value = current
  } else {
    goToLogin()
  }
  loading.value = false
})

function goToLogin() {
  if (typeof window !== 'undefined') {
    window.location.href = '/'
  }
}

async function handlePasswordChange() {
  formError.value = ''
  formSuccess.value = ''

  if (passwordForm.newPassword.length < 8) {
    formError.value = '新密码长度不能少于 8 位'
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    formError.value = '两次输入的新密码不一致'
    return
  }

  submitting.value = true
  try {
    await changeClassmatePassword(props.apiBase, passwordForm.oldPassword, passwordForm.newPassword)
    formSuccess.value = '密码修改成功！'
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
  } catch (err: any) {
    formError.value = err.message || '修改密码失败，请检查原密码'
  } finally {
    submitting.value = false
  }
}

async function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return
  submitting.value = true
  try {
    await logoutClassmate(props.apiBase)
  } catch (err) {
    console.error('Logout error:', err)
  } finally {
    clearClassmateSession()
    goToLogin()
  }
}
</script>

<style scoped>
.account-center-card {
  max-width: 500px;
  margin: 0 auto;
  padding: 30px;
  background: var(--color-surface-card, #fff);
  border-radius: var(--rounded-lg, 12px);
  box-shadow: var(--shadow-sm, 0 4px 12px rgba(0, 0, 0, 0.05));
}

.profile-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-hairline, #eee);
}

.avatar-container {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-primary-light, #ffdcd2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  background: var(--color-primary-light, #ffdcd2);
  color: var(--color-primary, #cc785c);
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-name {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--color-text, #333);
}

.badge {
  font-size: 11px;
  background: var(--color-primary-light, #ffdcd2);
  color: var(--color-primary, #cc785c);
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}

.quick-links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 30px;
}

.link-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: var(--rounded-md, 8px);
  background: var(--color-surface-cream, #fcfaf7);
  border: 1px solid var(--color-hairline, #eee);
  color: var(--color-text, #333);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all var(--duration-fast, 0.2s);
}

.link-item:hover {
  background: var(--color-primary-light, #ffdcd2);
  border-color: var(--color-primary, #cc785c);
  color: var(--color-primary, #cc785c);
}

.password-change-section {
  margin-bottom: 30px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-hairline, #eee);
}

.password-change-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.section-desc {
  font-size: 13px;
  color: var(--color-muted, #666);
  margin: 0 0 20px 0;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-muted, #555);
}

.form-group input {
  padding: 10px 14px;
  border: 1px solid var(--color-hairline, #ccc);
  border-radius: var(--rounded-md, 8px);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input:focus {
  border-color: var(--color-primary, #cc785c);
}

.error-msg {
  color: var(--color-error, #c62828);
  font-size: 13px;
}

.success-msg {
  color: var(--color-success, #2e7d32);
  font-size: 13px;
}

.btn {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--rounded-md, 8px);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--color-primary, #cc785c);
  color: #fff;
}

.btn-primary:hover {
  background: var(--color-primary-strong, #b56146);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-danger {
  background: transparent;
  color: var(--color-error, #c62828);
  border: 1px solid var(--color-error, #c62828);
}

.btn-danger:hover {
  background: rgba(198, 40, 40, 0.05);
}

.w-full {
  width: 100%;
}

.loading-state, .unauthorized-state {
  text-align: center;
  padding: 40px 0;
  color: var(--color-muted, #666);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-hairline, #eee);
  border-top-color: var(--color-primary, #cc785c);
  border-radius: 50%;
  margin: 0 auto 16px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
