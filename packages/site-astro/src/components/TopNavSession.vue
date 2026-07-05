<!-- packages/site-astro/src/components/TopNavSession.vue -->
<!-- CCSwitch: 导航栏全局登录状态与退出登录的 Vue 交互岛组件。 -->

<template>
  <!-- 水合挂载前渲染等宽骨架屏占位，彻底消除横向撑开抖动 -->
  <div v-if="!isMounted" class="nav-session skeleton-placeholder">
    <span class="skeleton-text"></span>
    <span class="skeleton-btn"></span>
  </div>
  
  <!-- 挂载完毕后呈现真实的登录身份 -->
  <div v-else-if="student" class="nav-session">
    <span class="session-name">{{ student.name }}同学</span>
    <button class="btn-logout" @click="handleLogout">退出</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getClassmateStudent, clearClassmateSession } from '@alumni/shared'
import { logoutClassmate } from '../api/classmateAuth'

const props = defineProps<{ apiBase: string }>()

const student = ref<{ name: string; slug: string } | null>(null)
const isMounted = ref(false)

onMounted(() => {
  student.value = getClassmateStudent<{ name: string; slug: string }>()
  isMounted.value = true
})

async function handleLogout() {
  if (confirm('确认关闭并退出你的纪念册？')) {
    try {
      await logoutClassmate(props.apiBase)
    } catch {}
    clearClassmateSession()
    window.location.href = '/'
  }
}
</script>

<style scoped>
.nav-session {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-left: var(--spacing-xs);
  padding-left: var(--spacing-sm);
  border-left: 1px solid var(--color-hairline);
  font-size: var(--type-nav-link-size);
  height: 20px; /* 固定高度防止纵向抖动 */
}

.session-name {
  color: var(--color-muted);
  font-weight: 500;
  white-space: nowrap;
}

.btn-logout {
  background: none;
  border: none;
  color: #cc785c;
  cursor: pointer;
  padding: 0;
  font-weight: 500;
  transition: color var(--duration-fast);
  white-space: nowrap;
}

.btn-logout:hover {
  color: #b36349;
}

/* 骨架屏占位样式 */
.skeleton-placeholder {
  pointer-events: none;
  opacity: 0.65;
}

.skeleton-text {
  display: inline-block;
  width: 60px;
  height: 12px;
  background: linear-gradient(90deg, rgba(62, 50, 35, 0.05) 25%, rgba(62, 50, 35, 0.1) 37%, rgba(62, 50, 35, 0.05) 63%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
  border-radius: 4px;
}

.skeleton-btn {
  display: inline-block;
  width: 28px;
  height: 12px;
  background: rgba(204, 120, 92, 0.08);
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@media (max-width: 768px) {
  .nav-session {
    border-left: none;
    border-top: 1px solid var(--color-hairline);
    margin-left: 0;
    padding-left: 0;
    padding-top: var(--spacing-sm);
    width: 100%;
    height: auto;
    justify-content: center;
  }
}
</style>
