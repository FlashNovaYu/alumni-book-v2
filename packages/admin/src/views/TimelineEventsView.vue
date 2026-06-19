<template>
  <div class="timeline-admin">
    <div class="page-header">
      <h1 class="page-title">时光轴事件</h1>
      <button class="btn-primary" @click="showForm = !showForm">
        {{ showForm ? '取消' : '添加事件' }}
      </button>
    </div>

    <div v-if="showForm" class="card form-card">
      <div class="form-group">
        <label class="form-label">标题 *</label>
        <input v-model="form.title" type="text" class="text-input" />
      </div>
      <div class="form-group">
        <label class="form-label">日期 *</label>
        <input v-model="form.eventDate" type="date" class="text-input" />
      </div>
      <div class="form-group">
        <label class="form-label">描述</label>
        <textarea v-model="form.description" class="text-input form-textarea" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">照片 (上传后填入 R2 Key)</label>
        <input v-model="form.photoR2Key" type="text" class="text-input" placeholder="photos/xxx.jpg" />
      </div>
      <div class="form-group">
        <label><input type="checkbox" v-model="form.isMilestone" /> 标记为里程碑（在年度册精选展示）</label>
      </div>
      <div class="form-actions">
        <button class="btn-primary" @click="handleSave" :disabled="saving">
          {{ editingId ? '更新' : '添加' }}
        </button>
      </div>
    </div>

    <div class="event-list">
      <div v-for="event in events" :key="event.id" class="card event-card">
        <div class="event-info">
          <span class="event-date">{{ event.eventDate }}</span>
          <h3 class="event-title">{{ event.title }}</h3>
          <p v-if="event.description" class="event-desc">{{ event.description }}</p>
          <span v-if="event.isMilestone" class="badge-milestone">里程碑 (年度册展示)</span>
        </div>
        <div class="event-actions">
          <button class="btn-secondary btn-sm" @click="editEvent(event)">编辑</button>
          <button class="btn-danger btn-sm" @click="deleteEvent(event.id)">删除</button>
        </div>
      </div>
      <div v-if="events.length === 0" class="empty">暂无事件</div>
    </div>

    <Transition name="toast">
      <div v-if="toast" :class="'toast toast-' + toast.type">{{ toast.message }}</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminFetch } from '@/api/client'

interface Event {
  id: string; title: string; description: string; eventDate: string
  photoR2Key: string | null; isMilestone: boolean
}

const events = ref<Event[]>([])
const showForm = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const form = ref({
  title: '', eventDate: '', description: '', photoR2Key: '', isMilestone: false,
})

function resetForm() {
  form.value = { title: '', eventDate: '', description: '', photoR2Key: '', isMilestone: false }
  editingId.value = null
}

async function load() {
  try {
    const res = await adminFetch<{ success: boolean; data: any[] }>('/api/timeline')
    if (res.data) events.value = res.data.filter((e: any) => e.type === 'event')
  } catch (e: any) {
    toast.value = { type: 'error', message: e.message }
  }
}

async function handleSave() {
  if (!form.value.title || !form.value.eventDate) {
    toast.value = { type: 'error', message: '标题和日期必填' }
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await adminFetch(`/api/timeline/events/${editingId.value}`, {
        method: 'PUT',
        body: JSON.stringify(form.value),
      })
    } else {
      await adminFetch('/api/timeline/events', {
        method: 'POST',
        body: JSON.stringify(form.value),
      })
    }
    resetForm()
    showForm.value = false
    await load()
    toast.value = { type: 'success', message: editingId.value ? '已更新' : '已添加' }
  } catch (e: any) {
    toast.value = { type: 'error', message: e.message }
  } finally { saving.value = false }
}

function editEvent(event: Event) {
  form.value = {
    title: event.title,
    eventDate: event.eventDate,
    description: event.description,
    photoR2Key: event.photoR2Key || '',
    isMilestone: event.isMilestone,
  }
  editingId.value = event.id
  showForm.value = true
}

async function deleteEvent(id: string) {
  if (!confirm('确定删除？')) return
  try {
    await adminFetch(`/api/timeline/events/${id}`, { method: 'DELETE' })
    events.value = events.value.filter(e => e.id !== id)
    toast.value = { type: 'success', message: '已删除' }
  } catch (e: any) {
    toast.value = { type: 'error', message: e.message }
  }
}

onMounted(load)
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; }
.form-card { padding: var(--spacing-lg); margin: var(--spacing-lg) 0; display: flex; flex-direction: column; gap: var(--spacing-md); }
.form-group { display: flex; flex-direction: column; gap: var(--spacing-xxs); }
.form-label { font-size: var(--type-body-sm-size); font-weight: 500; }
.form-textarea { min-height: 80px; padding: var(--spacing-sm); resize: vertical; }
.form-actions { display: flex; gap: var(--spacing-sm); }
.event-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
.event-card { display: flex; justify-content: space-between; padding: var(--spacing-lg); }
.event-date { font-size: var(--type-caption-size); color: var(--color-muted); }
.event-title { font-size: var(--type-title-sm-size); margin: var(--spacing-xxs) 0; }
.event-desc { font-size: var(--type-body-sm-size); color: var(--color-body); }
.badge-milestone { display: inline-block; margin-top: var(--spacing-xs); padding: 2px 8px; background: var(--color-accent-amber); color: white; border-radius: var(--rounded-pill); font-size: 11px; }
.event-actions { display: flex; gap: var(--spacing-xs); align-items: flex-start; }
.empty { text-align: center; padding: var(--spacing-xxl); color: var(--color-muted); }
</style>
