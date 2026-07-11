<template>
  <div class="login-page"><div class="login-card"><h1 class="brand-text">正在进入管理后台</h1><p v-if="error" class="login-error">{{ error }}</p><p v-else>正在验证同学账号的管理权限…</p></div></div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { exchangeClassmateSession } from '@/api/client'

const router = useRouter()
const error = ref('')

onMounted(async () => {
  try {
    await exchangeClassmateSession()
    await router.replace('/dashboard')
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '进入管理后台失败'
  }
})
</script>
