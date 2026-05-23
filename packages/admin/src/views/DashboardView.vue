<template>
  <div class="dashboard">
    <div class="page-header">
      <h1 class="page-title">控制台</h1>
    </div>
    <div v-if="loading" class="stats-grid">
      <div v-for="i in 3" :key="i" class="stat-card card">
        <div class="skeleton-block" style="width:80px;height:48px;margin:0 auto var(--spacing-xs);border-radius:var(--rounded-sm);"></div>
        <div class="skeleton-block" style="width:60px;height:14px;margin:0 auto;border-radius:var(--rounded-sm);"></div>
      </div>
    </div>
    <div v-else class="stats-grid">
      <div class="stat-card card">
        <div class="stat-number">{{ stats.studentCount }}</div>
        <div class="stat-label">学生总数</div>
      </div>
      <div class="stat-card card">
        <div class="stat-number">{{ stats.albumCount }}</div>
        <div class="stat-label">相册数量</div>
      </div>
      <div class="stat-card card">
        <div class="stat-number">{{ stats.photoCount }}</div>
        <div class="stat-label">照片总数</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminFetch } from '@/api/client'
import type { ApiResponse } from '@alumni/shared'

const stats = ref({ studentCount: 0, albumCount: 0, photoCount: 0 })
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await adminFetch<ApiResponse<typeof stats.value>>('/api/admin/stats')
    if (res.data) stats.value = res.data
  } catch {
    // 使用默认值
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-lg);
}

.stat-card {
  text-align: center;
  padding: var(--spacing-xl);
}

.stat-number {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 500;
  color: var(--color-primary);
  line-height: 1;
  margin-bottom: var(--spacing-xs);
}

.stat-label {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
}

.skeleton-block {
  background: linear-gradient(90deg, var(--color-surface-cream-strong) 25%, var(--color-surface-card) 50%, var(--color-surface-cream-strong) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
</style>
