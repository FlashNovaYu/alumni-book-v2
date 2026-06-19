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

<script setup>
import { ref } from 'vue'

const name = ref('')
const error = ref('')
const loading = ref(false)
const base = import.meta.env.BASE_URL || '/'
const API_BASE = import.meta.env.VITE_API_BASE_URL || (base.endsWith('/') ? base.slice(0, -1) : base)

async function handleEnter() {
  const trimmed = name.value.trim()
  error.value = ''
  if (!trimmed) { error.value = '请输入你的姓名'; return }
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/api/classmates`)
    const data = await res.json()
    const found = (data.data || []).find(c => c.name === trimmed)
    if (!found) { error.value = '姓名未在同学录中找到，请确认后重试'; return }
    sessionStorage.setItem('classmate_name', trimmed)
    window.location.href = `${import.meta.env.BASE_URL}preface`
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
