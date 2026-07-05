<!-- packages/site-astro/src/components/ClassmateLoginBook.vue -->
<!-- CCSwitch: 同学录复古纪念册登录界面。用户自主输入姓名与密码，具有精致的书签、书写线动效和双页拟真设计。 -->

<template>
  <div class="login-book-container fade-in">
    <div class="login-book">
      <!-- 纪念册左页：温馨回忆与寄语 -->
      <div class="book-page page-left">
        <div class="page-content">
          <div class="ink-title">同学录</div>
          <div class="ink-subtitle">Class Memory Book</div>
          <div class="decorative-line"></div>
          <p class="ink-text">
            “那些被风吹散的夏天，<br/>
            被妥帖地珍藏在这本纪念册里。<br/>
            翻开它，让时光倒流，<br/>
            让我们在文字与照片的温度里重逢。”
          </p>
          <div class="doodle-plane">✈</div>
        </div>
      </div>

      <!-- 书脊阴影分界线 -->
      <div class="book-spine"></div>

      <!-- 纪念册右页：入馆凭证/登录表单 -->
      <div class="book-page page-right">
        <div class="page-content">
          <div class="form-title">身份验证</div>
          <p class="form-subtitle">请输入你的入馆凭证</p>

          <div class="login-form">
            <!-- 姓名输入框 -->
            <div class="form-group">
              <label class="form-label" for="username-input">你的姓名</label>
              <div class="input-wrapper">
                <input
                  id="username-input"
                  v-model="username"
                  type="text"
                  class="retro-input"
                  placeholder="请输入你的真实姓名或账号"
                  autocomplete="username"
                  @keydown.enter="handleLogin"
                />
                <span class="focus-line"></span>
                <span class="input-icon">✍️</span>
              </div>
            </div>

            <!-- 密码输入框 -->
            <div class="form-group">
              <label class="form-label" for="password-input">入馆密码</label>
              <div class="input-wrapper">
                <input
                  id="password-input"
                  v-model="password"
                  type="password"
                  class="retro-input"
                  placeholder="请输入你的入馆密码"
                  autocomplete="current-password"
                  @keydown.enter="handleLogin"
                />
                <span class="focus-line"></span>
                <span class="input-icon">🔑</span>
              </div>
            </div>

            <div v-if="error" class="error-msg">{{ error }}</div>

            <button class="btn-primary login-btn" @click="handleLogin" :disabled="loading">
              <span class="btn-text">{{ loading ? '翻阅中...' : '翻开回忆' }}</span>
              <span class="btn-hover-bg"></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 首次登录强制改密弹窗 -->
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
import { classmateLogin } from '../api/classmateAuth'
import { setClassmateSession, clearClassmateSession } from '@alumni/shared'
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
    error.value = '请输入你的姓名'
    return
  }
  if (!pwdVal) {
    error.value = '请输入入馆密码'
    return
  }

  loading.value = true
  try {
    const data = await classmateLogin(props.apiBase, nameVal, pwdVal)
    
    // 保存统一会话信息
    setClassmateSession(data.token, data.student)

    if (data.mustChangePassword) {
      showChangePasswordModal.value = true
    } else {
      // 登录成功，跳转到前置页面
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
.login-book-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 2rem 1rem;
}

/* 书本主容器：拟真双页 */
.login-book {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 820px;
  min-height: 480px;
  background-color: #fbfaf7;
  border: 1px solid #dcd7ca;
  border-radius: 8px;
  box-shadow: 0 15px 45px rgba(62, 50, 35, 0.12),
              inset 0 0 40px rgba(244, 240, 228, 0.6);
  overflow: hidden;
}

/* 书本单页 */
.book-page {
  flex: 1;
  padding: 3rem 2.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
}

/* 左页设计：怀旧文艺 */
.page-left {
  background: linear-gradient(to right, #f7f5ee, #fbfaf7);
  border-right: 1px solid rgba(62, 50, 35, 0.05);
}

.page-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
}

.ink-title {
  font-family: var(--font-display), "Noto Serif SC", serif;
  font-size: 2.5rem;
  font-weight: 700;
  color: #3e3223;
  letter-spacing: 0.15em;
  margin-bottom: 0.25rem;
}

.ink-subtitle {
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  text-transform: uppercase;
  color: #8c7f6e;
  letter-spacing: 0.2em;
}

.decorative-line {
  width: 60px;
  height: 2px;
  background-color: #cc785c;
  margin: 1.5rem 0;
}

.ink-text {
  font-family: var(--font-display), "Noto Serif SC", serif;
  font-size: var(--type-body-md-size);
  color: #5c4e3c;
  line-height: 2;
  letter-spacing: 0.05em;
  margin-bottom: 2rem;
}

.doodle-plane {
  font-size: 1.5rem;
  color: rgba(204, 120, 92, 0.4);
  transform: rotate(-15deg);
  align-self: flex-start;
  animation: float 4s ease-in-out infinite;
}

/* 书脊：中央阴影 */
.book-spine {
  width: 16px;
  background: linear-gradient(to right, 
    rgba(0, 0, 0, 0.05) 0%, 
    rgba(0, 0, 0, 0.15) 30%, 
    rgba(0, 0, 0, 0.0) 50%, 
    rgba(0, 0, 0, 0.12) 70%, 
    rgba(0, 0, 0, 0.03) 100%
  );
  border-left: 1px solid rgba(62, 50, 35, 0.06);
  border-right: 1px solid rgba(62, 50, 35, 0.06);
  flex-shrink: 0;
}

/* 右页设计：身份表单 */
.page-right {
  background: linear-gradient(to left, #f5f3eb, #fbfaf7);
}

.form-title {
  font-family: var(--font-display), "Noto Serif SC", serif;
  font-size: 1.75rem;
  font-weight: 700;
  color: #3e3223;
  letter-spacing: 0.1em;
  margin-bottom: 0.35rem;
}

.form-subtitle {
  font-size: 0.85rem;
  color: #8c7f6e;
  margin-bottom: 2rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: #8c7f6e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 输入框包装：底边书写线 */
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.retro-input {
  width: 100%;
  padding: 10px 30px 10px 0;
  font-size: 15px;
  color: #3e3223;
  background: transparent;
  border: none;
  border-bottom: 1px solid #dcd7ca;
  outline: none;
  transition: border-color var(--duration-fast);
}

.retro-input::placeholder {
  color: #bfae99;
  font-size: 13px;
}

/* 焦点书写线扩展动效 */
.focus-line {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #cc785c;
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--duration-normal) var(--ease-out-quart);
}

.retro-input:focus ~ .focus-line {
  transform: scaleX(1);
}

.input-icon {
  position: absolute;
  right: 4px;
  font-size: 14px;
  pointer-events: none;
  opacity: 0.5;
  transition: opacity var(--duration-fast);
}

.retro-input:focus ~ .input-icon {
  opacity: 1;
}

/* 错误提示 */
.error-msg {
  font-size: 13px;
  color: var(--color-error);
}

/* 翻开回忆按钮：复古墨水展开特效 */
.login-btn {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 44px;
  margin-top: 1rem;
  background-color: #cc785c;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(204, 120, 92, 0.2);
  transition: transform var(--duration-fast), box-shadow var(--duration-fast);
}

.login-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(204, 120, 92, 0.3);
}

.login-btn:active {
  transform: translateY(1px);
}

.login-btn:disabled {
  background-color: #dfdcd3;
  box-shadow: none;
  cursor: not-allowed;
}

.btn-text {
  position: relative;
  z-index: 2;
  font-size: 15px;
  font-weight: 500;
  color: #ffffff;
  letter-spacing: 0.1em;
}

.login-btn:disabled .btn-text {
  color: #9c978b;
}

/* 墨水扩散动效 */
.btn-hover-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  background-color: #b36349;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0);
  transition: transform 0.6s var(--ease-out-quart);
  z-index: 1;
}

.login-btn:hover .btn-hover-bg {
  transform: translate(-50%, -50%) scale(25);
}

/* Float 浮动动画 */
@keyframes float {
  0%, 100% { transform: translateY(0) rotate(-15deg); }
  50% { transform: translateY(-8px) rotate(-10deg); }
}

/* 渐入动效 */
.fade-in {
  animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 响应式断点 */
@media (max-width: 768px) {
  .login-book {
    flex-direction: column;
    min-height: auto;
  }
  .book-page {
    padding: 2.25rem 1.75rem;
  }
  .page-left {
    border-right: none;
    border-bottom: 1px solid rgba(62, 50, 35, 0.08);
  }
  .book-spine {
    display: none;
  }
  .ink-title {
    font-size: 2rem;
  }
}
</style>
