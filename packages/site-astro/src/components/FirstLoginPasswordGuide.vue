<!-- packages/site-astro/src/components/FirstLoginPasswordGuide.vue -->
<!-- CCSwitch: 首次登录强制改密引导组件，具有输入校验和纸张/纪念册卡片主题样式。 -->

<template>
  <div class="modal-overlay">
    <div class="change-password-modal card">
      <div class="modal-header">
        <h2 class="ink-title-sm">第一步：安全装订</h2>
        <p class="form-hint">为了你的账户安全，首次登录需要修改初始密码。</p>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="new-password">新密码</label>
          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            class="text-input"
            placeholder="至少 8 位的新密码"
            autocomplete="new-password"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="confirm-password">确认新密码</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            class="text-input"
            placeholder="请再次输入新密码"
            autocomplete="new-password"
          />
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>
        <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary btn-cancel" @click="handleCancel" :disabled="loading">
          取消
        </button>
        <button class="btn-primary change-password-btn" @click="handleSubmit" :disabled="loading">
          {{ loading ? '更新中...' : '设置并进入' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { changeClassmatePassword } from '../api/classmateAuth'

const props = defineProps<{
  apiBase: string
  slug: string
  oldPassword?: string
}>()

const emit = defineEmits<{
  (e: 'completed'): void
  (e: 'cancel'): void
}>()

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const successMsg = ref('')

async function handleSubmit() {
  error.value = ''
  successMsg.value = ''

  const newPwd = newPassword.value.trim()
  const confirmPwd = confirmPassword.value.trim()

  if (!newPwd) {
    error.value = '新密码不能为空'
    return
  }
  if (newPwd.length < 8) {
    error.value = '新密码至少为 8 位'
    return
  }
  if (newPwd === props.oldPassword) {
    error.value = '新密码不能与初始密码相同'
    return
  }
  if (newPwd !== confirmPwd) {
    error.value = '两次输入的新密码不一致'
    return
  }

  loading.value = true
  try {
    await changeClassmatePassword(props.apiBase, props.oldPassword || '', newPwd)
    successMsg.value = '密码已装订进你的纪念册！'
    setTimeout(() => {
      emit('completed')
    }, 500)
  } catch (err: any) {
    error.value = err.message || '更新密码失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(62, 50, 35, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.change-password-modal {
  width: 90%;
  max-width: 420px;
  background-color: #faf9f5;
  border: 1px solid #d4cdb8;
  box-shadow: 0 10px 40px rgba(62, 50, 35, 0.15),
              inset 0 0 30px rgba(230,225,205,0.2);
  padding: 2.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.ink-title-sm {
  font-family: var(--font-display), "Noto Serif SC", serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: #3e3223;
  margin-bottom: 0.5rem;
  letter-spacing: 0.1em;
}

.form-hint {
  font-size: var(--type-body-sm-size);
  color: #8c7f6e;
  line-height: 1.5;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #5c4e3c;
}

.text-input {
  background-color: #fcfbfa;
  border-color: #d4cdb8;
}

.text-input:focus {
  border-color: #cc785c;
}

.error-msg {
  font-size: 13px;
  color: var(--color-error);
}

.success-msg {
  font-size: 13px;
  color: var(--color-success, #059669);
  font-weight: 500;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: 0.5rem;
}

.btn-cancel {
  border-color: #d4cdb8;
  color: #5c4e3c;
}

.btn-cancel:hover {
  background-color: #f0ebd9;
}

.change-password-btn {
  background-color: #cc785c;
  color: #fff;
  border-radius: 6px;
  font-weight: 500;
}

.change-password-btn:hover {
  background-color: #b36349;
}
</style>
