<template>
  <div class="timeline-admin">
    <header class="page-header">
      <div><h1 class="page-title">时光轴事件</h1><p class="page-intro">完整显示全部事件；仅可拖动调整同日期事件的展示顺序。</p></div>
      <button class="btn-primary" @click="openCreate">添加事件</button>
    </header>

    <div v-if="showForm" class="editor-scrim" @click.self="closeEditor">
      <aside class="card editor-drawer" role="dialog" aria-modal="true" aria-labelledby="timeline-editor-title">
        <div class="editor-heading"><h2 id="timeline-editor-title" class="title-md">{{ editingId ? '编辑时光轴事件' : '添加时光轴事件' }}</h2><button class="btn-secondary btn-sm" :disabled="saving" @click="closeEditor">关闭</button></div>
        <label class="form-group">标题 *<input v-model.trim="form.title" class="text-input" maxlength="120" /></label>
        <label class="form-group">日期 *<input v-model="form.eventDate" class="text-input" type="date" /></label>
        <label class="form-group">描述<textarea v-model="form.description" class="textarea form-textarea" rows="5"></textarea></label>
        <label class="form-group">照片 R2 Key<input v-model.trim="form.photoR2Key" class="text-input" placeholder="photos/xxx.jpg" /></label>
        <label class="form-group">事件类型<select v-model="form.eventType" class="text-input"><option value="class_event">班级大事</option><option value="activity">活动</option><option value="exam">考试节点</option><option value="graduation">毕业节点</option><option value="funny">班级趣事</option></select></label>
        <label class="milestone-toggle"><input v-model="form.isMilestone" type="checkbox" /> 标记为里程碑（年度册精选展示）</label>
        <div class="editor-actions"><button class="btn-secondary" :disabled="saving" @click="closeEditor">取消</button><button class="btn-primary" :disabled="saving" @click="handleSave">{{ saving ? '保存中...' : (editingId ? '保存修改' : '添加事件') }}</button></div>
      </aside>
    </div>

    <p v-if="loading" class="empty">正在加载时光轴事件…</p>
    <p v-else-if="!eventGroups.length" class="empty">暂无事件</p>
    <div v-else class="timeline-groups">
      <section v-for="group in eventGroups" :key="group.eventDate" class="timeline-group">
        <h2 class="timeline-date-heading">{{ group.eventDate }}</h2>
        <div class="event-list">
          <article v-for="event in group.events" :key="event.id" class="card event-card" draggable="true" @click="editEvent(event)" @dragstart="draggedId = event.id" @dragend="draggedId = null" @dragover.prevent @drop.prevent="reorderGroup(group.eventDate, event.id)">
            <button class="drag-handle" type="button" title="拖动调整同日顺序" aria-label="拖动调整同日顺序" @click.stop>⠿</button>
            <div class="event-info"><div class="event-meta"><span class="badge-event-type">{{ getEventTypeName(event.eventType) }}</span><span v-if="event.isMilestone" class="badge-milestone">里程碑</span></div><h3 class="event-title">{{ event.title }}</h3><p v-if="event.description" class="event-desc">{{ event.description }}</p><p v-if="event.photoR2Key" class="event-photo">照片：{{ event.photoR2Key }}</p></div>
            <div class="event-actions"><button class="btn-secondary btn-sm" @click.stop="editEvent(event)">编辑</button><button class="btn-danger btn-sm" @click.stop="deleteEvent(event.id)">删除</button></div>
          </article>
        </div>
      </section>
    </div>
    <Transition name="toast"><div v-if="toast" :class="'toast toast-' + toast.type">{{ toast.message }}</div></Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminFetch } from '@/api/client'

interface Event { id: string; title: string; description: string; eventDate: string; photoR2Key: string | null; isMilestone: boolean; eventType: string; sortOrder: number }

const events = ref<Event[]>([])
const showForm = ref(false)
const editingId = ref<string | null>(null)
const draggedId = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const form = ref({ title: '', eventDate: '', description: '', photoR2Key: '', isMilestone: false, eventType: 'class_event' })
const eventGroups = computed(() => {
  const groups = new Map<string, Event[]>()
  for (const event of events.value) groups.set(event.eventDate, [...(groups.get(event.eventDate) || []), event])
  return [...groups.entries()].map(([eventDate, groupEvents]) => ({ eventDate, events: groupEvents }))
})

function showToast(type: 'success' | 'error', message: string) { toast.value = { type, message }; window.setTimeout(() => { toast.value = null }, 3000) }
function resetForm() { form.value = { title: '', eventDate: '', description: '', photoR2Key: '', isMilestone: false, eventType: 'class_event' }; editingId.value = null }
function openCreate() { resetForm(); showForm.value = true }
function closeEditor() { if (!saving.value) { showForm.value = false; resetForm() } }

async function load() {
  loading.value = true
  try {
    const response = await adminFetch<{ data?: Event[] }>('/api/admin/timeline/events')
    events.value = response.data || []
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '时光轴加载失败')
  } finally { loading.value = false }
}

async function handleSave() {
  if (!form.value.title || !form.value.eventDate) return showToast('error', '标题和日期必填')
  const currentId = editingId.value
  saving.value = true
  try {
    await adminFetch(currentId ? '/api/timeline/events/' + currentId : '/api/timeline/events', { method: currentId ? 'PUT' : 'POST', body: JSON.stringify(form.value) })
    showForm.value = false
    resetForm()
    await load()
    showToast('success', currentId ? '事件已更新' : '事件已添加')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '保存失败')
  } finally { saving.value = false }
}

function editEvent(event: Event) {
  form.value = { title: event.title, eventDate: event.eventDate, description: event.description, photoR2Key: event.photoR2Key || '', isMilestone: event.isMilestone, eventType: event.eventType || 'class_event' }
  editingId.value = event.id
  showForm.value = true
}

async function reorderGroup(eventDate: string, targetId: string) {
  const currentId = draggedId.value
  draggedId.value = null
  const group = eventGroups.value.find((item) => item.eventDate === eventDate)?.events || []
  const from = group.findIndex((event) => event.id === currentId)
  const to = group.findIndex((event) => event.id === targetId)
  if (from < 0 || to < 0 || from === to) return
  const ordered = [...group]
  const [moved] = ordered.splice(from, 1)
  ordered.splice(to, 0, moved)
  try {
    await adminFetch('/api/timeline/events/reorder', { method: 'PUT', body: JSON.stringify({ eventDate, ids: ordered.map((event) => event.id) }) })
    await load()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '排序失败')
  }
}

function getEventTypeName(type: string) { return ({ class_event: '班级大事', activity: '活动', exam: '考试节点', graduation: '毕业节点', funny: '班级趣事' }[type] || '班级大事') }
async function deleteEvent(id: string) {
  const reason = window.prompt('请输入删除原因：')?.trim()
  if (!reason) return
  try {
    await adminFetch('/api/timeline/events/' + id, { method: 'DELETE', body: JSON.stringify({ reason }) })
    events.value = events.value.filter((event) => event.id !== id)
    showToast('success', '事件已删除')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.timeline-admin,.timeline-groups,.timeline-group,.event-list { display:grid; gap:var(--spacing-lg); }.page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--spacing-md); }.page-intro,.event-desc,.event-photo { margin:var(--spacing-xs) 0 0; color:var(--color-muted); font-size:var(--type-body-sm-size); }.timeline-date-heading { margin:0; color:var(--color-primary); font-size:var(--type-title-sm-size); }.event-card { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:start; gap:var(--spacing-md); padding:var(--spacing-lg); cursor:pointer; }.drag-handle { padding:2px; color:var(--color-muted); font-size:22px; line-height:1; cursor:grab; }.event-info { min-width:0; }.event-meta,.event-actions { display:flex; flex-wrap:wrap; gap:var(--spacing-xs); }.event-title { margin:var(--spacing-xs) 0; font-size:var(--type-title-sm-size); }.event-desc { white-space:pre-wrap; overflow-wrap:anywhere; }.badge-event-type,.badge-milestone { display:inline-block; padding:2px 7px; border-radius:var(--rounded-pill); font-size:11px; }.badge-event-type { color:var(--color-primary); background:var(--color-surface-cream-strong); }.badge-milestone { color:var(--text-inverse); background:var(--color-accent-amber); }.empty { padding:var(--spacing-xxl); color:var(--color-muted); text-align:center; }.editor-scrim { position:fixed; inset:0; z-index:var(--z-modal); display:flex; justify-content:flex-end; background:rgba(25,21,17,.38); }.editor-drawer { display:grid; width:min(540px,100%); height:100%; align-content:start; gap:var(--spacing-md); padding:var(--spacing-xl); overflow-y:auto; border-radius:0; }.editor-heading,.editor-actions { display:flex; align-items:center; justify-content:space-between; gap:var(--spacing-sm); }.editor-heading h2 { margin:0; }.form-group { display:grid; gap:var(--spacing-xxs); font-size:var(--type-body-sm-size); }.form-textarea { min-height:120px; resize:vertical; }.milestone-toggle { display:flex; align-items:center; gap:var(--spacing-xs); font-size:var(--type-body-sm-size); }.editor-actions { justify-content:flex-end; } @media (max-width:600px) { .page-header { flex-direction:column; align-items:stretch; }.event-card { grid-template-columns:auto minmax(0,1fr); padding:var(--spacing-md); }.event-actions { grid-column:2; }.editor-drawer { width:100%; padding:var(--spacing-lg); } }
</style>
