<template>
  <div class="hero-form">
    <div class="input-group">
      <input
        v-model="name"
        type="text"
        class="text-input hero-input"
        placeholder="请输入你的真实姓名"
        maxlength="20"
        autocomplete="off"
        @keydown.enter="handleEnter"
      />
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
    <button class="btn-primary hero-btn" @click="handleEnter" :disabled="loading">
      {{ loading ? '验证中...' : '开启回忆' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { joinApiUrl } from '../utils/apiBase'

const props = defineProps<{
  apiBase: string
}>()

const name = ref('')
const error = ref('')
const loading = ref(false)

async function handleEnter() {
  const trimmed = name.value.trim()
  error.value = ''
  if (!trimmed) { error.value = '请输入你的姓名'; return }
  loading.value = true
  try {
    const url = joinApiUrl(props.apiBase, '/api/classmates')
    const res = await fetch(url)
    const data = await res.json()
    const found = (data.data || []).find(c => c.name === trimmed)
    if (!found) { error.value = '姓名未在同学录中找到，请确认后重试'; return }
    sessionStorage.setItem('classmate_name', trimmed)
    
    // 确保使用斜杠前缀安全跳转
    const baseUrl = import.meta.env.BASE_URL || '/'
    const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    window.location.href = `${prefix}preface`
  } catch {
    error.value = '验证失败，请稍后重试'
  } finally { loading.value = false }
}
</script>

<style scoped>
.hero-form {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-lg);
}
.input-group { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.hero-input { text-align: center; font-size: 16px; height: 48px; }
.hero-btn { height: 48px; font-size: 16px; letter-spacing: 0.15em; width: 100%; }
.error-text { font-size: var(--type-body-sm-size); color: var(--color-error); text-align: center; }
</style>
