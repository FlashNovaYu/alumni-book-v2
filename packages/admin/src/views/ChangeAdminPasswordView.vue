<template>
  <main class="password-page">
    <form class="password-card" @submit.prevent="submit">
      <p class="eyebrow">ACCOUNT SECURITY</p>
      <h1>修改初始密码</h1>
      <p class="intro">为保护管理权限，请先设置仅你本人知晓的新密码。</p>
      <label>旧密码<input v-model="form.oldPassword" class="text-input" type="password" autocomplete="current-password" required /></label>
      <label>新密码<input v-model="form.newPassword" class="text-input" type="password" minlength="8" autocomplete="new-password" required /></label>
      <label>确认新密码<input v-model="form.confirmPassword" class="text-input" type="password" minlength="8" autocomplete="new-password" required /></label>
      <p v-if="error" class="login-error">{{ error }}</p>
      <button class="btn-primary" :disabled="saving">{{ saving ? '保存中…' : '保存并进入工作台' }}</button>
    </form>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { changeAdminPassword, fetchCurrentAdmin } from '@/api/client'

const router = useRouter()
const saving = ref(false)
const error = ref('')
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

async function submit() {
  if (form.newPassword !== form.confirmPassword) { error.value = '两次输入的新密码不一致'; return }
  saving.value = true; error.value = ''
  try {
    await changeAdminPassword(form.oldPassword, form.newPassword, form.confirmPassword)
    await fetchCurrentAdmin()
    await router.replace({ name: 'dashboard' })
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '密码修改失败'
  } finally { saving.value = false }
}
</script>

<style scoped>
.password-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top right,var(--color-surface-cream-strong),transparent 42%),var(--color-surface-cream)}.password-card{width:min(100%,430px);display:grid;gap:14px;padding:clamp(24px,5vw,42px);background:var(--color-surface-card);border:1px solid var(--color-hairline);border-top:4px solid var(--color-primary);border-radius:var(--rounded-lg);box-shadow:0 18px 46px rgba(53,38,28,.11)}.eyebrow{margin:0;color:var(--color-primary);font-size:11px;font-weight:700;letter-spacing:.14em}.password-card h1{margin:0;font-family:var(--font-display);font-size:30px}.intro{margin:0 0 6px;color:var(--color-muted);line-height:1.65}.password-card label{display:grid;gap:6px;font-size:13px;font-weight:600}.password-card button{margin-top:8px;min-height:44px}.login-error{margin:0}@media(max-width:480px){.password-page{padding:16px}.password-card{padding:28px 22px}}
</style>
