<template>
  <div v-if="isOwner" class="self-edit">
    <button class="edit-trigger" @click="openEditor">编辑我的资料</button>

    <Teleport v-if="isMounted" to="body">
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
              <!-- 口令首次设置提示 -->
              <div v-if="needSetup" class="setup-notice">
                <span class="warning-icon">⚠️</span>
                <p class="notice-text">
                  您尚未设置编辑口令！任何人知道姓名的人都可以冒用修改。请在下方<strong>安全设置</strong>中设定您的专属口令。
                </p>
              </div>

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

              <!-- 身份档案 -->
              <section class="edit-section">
                <h3 class="section-label">身份档案</h3>
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
                  <div class="form-group">
                    <label class="form-label">擅长的事</label>
                    <input v-model="form.info.strengths" class="text-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">不擅长的事</label>
                    <input v-model="form.info.weaknesses" class="text-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">最喜欢科目</label>
                    <input v-model="form.info.bestSubject" class="text-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">最讨厌科目</label>
                    <input v-model="form.info.worstSubject" class="text-input" />
                  </div>
                </div>
              </section>

              <!-- 联系方式（支持隐私控制） -->
              <section class="edit-section">
                <h3 class="section-label">联系方式</h3>
                <div class="field-grid">
                  <div class="form-group" v-for="f in contactFields" :key="f.key">
                    <div class="label-row">
                      <label class="form-label">{{ f.label }}</label>
                      <select v-model="form.info.visibility[f.key]" class="privacy-select">
                        <option value="public">公开</option>
                        <option value="classmates">同学</option>
                        <option value="owner">本人</option>
                        <option value="hidden">隐藏</option>
                      </select>
                    </div>
                    <input v-model="form.info[f.key]" class="text-input" />
                  </div>
                </div>
              </section>

              <!-- 兴趣馆藏 -->
              <section class="edit-section">
                <h3 class="section-label">兴趣馆藏</h3>
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

              <!-- 时间胶囊 -->
              <section class="edit-section">
                <h3 class="section-label">时间胶囊</h3>
                <div v-for="f in futureFields" :key="f.key" class="form-group">
                  <label class="form-label">{{ f.label }}</label>
                  <textarea v-model="form.info[f.key]" class="textarea" rows="2" maxlength="500" />
                </div>
              </section>

              <!-- 个人小传 -->
              <section class="edit-section">
                <h3 class="section-label">个人小传</h3>
                <div class="modules-list">
                  <div v-for="(mod, idx) in form.info.profileModules" :key="idx" class="module-item card p-3 mb-3">
                    <div class="module-item-header">
                      <input v-model="mod.title" class="text-input module-title-input" placeholder="模块标题（例如：现在的我）" maxlength="50" />
                      <div class="module-actions">
                        <button class="btn-sm btn-icon" @click="moveModule(idx, -1)" :disabled="idx === 0" title="上移">▲</button>
                        <button class="btn-sm btn-icon" @click="moveModule(idx, 1)" :disabled="idx === form.info.profileModules.length - 1" title="下移">▼</button>
                        <button class="btn-sm btn-danger btn-icon" @click="removeModule(idx)" title="删除">✕</button>
                      </div>
                    </div>
                    <textarea v-model="mod.content" class="textarea module-content-input mt-2" rows="3" placeholder="小传内容…" maxlength="1000"></textarea>
                  </div>
                  <button class="btn-sm btn-secondary w-full" @click="addModule">+ 添加小传模块</button>
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
import { ref, reactive, onMounted, computed } from 'vue'
import { getSessionName, compressImage, getClassmateToken, getClassmateStudent, type Student } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

const props = defineProps<{
  studentSlug: string
  studentName: string
  apiBase: string
}>()

const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('edit') === '1') {
      openEditor()
    }
  }
})

const show = ref(false)
const saving = ref(false)
const uploading = ref(false)
const saveMsg = ref<{ type: string; text: string } | null>(null)
const token = ref('')
const needSetup = ref(false)

const form = reactive<{
  name: string
  avatarUrl: string | null
  backgroundUrl: string | null
  backgroundColor: string | null
  info: Record<string, any>
  editSecret?: string
}>({
  name: '',
  avatarUrl: null,
  backgroundUrl: null,
  backgroundColor: null,
  info: {
    visibility: {}
  },
})

const isOwner = computed(() => {
  const currentStudent = getClassmateStudent<{ slug: string }>()
  return currentStudent?.slug === props.studentSlug
})

function authHeaders(): Record<string, string> {
  return token.value ? { 'X-Classmate-Token': token.value } : {}
}

async function ensureToken(): Promise<boolean> {
  if (token.value) return true
  const t = getClassmateToken()
  if (t) {
    token.value = t
    return true
  }
  saveMsg.value = { type: 'error', text: '请先登录同学账号' }
  return false
}

async function openEditor() {
  saveMsg.value = null
  const success = await ensureToken()
  if (success) {
    await openEditorAfterAuthed()
  }
}

async function openEditorAfterAuthed() {
  try {
    const url = joinApiUrl(props.apiBase, `/api/students/${props.studentSlug}`)
    const res = await fetch(url, { headers: authHeaders() })
    const data = await res.json()
    if (data.success && data.data) {
      const s = data.data as Student
      form.name = s.name
      form.avatarUrl = s.avatarUrl
      form.backgroundUrl = s.backgroundUrl
      form.backgroundColor = s.backgroundColor
      form.info = { ...s.info }
      if (!form.info.profileModules) {
        form.info.profileModules = []
      }
      if (!form.info.visibility) {
        form.info.visibility = {
          phone: 'classmates',
          wechat: 'classmates',
          email: 'classmates',
          address: 'classmates',
          qq: 'classmates',
          weibo: 'classmates',
        }
      } else {
        // 确保字段都有默认值
        const keys = ['phone', 'wechat', 'email', 'address', 'qq', 'weibo']
        for (const k of keys) {
          if (!form.info.visibility[k]) {
            form.info.visibility[k] = 'classmates'
          }
        }
      }
    }
  } catch { /* keep defaults */ }
  show.value = true
}

function closeEditor() {
  show.value = false
  saveMsg.value = null
  form.editSecret = undefined
  
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.delete('edit')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
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

    const url = joinApiUrl(props.apiBase, '/api/classmate/upload')
    const res = await fetch(url, {
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
    if (form.editSecret) body.editSecret = form.editSecret

    const url = joinApiUrl(props.apiBase, `/api/classmate/students/${props.studentSlug}`)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.success) {
      saveMsg.value = { type: 'success', text: '保存成功' }
      window.dispatchEvent(new CustomEvent('student-profile-updated', { detail: { slug: props.studentSlug } }))
      // 如果更新了口令，可能会触发 needSetup 变为 false
      if (form.editSecret) {
        needSetup.value = false
      }
      setTimeout(() => closeEditor(), 1500)
    } else if (res.status === 401) {
      token.value = ''
      sessionStorage.removeItem(`classmate_token_${props.studentSlug}`)
      if (await ensureToken()) {
        saving.value = false
        return save()
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

function addModule() {
  if (!form.info.profileModules) {
    form.info.profileModules = []
  }
  form.info.profileModules.push({ type: 'custom', title: '', content: '' })
}

function removeModule(index: number) {
  form.info.profileModules.splice(index, 1)
}

function moveModule(index: number, direction: number) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= form.info.profileModules.length) return
  const temp = form.info.profileModules[index]
  form.info.profileModules[index] = form.info.profileModules[targetIndex]
  form.info.profileModules[targetIndex] = temp
}
</script>

<style scoped>
.self-edit { position: fixed; bottom: 84px; right: 24px; z-index: var(--z-nav); }
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
  padding: var(--spacing-md) var(--spacing-lg);
}
.edit-section {
  padding: var(--spacing-lg);
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  margin-bottom: var(--spacing-lg);
}
.section-label {
  color: var(--color-paper-brown);
  font-size: 13px;
  margin-bottom: var(--spacing-xs);
  text-transform: uppercase;
  letter-spacing: .05em;
}

.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm); }
.form-group { display: flex; flex-direction: column; gap: var(--spacing-xxs); }
.form-group.full-width { grid-column: 1 / -1; }
.form-label { font-size: 12px; color: var(--color-muted); }
.textarea {
  width: 100%;
  padding: 10px 12px; border: 1px solid var(--color-hairline); border-radius: var(--rounded-md);
  font-size: 14px; font-family: inherit;
  transition: border-color var(--duration-fast);
  resize: vertical;
}
.textarea:focus { border-color: var(--color-primary); outline: none; }

.avatar-row, .bg-row { display: flex; align-items: center; gap: var(--spacing-sm); }
.avatar-preview { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-hairline); }
.avatar-empty { width: 60px; height: 60px; border-radius: 50%; background: var(--color-surface-cream-strong); display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--color-muted); }
.bg-preview { width: 120px; height: 60px; border-radius: var(--rounded-sm); background-size: cover; background-position: center; border: 1px solid var(--color-hairline); }
.bg-empty { width: 120px; height: 60px; background: var(--color-surface-cream-strong); border-radius: var(--rounded-sm); display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--color-muted); }

.file-input { display: none; }
.upload-label { cursor: pointer; display: inline-block; }

.editor-footer {
  padding: var(--spacing-sm) var(--spacing-lg) var(--spacing-lg); border-top: 1px solid var(--color-hairline);
  display: flex; align-items: center; justify-content: space-between;
}
.editor-footer .success { color: var(--color-success); font-size: 13px; }
.editor-footer .error { color: var(--color-error); font-size: 13px; }
.editor-footer .info { color: var(--color-muted); font-size: 13px; }

.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { color: var(--color-error); border: 1px solid var(--color-error); background: transparent; }
.btn-danger:hover { background-color: rgba(198, 69, 69, 0.08); }

/* Transition */
.modal-enter-active, .modal-leave-active { transition: opacity var(--duration-normal) var(--ease-out-quart); }
.modal-enter-active .editor-panel, .modal-leave-active .editor-panel {
  transition: transform var(--duration-normal) var(--ease-out-quart);
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .editor-panel { transform: scale(0.95) translateY(8px); }
.modal-leave-to .editor-panel { transform: scale(0.95) translateY(8px); }

/* Secret Dialog CSS */
.secret-panel {
  width: 100%; max-width: 380px;
  background: var(--color-surface-card, #fff);
  border-radius: var(--rounded-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--shadow-elevated, 0 8px 24px rgba(0,0,0,0.15));
}
.secret-title { font-size: 16px; font-weight: 600; margin: 0; }
.secret-desc { font-size: 14px; color: var(--color-muted); margin: 0; line-height: 1.5; }
.secret-input { width: 100%; }
.secret-buttons { display: flex; justify-content: flex-end; gap: 12px; }
.error-text { font-size: 12px; color: #c62828; margin: 0; }

.privacy-select {
  padding: 2px 6px;
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-sm);
  font-size: 12px;
  background: var(--color-surface-cream, #fcfaf7);
  color: var(--color-muted);
  cursor: pointer;
  outline: none;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.setup-notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: var(--rounded-sm);
  padding: 12px 16px;
  margin-bottom: 20px;
}
.warning-icon { font-size: 20px; }
.notice-text { font-size: 13px; color: #b78103; margin: 0; line-height: 1.5; }

.module-item {
  border: 1px solid var(--color-hairline);
  padding: 12px;
  margin-bottom: 12px;
  border-radius: var(--rounded-sm);
  background: var(--color-surface-cream, #fcfaf7);
}
.module-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.module-title-input {
  flex: 1;
  font-weight: 600;
  padding: 4px 8px;
}
.module-actions {
  display: flex;
  gap: 4px;
}
.btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.module-content-input {
  width: 100%;
  margin-top: 8px;
}
.w-full {
  width: 100%;
}

@media (max-width: 768px) {
  .editor-panel {
    max-width: 100% !important;
    max-height: 90vh !important;
    border-radius: var(--rounded-lg) var(--rounded-lg) 0 0 !important;
    position: fixed !important;
    bottom: 0;
    left: 0;
    right: 0;
  }
  .editor-overlay {
    align-items: flex-end !important;
    padding: 0 !important;
  }
  .editor-footer {
    position: sticky !important;
    bottom: 0 !important;
    background: var(--color-surface-card, #fff) !important;
    border-top: 1px solid var(--color-hairline) !important;
    padding: 16px 24px !important;
    z-index: 10 !important;
  }
}
</style>

