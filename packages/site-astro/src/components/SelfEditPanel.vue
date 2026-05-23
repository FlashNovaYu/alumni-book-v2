<template>
  <div v-if="isOwner" class="self-edit">
    <button class="edit-trigger" @click="openEditor">编辑我的资料</button>

    <Teleport to="body">
      <Transition name="modal">
        <div v-if="show" class="editor-overlay" @click.self="closeEditor">
          <div class="editor-panel card">
            <div class="editor-header">
              <h2 class="editor-title">编辑个人资料</h2>
              <button class="editor-close" @click="closeEditor">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div class="editor-body">
              <!-- 头像 -->
              <section class="edit-section">
                <h3 class="section-label">头像</h3>
                <div class="avatar-row">
                  <img v-if="form.avatarUrl" :src="form.avatarUrl" class="avatar-preview" />
                  <span v-else class="avatar-empty">无头像</span>
                  <label class="btn-sm btn-secondary upload-label">
                    上传<input type="file" accept="image/*" class="file-input" @change="uploadAvatar" :disabled="uploading" />
                  </label>
                </div>
              </section>

              <!-- 背景图 -->
              <section class="edit-section">
                <h3 class="section-label">背景图</h3>
                <div class="bg-row">
                  <div v-if="form.backgroundUrl" class="bg-preview" :style="{ backgroundImage: `url(${form.backgroundUrl})` }" />
                  <span v-else class="bg-empty">无背景</span>
                  <label class="btn-sm btn-secondary upload-label">
                    上传<input type="file" accept="image/*" class="file-input" @change="uploadBackground" :disabled="uploading" />
                  </label>
                  <button v-if="form.backgroundUrl" class="btn-sm btn-danger" @click="form.backgroundUrl = null">移除</button>
                </div>
              </section>

              <!-- 基础信息 -->
              <section class="edit-section">
                <h3 class="section-label">基础信息</h3>
                <div class="field-grid">
                  <div class="form-group">
                    <label class="form-label">昵称</label>
                    <input v-model="form.info.nickname" class="text-input" maxlength="20" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">性别</label>
                    <input v-model="form.info.gender" class="text-input" maxlength="10" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">生日</label>
                    <input v-model="form.info.birthday" type="date" class="text-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">学校</label>
                    <input v-model="form.info.school" class="text-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">班级</label>
                    <input v-model="form.info.class" class="text-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">毕业年份</label>
                    <input v-model="form.info.graduationYear" class="text-input" maxlength="10" />
                  </div>
                  <div class="form-group full-width">
                    <label class="form-label">座右铭</label>
                    <input v-model="form.info.motto" class="text-input" maxlength="100" placeholder="一句话概括自己…" />
                  </div>
                </div>
              </section>

              <!-- 个性标签 -->
              <section class="edit-section">
                <h3 class="section-label">个性标签</h3>
                <div class="field-grid">
                  <div class="form-group">
                    <label class="form-label">MBTI</label>
                    <input v-model="form.info.mbti" class="text-input" maxlength="10" placeholder="如 INTJ" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">星座</label>
                    <input v-model="form.info.astro" class="text-input" maxlength="10" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">血型</label>
                    <input v-model="form.info.bloodType" class="text-input" maxlength="5" />
                  </div>
                </div>
              </section>

              <!-- 联系方式 -->
              <section class="edit-section">
                <h3 class="section-label">联系方式</h3>
                <div class="field-grid">
                  <div class="form-group" v-for="f in contactFields" :key="f.key">
                    <label class="form-label">{{ f.label }}</label>
                    <input v-model="form.info[f.key]" class="text-input" />
                  </div>
                </div>
              </section>

              <!-- 兴趣爱好 -->
              <section class="edit-section">
                <h3 class="section-label">兴趣爱好</h3>
                <div class="field-grid">
                  <div class="form-group" v-for="f in interestFields" :key="f.key">
                    <label class="form-label">{{ f.label }}</label>
                    <input v-model="form.info[f.key]" class="text-input" />
                  </div>
                </div>
              </section>

              <!-- 校园回忆 -->
              <section class="edit-section">
                <h3 class="section-label">校园回忆</h3>
                <div v-for="f in memoryFields" :key="f.key" class="form-group">
                  <label class="form-label">{{ f.label }}</label>
                  <textarea v-model="form.info[f.key]" class="textarea" rows="2" maxlength="500" />
                </div>
              </section>

              <!-- 未来规划 -->
              <section class="edit-section">
                <h3 class="section-label">未来规划</h3>
                <div v-for="f in futureFields" :key="f.key" class="form-group">
                  <label class="form-label">{{ f.label }}</label>
                  <textarea v-model="form.info[f.key]" class="textarea" rows="2" maxlength="500" />
                </div>
              </section>
            </div>

            <div class="editor-footer">
              <span v-if="saveMsg" :class="saveMsg.type">{{ saveMsg.text }}</span>
              <button class="btn-primary" @click="save" :disabled="saving || uploading">
                {{ saving ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { getSessionName, compressImage, type Student, type StudentInfo } from '@alumni/shared'

const props = defineProps<{
  studentSlug: string
  studentName: string
}>()

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const show = ref(false)
const saving = ref(false)
const uploading = ref(false)
const saveMsg = ref<{ type: string; text: string } | null>(null)
const token = ref('')

const form = reactive<{
  name: string
  avatarUrl: string | null
  backgroundUrl: string | null
  backgroundColor: string | null
  info: Record<string, string>
}>({
  name: '',
  avatarUrl: null,
  backgroundUrl: null,
  backgroundColor: null,
  info: {},
})

const isOwner = getSessionName() === props.studentName

function authHeaders(): Record<string, string> {
  return token.value ? { 'X-Classmate-Token': token.value } : {}
}

async function ensureToken(): Promise<boolean> {
  if (token.value) return true
  const name = getSessionName()
  if (!name) {
    saveMsg.value = { type: 'error', text: '请先在首页验证身份' }
    return false
  }
  try {
    const res = await fetch(`${API_BASE}/api/classmate/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: props.studentSlug }),
    })
    const data = await res.json()
    if (data.success) {
      token.value = data.data.token
      return true
    }
    saveMsg.value = { type: 'error', text: data.message || '身份验证失败' }
  } catch {
    saveMsg.value = { type: 'error', text: '网络错误，请稍后重试' }
  }
  return false
}

async function openEditor() {
  saveMsg.value = null
  if (!(await ensureToken())) return

  try {
    const res = await fetch(`${API_BASE}/api/students/${props.studentSlug}`)
    const data = await res.json()
    if (data.success && data.data) {
      const s = data.data as Student
      form.name = s.name
      form.avatarUrl = s.avatarUrl
      form.backgroundUrl = s.backgroundUrl
      form.backgroundColor = s.backgroundColor
      form.info = { ...s.info }
    }
  } catch { /* keep defaults */ }
  show.value = true
}

function closeEditor() {
  show.value = false
  saveMsg.value = null
}

async function uploadFile(e: Event, type: 'avatar' | 'background') {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!(await ensureToken())) return

  uploading.value = true
  try {
    const compressed = await compressImage(file, type === 'avatar' ? 400 : 1920, 0.85)
    const fd = new FormData()
    fd.append('file', compressed)
    fd.append('type', type)
    fd.append('slug', props.studentSlug)

    const res = await fetch(`${API_BASE}/api/classmate/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })
    const data = await res.json()
    if (data.success) {
      if (type === 'avatar') form.avatarUrl = data.data.url
      else form.backgroundUrl = data.data.url
      saveMsg.value = { type: 'success', text: '上传成功' }
    } else {
      saveMsg.value = { type: 'error', text: data.message || '上传失败' }
    }
  } catch {
    saveMsg.value = { type: 'error', text: '上传失败' }
  } finally {
    uploading.value = false
    // reset file input
    ;(e.target as HTMLInputElement).value = ''
  }
}

const uploadAvatar = (e: Event) => uploadFile(e, 'avatar')
const uploadBackground = (e: Event) => uploadFile(e, 'background')

async function save() {
  if (!(await ensureToken())) return

  saving.value = true
  saveMsg.value = null
  try {
    const body: Record<string, any> = { info: form.info }
    if (form.name) body.name = form.name
    if (form.avatarUrl) body.avatarUrl = form.avatarUrl
    if (form.backgroundUrl) body.backgroundUrl = form.backgroundUrl
    if (form.backgroundColor) body.backgroundColor = form.backgroundColor

    const res = await fetch(`${API_BASE}/api/classmate/students/${props.studentSlug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.success) {
      saveMsg.value = { type: 'success', text: '保存成功' }
      setTimeout(() => closeEditor(), 1500)
    } else if (res.status === 401) {
      // token 过期 → 自动重新获取并重试
      token.value = ''
      if (await ensureToken()) {
        saving.value = false
        return save() // 重试一次
      }
      saveMsg.value = { type: 'error', text: '身份验证失败，请关闭后重新打开编辑' }
    } else {
      saveMsg.value = { type: 'error', text: data.message || '保存失败' }
    }
  } catch {
    saveMsg.value = { type: 'error', text: '网络错误' }
  } finally {
    saving.value = false
  }
}

const contactFields = [
  { key: 'qq', label: 'QQ' }, { key: 'wechat', label: '微信' },
  { key: 'phone', label: '手机' }, { key: 'email', label: '邮箱' },
  { key: 'address', label: '常住地' }, { key: 'weibo', label: '微博' },
]

const interestFields = [
  { key: 'favoriteSong', label: '喜欢的歌' }, { key: 'favoriteMovie', label: '喜欢的电影' },
  { key: 'favoriteGame', label: '喜欢的游戏' }, { key: 'favoriteFood', label: '喜欢的食物' },
  { key: 'favoriteColor', label: '喜欢的颜色' }, { key: 'favoriteSport', label: '喜欢的运动' },
  { key: 'favoriteIdol', label: '喜欢的明星' }, { key: 'favoriteAnime', label: '喜欢的动漫' },
]

const memoryFields = [
  { key: 'bestMemory', label: '最难忘的一件事' },
  { key: 'bestLesson', label: '最难忘的一节课' },
  { key: 'deskmateFun', label: '同桌趣事' },
  { key: 'classMeme', label: '班级经典梗' },
  { key: 'embarrassingMoment', label: '最社死瞬间' },
  { key: 'proudestAchievement', label: '学生时代最骄傲的事' },
]

const futureFields = [
  { key: 'targetUniversity', label: '目标大学' },
  { key: 'targetMajor', label: '目标专业' },
  { key: 'futureCareer', label: '未来职业' },
  { key: 'futureCity', label: '未来城市' },
  { key: 'futureSelf', label: '十年后的自己' },
  { key: 'letterToFuture', label: '给未来自己的话' },
]
</script>

<style scoped>
.self-edit { position: fixed; bottom: 24px; right: 24px; z-index: var(--z-nav); }
.edit-trigger {
  padding: 10px 20px;
  background: var(--color-primary, #cc785c);
  color: #fff;
  border: none;
  border-radius: var(--rounded-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-elevated, 0 8px 24px rgba(0,0,0,0.15));
  transition: transform var(--duration-fast) var(--ease-out-quart),
              background var(--duration-fast) var(--ease-out-quart);
}
.edit-trigger:hover { transform: scale(1.05); }
.edit-trigger:active { transform: scale(0.97); }

.editor-overlay {
  position: fixed; inset: 0; z-index: var(--z-modal, 300);
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.editor-panel {
  width: 100%; max-width: 640px; max-height: 85vh;
  overflow: hidden; display: flex; flex-direction: column;
  background: var(--color-surface-card, #fff);
  border-radius: var(--rounded-lg);
}
.editor-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--color-hairline);
}
.editor-title { font-size: 18px; font-weight: 600; }
.editor-close {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; border-radius: var(--rounded-sm);
  color: var(--color-muted);
  transition: background var(--duration-fast);
}
.editor-close:hover { background: var(--color-surface-cream-strong); }

.editor-body {
  flex: 1; overflow-y: auto;
  padding: 16px 24px;
}
.edit-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-hairline);
}
.section-label { font-size: 13px; color: var(--color-muted); margin-bottom: 10px; text-transform: uppercase; letter-spacing: .05em; }

.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group.full-width { grid-column: 1 / -1; }
.form-label { font-size: 12px; color: var(--color-muted); }
.text-input, .textarea {
  padding: 8px 12px; border: 1px solid var(--color-hairline); border-radius: var(--rounded-sm);
  font-size: 14px; font-family: inherit;
  transition: border-color var(--duration-fast);
}
.text-input:focus, .textarea:focus { border-color: var(--color-primary); outline: none; }
.textarea { resize: vertical; }

.avatar-row, .bg-row { display: flex; align-items: center; gap: 12px; }
.avatar-preview { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-hairline); }
.avatar-empty { width: 60px; height: 60px; border-radius: 50%; background: var(--color-surface-cream-strong); display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--color-muted); }
.bg-preview { width: 120px; height: 60px; border-radius: var(--rounded-sm); background-size: cover; background-position: center; border: 1px solid var(--color-hairline); }
.bg-empty { width: 120px; height: 60px; background: var(--color-surface-cream-strong); border-radius: var(--rounded-sm); display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--color-muted); }

.file-input { display: none; }
.upload-label { cursor: pointer; display: inline-block; }

.editor-footer {
  padding: 12px 24px 20px; border-top: 1px solid var(--color-hairline);
  display: flex; align-items: center; justify-content: space-between;
}
.editor-footer .success { color: #2e7d32; font-size: 13px; }
.editor-footer .error { color: #c62828; font-size: 13px; }
.editor-footer .info { color: var(--color-muted); font-size: 13px; }

.btn-primary {
  padding: 8px 24px; background: var(--color-primary, #cc785c); color: #fff;
  border: none; border-radius: var(--rounded-sm); font-size: 14px; font-weight: 500; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 6px 14px; font-size: 13px; border-radius: var(--rounded-sm); cursor: pointer; border: 1px solid var(--color-hairline); background: #fff; }
.btn-secondary { background: var(--color-surface-cream-strong); }
.btn-danger { color: #c62828; border-color: #c62828; }

/* Transition */
.modal-enter-active, .modal-leave-active { transition: opacity var(--duration-normal) var(--ease-out-quart); }
.modal-enter-active .editor-panel, .modal-leave-active .editor-panel {
  transition: transform var(--duration-normal) var(--ease-out-quart);
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .editor-panel { transform: scale(0.95) translateY(8px); }
.modal-leave-to .editor-panel { transform: scale(0.95) translateY(8px); }
</style>
