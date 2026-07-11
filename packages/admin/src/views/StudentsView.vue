<template>
  <div class="students-page">
    <div class="page-header">
      <h1 class="page-title">学生管理</h1>
      <button class="btn-primary" @click="showCreate = true">+ 新建学生</button>
    </div>

    <div class="search-bar">
      <input v-model="keyword" type="text" class="text-input" placeholder="搜索学生姓名…" aria-label="搜索学生" />
    </div>

    <div class="student-list">
      <div v-for="student in filtered" :key="student.id" class="student-row card">
        <div class="student-info">
          <div class="student-avatar">
            <img v-if="student.avatarUrl && !failedAvatarIds.has(student.id)" :src="student.avatarUrl" :alt="student.name" @error="failedAvatarIds.add(student.id)" />
            <span v-else>{{ student.name.charAt(0) }}</span>
          </div>
            <div>
              <div class="student-name">
                {{ student.name }}
                <span :class="['status-badge', getStatusClass((student as any).accountStatus)]">
                  {{ getStatusText((student as any).accountStatus) }}
                </span>
              </div>
              <div class="student-slug">{{ student.slug }}</div>
            </div>
        </div>
        <div class="student-actions">
          <a :href="getFrontUrl(student.slug)" target="_blank" class="btn-secondary button-link">预览</a>
          <router-link :to="`/students/${student.slug}`" class="btn-secondary">编辑</router-link>
          <button class="btn-danger" @click="handleDelete(student)">删除</button>
        </div>
      </div>
    </div>

    <!-- 新建学生对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
          <div class="modal card">
            <h2 class="title-md">新建学生</h2>
            <div class="form-group">
              <label class="form-label">姓名</label>
              <input v-model="newStudent.name" type="text" class="text-input" placeholder="学生姓名" aria-label="新建学生姓名" />
            </div>
            <div class="form-group">
              <label class="form-label">Slug (URL 标识)</label>
              <input v-model="newStudent.slug" type="text" class="text-input" placeholder="例如 zhangsan" aria-label="新建学生链接标识" />
            </div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="showCreate = false">取消</button>
              <button class="btn-primary" @click="handleCreate" :disabled="creating">
                {{ creating ? '创建中...' : '创建' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { adminFetch } from '@/api/client'
import type { Student, ApiResponse } from '@alumni/shared'

const students = ref<Student[]>([])
const keyword = ref('')
const showCreate = ref(false)
const creating = ref(false)
const newStudent = ref({ name: '', slug: '' })
const failedAvatarIds = ref(new Set<string>())

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return students.value
  return students.value.filter(s => s.name.toLowerCase().includes(kw))
})

async function loadStudents() {
  try {
    const res = await adminFetch<ApiResponse<Student[]>>('/api/students')
    students.value = res.data || []
  } catch {
    students.value = []
  }
}

async function handleCreate() {
  if (!newStudent.value.name.trim() || !newStudent.value.slug.trim()) return
  creating.value = true
  try {
    await adminFetch('/api/students', {
      method: 'POST',
      body: JSON.stringify(newStudent.value),
    })
    showCreate.value = false
    newStudent.value = { name: '', slug: '' }
    await loadStudents()
  } catch (e: any) {
    alert(e.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleDelete(student: Student) {
  if (!confirm(`确定要删除 "${student.name}" 吗？此操作不可撤销。`)) return
  try {
    await adminFetch(`/api/students/${student.slug}`, { method: 'DELETE' })
    await loadStudents()
  } catch (e: any) {
    alert(e.message || '删除失败')
  }
}

onMounted(loadStudents)

const getFrontUrl = (slug: string) => {
  if (!slug) return '#'
  const isDev = window.location.port === '5173'
  const origin = isDev ? 'http://localhost:4321' : window.location.origin
  const hasSubpath = window.location.pathname.startsWith('/alumni-book-v2')
  const base = hasSubpath ? '/alumni-book-v2/' : '/'
  return `${origin}${base}student/${slug}/`
}

function getStatusText(status: string | undefined | null) {
  if (!status) return '未初始化'
  if (status === 'pending') return '待改密'
  if (status === 'active') return '已激活'
  if (status === 'locked') return '已锁定'
  return '未初始化'
}

function getStatusClass(status: string | undefined | null) {
  if (!status) return 'status-none'
  return `status-${status}`
}
</script>

<style scoped>
.search-bar {
  margin-bottom: var(--spacing-lg);
  max-width: 400px;
}

.student-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.student-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
}

.student-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.student-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-surface-cream-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--color-muted);
  flex-shrink: 0;
}

.student-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.student-name {
  font-weight: 500;
  color: var(--color-ink);
}

.student-slug {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
}

.student-actions {
  display: flex;
  gap: var(--spacing-xs);
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  width: 100%;
  max-width: 420px;
}

.modal h2 {
  margin-bottom: var(--spacing-lg);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

.btn-secondary.button-link {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 600px) {
  .student-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
  }
  .student-actions {
    width: 100%;
    justify-content: flex-end;
  }
}

.status-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
  font-weight: normal;
}
.status-none {
  background: var(--color-surface-cream-strong);
  color: var(--color-muted);
}
.status-pending {
  background: #fef3c7;
  color: #d97706;
}
.status-active {
  background: #d1fae5;
  color: #059669;
}
.status-locked {
  background: #fee2e2;
  color: #dc2626;
}
</style>
