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

    <div class="login-form">
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
            @keydown.enter="handleLogin"
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
            @keydown.enter="handleLogin"
          />
        </div>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>

      <button class="btn-primary login-btn" @click="handleLogin" :disabled="loading">
        <span>{{ loading ? '翻阅中...' : '翻开回忆' }}</span>
      </button>
    </div>

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
  width: min(100%, 460px);
  margin: 0 auto;
  padding: var(--spacing-xl);
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(173, 128, 81, 0.08) 1px, transparent 1px),
    var(--texture-paper-fiber),
    var(--color-paper-card);
  background-size: 28px 100%, 100% 100%, auto;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-panel);
  color: var(--color-paper-ink);
}

.paper-login::before {
  content: '';
  position: absolute;
  inset: var(--spacing-sm);
  border: 1px solid rgba(173, 128, 81, 0.14);
  border-radius: var(--rounded-md);
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
  color: var(--color-paper-ink);
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 500;
  letter-spacing: 0;
}

.paper-login__header p,
.paper-login__note {
  color: var(--color-paper-muted);
  font-size: var(--type-body-sm-size);
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
  color: var(--color-paper-ink-soft);
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
  color: var(--color-paper-ink);
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-sm);
  outline: none;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-fast) var(--ease-out-quart);
}

.retro-input::placeholder {
  color: color-mix(in srgb, var(--color-paper-muted) 72%, transparent);
}

.retro-input:focus {
  border-color: var(--color-paper-brown);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-paper-brown) 16%, transparent);
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
