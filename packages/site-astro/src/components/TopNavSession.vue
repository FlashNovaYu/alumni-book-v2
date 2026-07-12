<!-- packages/site-astro/src/components/TopNavSession.vue -->
<!-- CCSwitch: 导航栏全局登录状态与退出登录的 Vue 交互岛组件。 -->

<template>
  <!-- 水合挂载完毕后，承载真实的响应式退出动作 -->
  <div v-if="student" class="nav-session">
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

onMounted(() => {
  student.value = getClassmateStudent<{ name: string; slug: string }>()
  
  // 只要 Vue 交互岛完成挂载，立刻隐式退场静态存根，实现无缝接管
  const staticEl = document.getElementById('classmate-static-session')
  if (staticEl) {
    staticEl.style.display = 'none'
  }
})

async function handleLogout() {
  if (confirm('确认关闭并退出你的纪念册？')) {
    try {
      await logoutClassmate(props.apiBase)
    } catch {}
    clearClassmateSession()
    window.location.href = import.meta.env.BASE_URL || '/'
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
  height: 20px;
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
