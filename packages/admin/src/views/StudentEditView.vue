<template>
  <div class="student-edit">
    <div class="page-header">
      <h1 class="page-title">编辑学生: {{ student.name }}</h1>
      <div class="header-actions">
        <button class="btn-secondary" @click="router.back()">返回</button>
        <button class="btn-primary" @click="handleSave" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <div class="edit-grid">
      <!-- 基础信息 -->
      <div class="card">
        <h2 class="title-md section-heading">基础信息</h2>
        <div class="form-group">
          <label class="form-label">姓名</label>
          <input v-model="student.name" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Slug</label>
          <input v-model="student.slug" type="text" class="text-input" disabled />
        </div>
        <div class="form-group">
          <label class="form-label">头像</label>
          <input type="file" accept="image/*" @change="handleAvatarUpload" />
          <img v-if="student.avatarUrl" :src="fileUrl(student.avatarUrl)" class="avatar-preview" />
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" v-model="student.isOwner" />
            设为专属模板 (Owner)
          </label>
          <p class="form-hint">开启后可为此学生编写自定义 HTML 页面</p>
        </div>
      </div>

      <!-- 背景设置 -->
      <div class="card">
        <h2 class="title-md section-heading">背景设置</h2>
        <div class="form-group">
          <label class="form-label">背景图片</label>
          <input type="file" accept="image/*" @change="handleBackgroundUpload" />
          <div v-if="student.backgroundUrl" class="background-preview">
            <img :src="fileUrl(student.backgroundUrl)" alt="背景预览" />
            <button class="btn-danger btn-sm" @click="student.backgroundUrl = null">移除</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">背景颜色</label>
          <div class="color-row">
            <input v-model="student.backgroundColor" type="color" class="color-input" />
            <input v-model="student.backgroundColor" type="text" class="text-input" placeholder="#faf9f5" />
            <button class="btn-secondary btn-sm" @click="student.backgroundColor = null">清除</button>
          </div>
        </div>
      </div>

      <!-- 个人资料 -->
      <div class="card">
        <h2 class="title-md section-heading">个人资料</h2>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">昵称</label>
            <input v-model="student.info.nickname" type="text" class="text-input" />
          </div>
          <div class="form-group">
            <label class="form-label">性别</label>
            <input v-model="student.info.gender" type="text" class="text-input" />
          </div>
          <div class="form-group">
            <label class="form-label">出生日期</label>
            <input v-model="student.info.birthday" type="date" class="text-input" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">学校</label>
            <input v-model="student.info.school" type="text" class="text-input" />
          </div>
          <div class="form-group">
            <label class="form-label">班级</label>
            <input v-model="student.info.class" type="text" class="text-input" />
          </div>
          <div class="form-group">
            <label class="form-label">毕业年份</label>
            <input v-model="student.info.graduationYear" type="text" class="text-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">座右铭</label>
          <input v-model="student.info.motto" type="text" class="text-input" />
        </div>
      </div>

      <!-- 联系方式 -->
      <div class="card">
        <h2 class="title-md section-heading">联系方式</h2>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">QQ</label>
            <input v-model="student.info.qq" type="text" class="text-input" />
          </div>
          <div class="form-group">
            <label class="form-label">微信</label>
            <input v-model="student.info.wechat" type="text" class="text-input" />
          </div>
          <div class="form-group">
            <label class="form-label">手机</label>
            <input v-model="student.info.phone" type="text" class="text-input" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input v-model="student.info.email" type="text" class="text-input" />
          </div>
          <div class="form-group">
            <label class="form-label">常住地</label>
            <input v-model="student.info.address" type="text" class="text-input" />
          </div>
        </div>
      </div>

      <!-- 背景音乐 -->
      <div class="card">
        <h2 class="title-md section-heading">背景音乐</h2>
        <div class="form-group">
          <label class="form-label">音乐文件</label>
          <input type="file" accept="audio/*" @change="handleMusicUpload" />
          <audio v-if="student.musicUrl" :src="fileUrl(student.musicUrl)" controls class="audio-preview" />
        </div>
        <div class="form-group">
          <label class="form-label">音乐标题</label>
          <input v-model="student.musicTitle" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" v-model="student.musicAutoplay" />
            自动播放
          </label>
        </div>
      </div>

      <!-- 安全与隐私设置 -->
      <div class="card">
        <h2 class="title-md section-heading">安全与隐私设置</h2>
        <div class="form-group">
          <label class="form-label">重置自助编辑口令</label>
          <div class="color-row">
            <input v-model="tempEditSecret" :type="showSecret ? 'text' : 'password'" class="text-input" placeholder="留空则不修改已有口令" />
            <button class="btn-secondary btn-sm" @click="generateRandomSecret">随机生成</button>
            <button class="btn-secondary btn-sm" @click="showSecret = !showSecret">{{ showSecret ? '隐藏' : '显示' }}</button>
          </div>
          <p class="form-hint">留空表示不修改已有口令。口令保存后将以 PBKDF2 哈希安全存储。</p>
        </div>
        <div class="form-group">
          <label class="form-label">页面隐私级别 (默认仅同学可见)</label>
          <select v-model="student.privacyLevel" class="text-input">
            <option value="public">公开 (任何人可见)</option>
            <option value="classmates">仅同学可见 (需要验证姓名)</option>
            <option value="owner">仅本人与管理员可见</option>
            <option value="hidden">隐藏 (仅管理员可见)</option>
          </select>
        </div>
      </div>

      <!-- 个人小传 -->
      <div class="card">
        <h2 class="title-md section-heading">个人小传</h2>
        <div class="modules-list">
          <div v-for="(mod, idx) in student.info?.profileModules" :key="idx" class="module-item p-3 mb-3">
            <div class="module-item-header">
              <input v-model="mod.title" type="text" class="text-input module-title-input" placeholder="模块标题（例如：现在的我）" />
              <div class="module-actions">
                <button class="btn-secondary btn-sm" @click="moveModule(idx, -1)" :disabled="idx === 0">▲</button>
                <button class="btn-secondary btn-sm" @click="moveModule(idx, 1)" :disabled="idx === (student.info?.profileModules?.length ?? 0) - 1">▼</button>
                <button class="btn-danger btn-sm" @click="removeModule(idx)">✕</button>
              </div>
            </div>
            <textarea v-model="mod.content" class="textarea module-content-input mt-2" rows="3" placeholder="小传内容…"></textarea>
          </div>
          <button class="btn-secondary w-full" @click="addModule">+ 添加小传模块</button>
        </div>
      </div>

      <!-- 专属模板 -->
      <div v-if="student.isOwner" class="card">
        <h2 class="title-md section-heading">专属模板 HTML</h2>
        <p class="form-hint">编写自定义 HTML 代码，将覆盖默认的学生个人页模板。支持完整的 HTML/CSS/JS。</p>
        <div class="form-group">
          <textarea
            v-model="student.customHtml"
            class="html-editor"
            placeholder="<!DOCTYPE html>&#10;<html>&#10;  <body>&#10;    <h1>自定义页面</h1>&#10;  </body>&#10;</html>"
            rows="20"
          ></textarea>
        </div>
        <div class="form-group">
          <p class="form-hint">
            提示：可使用 <code>{{ student.name }}</code>、<code>{{ student.avatarUrl }}</code> 等变量。
            资源引用使用 R2 公开 URL。
          </p>
        </div>
      </div>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="toast" :class="'toast-' + toast.type">{{ toast.message }}</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminFetch } from '@/api/client'
import { compressImage } from '@/utils/image'
import type { Student, StudentInfo, ApiResponse } from '@alumni/shared'

const route = useRoute()
const router = useRouter()
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function fileUrl(url: string | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_BASE}${url}`
}
const saving = ref(false)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const student = ref<Student>({
  id: '',
  name: '',
  slug: '',
  isOwner: false,
  avatarUrl: null,
  musicUrl: null,
  musicTitle: null,
  musicAutoplay: false,
  backgroundUrl: null,
  backgroundColor: null,
  customHtml: null,
  info: {} as StudentInfo,
  photos: [],
  visitCount: 0,
  createdAt: '',
  updatedAt: '',
})

function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  setTimeout(() => { toast.value = null }, 3000)
}

async function handleAvatarUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const compressed = await compressImage(file, 400, 0.8)
  const formData = new FormData()
  formData.append('file', compressed)
  formData.append('type', 'avatar')
  formData.append('slug', student.value.slug)
  try {
    const res = await adminFetch<ApiResponse<{ url: string }>>('/api/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    })
    if (res.data?.url) student.value.avatarUrl = res.data.url
    showToast('success', '头像上传成功')
  } catch (e: any) {
    showToast('error', e.message || '上传失败')
  }
}

async function handleBackgroundUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const compressed = await compressImage(file, 1920, 0.85)
  const formData = new FormData()
  formData.append('file', compressed)
  formData.append('type', 'background')
  formData.append('slug', student.value.slug)
  try {
    const res = await adminFetch<ApiResponse<{ url: string }>>('/api/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    })
    if (res.data?.url) student.value.backgroundUrl = res.data.url
    showToast('success', '背景图片上传成功')
  } catch (e: any) {
    showToast('error', e.message || '上传失败')
  }
}

async function handleMusicUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', 'music')
  formData.append('slug', student.value.slug)
  try {
    const res = await adminFetch<ApiResponse<{ url: string }>>('/api/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    })
    if (res.data?.url) student.value.musicUrl = res.data.url
    showToast('success', '音乐上传成功')
  } catch (e: any) {
    showToast('error', e.message || '上传失败')
  }
}

const tempEditSecret = ref('')
const showSecret = ref(false)

function generateRandomSecret() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  tempEditSecret.value = result
  showSecret.value = true
}

async function handleSave() {
  saving.value = true
  try {
    const payload = { ...student.value }
    if (tempEditSecret.value) {
      payload.editSecret = tempEditSecret.value
    }
    await adminFetch(`/api/students/${student.value.slug}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    showToast('success', '保存成功')
    tempEditSecret.value = ''
  } catch (e: any) {
    showToast('error', e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const id = route.params.id as string
  try {
    const res = await adminFetch<ApiResponse<Student>>(`/api/students/${id}`)
    if (res.data) {
      student.value = res.data
      if (!student.value.privacyLevel) {
        student.value.privacyLevel = 'classmates'
      }
      if (!student.value.info) {
        student.value.info = {} as any
      }
      if (!student.value.info.profileModules) {
        student.value.info.profileModules = []
      }
    }
  } catch {
    router.replace('/students')
  }
})

function addModule() {
  if (!student.value.info.profileModules) {
    student.value.info.profileModules = []
  }
  student.value.info.profileModules.push({ type: 'custom', title: '', content: '' })
}

function removeModule(index: number) {
  if (!student.value.info.profileModules) return
  student.value.info.profileModules.splice(index, 1)
}

function moveModule(index: number, direction: number) {
  const mods = student.value.info.profileModules
  if (!mods) return
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= mods.length) return
  const temp = mods[index]
  mods[index] = mods[targetIndex]
  mods[targetIndex] = temp
}
</script>

<style scoped>
.header-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.edit-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.section-heading {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-hairline);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-md);
}

.form-hint {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
  margin-top: var(--spacing-xxs);
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  margin-top: var(--spacing-sm);
  border: 2px solid var(--color-hairline);
}

.background-preview {
  margin-top: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.background-preview img {
  max-width: 300px;
  max-height: 150px;
  object-fit: cover;
  border-radius: var(--rounded-md);
  border: 1px solid var(--color-hairline);
}

.color-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.color-input {
  width: 50px;
  height: 40px;
  padding: 2px;
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
  cursor: pointer;
}

.audio-preview {
  width: 100%;
  margin-top: var(--spacing-sm);
}

.html-editor {
  width: 100%;
  min-height: 400px;
  padding: var(--spacing-md);
  font-family: var(--font-code);
  font-size: 14px;
  line-height: 1.6;
  background-color: var(--color-surface-dark);
  color: var(--color-on-dark);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
  resize: vertical;
  tab-size: 2;
}

.btn-sm {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
}
.module-item {
  border: 1px solid var(--color-hairline);
  padding: 12px;
  margin-bottom: 12px;
  border-radius: var(--rounded-md);
  background: var(--color-surface-card);
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
}
.module-actions {
  display: flex;
  gap: 4px;
}
.module-content-input {
  width: 100%;
  margin-top: 8px;
}
.w-full {
  width: 100%;
}
</style>
