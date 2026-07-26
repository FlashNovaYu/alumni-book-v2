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
  width: min(100%, 460px);
  margin: 0 auto;
  padding: 32px 36px 36px;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(173, 128, 81, 0.06) 1px, transparent 1px),
    linear-gradient(0deg, rgba(173, 128, 81, 0.06) 1px, transparent 1px),
    #FDFBF7;
  background-size: 24px 24px;
  border: 1px solid rgba(212, 195, 163, 0.8);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(96, 75, 48, 0.16);
  color: #2C2219;
}

.paper-login::before {
  content: '';
  position: absolute;
  inset: 10px;
  border: 1px dashed rgba(173, 128, 81, 0.18);
  border-radius: 12px;
  pointer-events: none;
}

.paper-login__stamp {
  position: absolute;
  top: 28px;
  right: 28px;
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border: 1.5px solid #C47963;
  border-radius: 50%;
  color: #C47963;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  opacity: 0.85;
  transform: rotate(12deg);
}

.paper-login__header,
.login-form,
.paper-login__note {
  position: relative;
  z-index: 1;
}

.paper-login__header {
  padding-right: 70px;
  margin-bottom: 24px;
}

.paper-login__eyebrow {
  margin-bottom: 6px;
  color: #937149;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.paper-login__header h3 {
  margin: 0 0 8px;
  color: #2C2219;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
}

.paper-login__header p,
.paper-login__note {
  color: #6E5F50;
  font-size: 13px;
  line-height: 1.7;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  color: #423427;
  font-size: 12.5px;
  font-weight: 600;
}

.input-wrapper {
  position: relative;
}

.retro-input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  color: #2C2219;
  background: rgba(235, 227, 213, 0.55);
  border: 1px solid rgba(188, 165, 138, 0.5);
  border-radius: 8px;
  outline: none;
  font-size: 13.5px;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

.retro-input::placeholder {
  color: #A39380;
}

.retro-input:focus {
  border-color: #8F5528;
  background: #FFFDF9;
  box-shadow: 0 0 0 3px rgba(143, 85, 40, 0.15);
}

.error-msg {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(188, 79, 60, 0.1);
  color: #BC4F3C;
  font-size: 13px;
}

.login-btn {
  width: 100%;
  min-height: 44px;
  margin-top: 6px;
  background: #8E361B;
  color: #FFFFFF;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  box-shadow: 0 6px 18px rgba(142, 54, 27, 0.28);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.login-btn:hover {
  background: #7A2E16;
  box-shadow: 0 8px 22px rgba(142, 54, 27, 0.35);
  transform: translateY(-1px);
}

.login-btn:disabled {
  background: #C4B5A3;
  color: #8C7B6B;
  cursor: not-allowed;
  box-shadow: none;
}

.paper-login__note {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed rgba(173, 128, 81, 0.25);
}

@media (max-width: 768px) {
  .paper-login {
    padding: 24px;
    border-radius: 12px;
  }

  .paper-login__header {
    padding-right: 0;
  }

  .paper-login__stamp {
    position: static;
    margin-left: auto;
    margin-bottom: 16px;
    width: 50px;
    height: 50px;
  }
}
</style>
