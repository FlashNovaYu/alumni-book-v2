<!-- packages/site-astro/src/components/ClassmateLoginBook.vue -->
<!-- CCSwitch: 同学账号登录表单。单页复古纸张布局，保留测试锚点和首次登录改密流程。 -->

<template>
  <div class="paper-login">
    <div class="paper-login__stamp" aria-hidden="true">PASS</div>
    <div class="paper-login__header">
      <p class="paper-login__eyebrow">Memory Archive</p>
      <h3>同学录登录</h3>
      <p>请选择自己的姓名或账号，使用管理员发放的初始密码进入。</p>
    </div>

    <form class="login-form" @submit.prevent="handleLogin">
      <div class="form-group">
        <label class="form-label" for="username-input">同学账号</label>
        <div class="input-wrapper">
          <input
            id="username-input"
            v-model="username"
            type="text"
            class="retro-input"
            placeholder="输入姓名或账号"
            autocomplete="username"
          />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="password-input">登录密码</label>
        <div class="input-wrapper">
          <input
            id="password-input"
            v-model="password"
            type="password"
            class="retro-input"
            placeholder="输入初始密码或自定义密码"
            autocomplete="current-password"
          />
        </div>
      </div>

      <div v-if="error" class="error-msg" role="alert">{{ error }}</div>

      <button type="submit" class="btn-primary login-btn" :disabled="loading">
        <span>{{ loading ? '翻阅中...' : '翻开回忆' }}</span>
      </button>
    </form>

    <p class="paper-login__note">首次登录后会自动弹出密码设置页，请按提示完成自己的专属密码。</p>

    <FirstLoginPasswordGuide
      v-if="showChangePasswordModal"
      :api-base="apiBase"
      :slug="username.trim()"
      :old-password="password"
      @completed="handlePasswordChanged"
      @cancel="handlePasswordCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { clearClassmateSession, setClassmateSession } from '@alumni/shared'
import { classmateLogin } from '../api/classmateAuth'
import FirstLoginPasswordGuide from './FirstLoginPasswordGuide.vue'

const props = defineProps<{
  apiBase: string
}>()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const showChangePasswordModal = ref(false)

async function handleLogin() {
  error.value = ''
  const nameVal = username.value.trim()
  const pwdVal = password.value

  if (!nameVal) {
    error.value = '请输入你的姓名或账号'
    return
  }
  if (!pwdVal) {
    error.value = '请输入登录密码'
    return
  }

  loading.value = true
  try {
    const data = await classmateLogin(props.apiBase, nameVal, pwdVal)
    setClassmateSession(data.token, data.student)

    if (data.mustChangePassword) {
      showChangePasswordModal.value = true
    } else {
      const baseUrl = import.meta.env.BASE_URL || '/'
      const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
      window.location.href = `${prefix}preface`
    }
  } catch (err: any) {
    error.value = err.message || '登录失败，密码错误或账号尚未启用'
  } finally {
    loading.value = false
  }
}

function handlePasswordChanged() {
  showChangePasswordModal.value = false
  const baseUrl = import.meta.env.BASE_URL || '/'
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  window.location.href = `${prefix}preface`
}

function handlePasswordCancel() {
  clearClassmateSession()
  showChangePasswordModal.value = false
  password.value = ''
}
</script>

<style scoped>
.paper-login {
  position: relative;
  z-index: 10;
  width: min(100%, 460px);
  margin: 0 auto;
  padding: var(--spacing-xl, 28px);
  overflow: hidden;
  background: #FFFDF8 !important;
  border: 2px solid #D9C8A9 !important;
  border-radius: var(--rounded-lg, 12px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(188, 143, 84, 0.3) !important;
  color: #2B2118 !important;
}

.paper-login::before {
  content: '';
  position: absolute;
  inset: var(--spacing-sm, 8px);
  border: 1px dashed rgba(173, 128, 81, 0.35);
  border-radius: var(--rounded-md, 8px);
  pointer-events: none;
}

.paper-login__stamp {
  position: absolute;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  border: 2px solid color-mix(in srgb, var(--color-paper-stamp-red) 70%, transparent);
  border-radius: 50%;
  color: var(--color-paper-stamp-red);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  opacity: 0.82;
  transform: rotate(10deg);
}

.paper-login__header,
.login-form,
.paper-login__note {
  position: relative;
  z-index: 1;
}

.paper-login__header {
  padding-right: 76px;
  margin-bottom: var(--spacing-xl);
}

.paper-login__eyebrow {
  margin-bottom: var(--spacing-xs);
  color: var(--color-paper-brown);
  font-size: var(--type-caption-uppercase-size);
  font-weight: var(--type-caption-uppercase-weight);
  letter-spacing: var(--type-caption-uppercase-letter-spacing);
  text-transform: uppercase;
}

.paper-login__header h3 {
  margin: 0 0 var(--spacing-xs);
  color: #241B13 !important;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
}

.paper-login__header p,
.paper-login__note {
  color: #614D3C !important;
  font-size: 13.5px;
  line-height: 1.7;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-label {
  color: #382A1D !important;
  font-size: 13px;
  font-weight: 600;
}

.input-wrapper {
  position: relative;
}

.retro-input {
  width: 100%;
  height: 46px;
  padding: 0 var(--spacing-md);
  color: #1A130C !important;
  background: #F8F4EC !important;
  border: 1.5px solid #C4B293 !important;
  border-radius: var(--rounded-sm, 6px);
  outline: none;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.retro-input::placeholder {
  color: #9E8C78 !important;
}

.retro-input:focus {
  border-color: #8C6239 !important;
  background: #FFFFFF !important;
  box-shadow: 0 0 0 3px rgba(140, 98, 57, 0.2) !important;
}

.error-msg {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--rounded-sm);
  background: color-mix(in srgb, var(--color-error) 10%, var(--color-paper-card));
  color: var(--color-error);
  font-size: 13px;
}

.login-btn {
  width: 100%;
  min-height: 46px;
  margin-top: var(--spacing-xs);
  box-shadow: 0 8px 18px rgba(143, 101, 60, 0.18);
}

.login-btn:hover {
  transform: translateY(-1px);
}

.login-btn:disabled {
  background: var(--color-paper-brown-soft);
  color: var(--color-paper-muted);
  cursor: not-allowed;
  box-shadow: none;
}

.paper-login__note {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px dashed var(--color-paper-border);
}

@media (max-width: 768px) {
  .paper-login {
    padding: var(--spacing-lg);
    border-radius: var(--rounded-md);
  }

  .paper-login__header {
    padding-right: 0;
  }

  .paper-login__stamp {
    position: static;
    margin-left: auto;
    margin-bottom: var(--spacing-md);
    width: 54px;
    height: 54px;
  }
}
</style>
