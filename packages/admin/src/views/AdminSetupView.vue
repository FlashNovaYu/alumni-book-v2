<template>
  <div class="login-page"><form class="login-card" @submit.prevent="submit"><h1 class="brand-text">初始化主管理员</h1><div class="form-group"><label class="form-label">用户名</label><input v-model="form.username" class="text-input" /></div><div class="form-group"><label class="form-label">显示名</label><input v-model="form.displayName" class="text-input" /></div><div class="form-group"><label class="form-label">新密码</label><input v-model="form.password" type="password" class="text-input" /></div><div class="form-group"><label class="form-label">确认新密码</label><input v-model="form.confirmPassword" type="password" class="text-input" /></div><p v-if="error" class="login-error">{{ error }}</p><button class="btn-primary login-btn" :disabled="loading">{{ loading ? '保存中...' : '完成初始化' }}</button></form></div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminSetup } from '@/api/client'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const form = reactive({ username: '', displayName: '', password: '', confirmPassword: '' })

async function submit() {
  loading.value = true
  error.value = ''
  try { await adminSetup(form); await router.push('/login') } catch (err: unknown) { error.value = err instanceof Error ? err.message : '初始化失败' } finally { loading.value = false }
}
</script>
