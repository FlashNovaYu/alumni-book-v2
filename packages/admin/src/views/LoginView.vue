<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="brand-mark">✦</span>
        <h1 class="brand-text">同学录管理</h1>
      </div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">管理员用户名</label>
          <input v-model="username" type="text" class="text-input" autocomplete="username" />
        </div>
        <div class="form-group">
          <label class="form-label">管理密码</label>
          <input
            v-model="password"
            type="password"
            class="text-input"
            placeholder="请输入管理密码"
            autocomplete="current-password"
          />
        </div>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button type="submit" class="btn-primary login-btn" :disabled="loading">
          {{ loading ? '验证中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminLogin } from '@/api/client'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!username.value.trim() || !password.value.trim()) {
    error.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const result = await adminLogin(username.value, password.value)
    router.push(result.needsSetup ? '/setup' : '/dashboard')
  } catch (e: any) {
    error.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-surface-soft);
}

.login-card {
  width: 100%;
  max-width: 380px;
  background-color: var(--color-canvas);
  border-radius: var(--rounded-lg);
  padding: var(--spacing-xxl);
  box-shadow: var(--shadow-subtle);
}

.login-brand {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.brand-mark {
  font-size: 24px;
  color: var(--color-primary);
}

.brand-text {
  font-family: var(--font-display);
  font-size: var(--type-display-sm-size);
  font-weight: 500;
  color: var(--color-ink);
  margin-top: var(--spacing-xs);
}

.login-btn {
  width: 100%;
  margin-top: var(--spacing-md);
}

.login-error {
  color: var(--color-error);
  font-size: var(--type-body-sm-size);
  margin-top: var(--spacing-xs);
}
</style>
