<!-- packages/site-astro/src/components/TopNavSession.vue -->
<!-- CCSwitch: 导航栏全局登录状态与退出登录的 Vue 交互岛组件。 -->

<template>
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
}

.session-name {
  color: var(--color-muted);
  font-weight: 500;
}

.btn-logout {
  background: none;
  border: none;
  color: #cc785c;
  cursor: pointer;
  padding: 0;
  font-weight: 500;
  transition: color var(--duration-fast);
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
    justify-content: center;
  }
}
</style>
