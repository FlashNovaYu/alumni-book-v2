<template>
  <div class="albums-page">
    <div class="page-header">
      <h1 class="page-title">相册管理</h1>
      <button class="btn-primary" @click="showCreate = true">+ 新建相册</button>
    </div>

    <div class="album-list">
      <div v-for="album in albums" :key="album.id" class="album-card card">
        <div class="album-header-row">
          <div>
            <h3 class="title-md">
              {{ album.title }}
              <span v-if="album.featured" class="featured-badge">精选</span>
            </h3>
            <div class="album-tags mt-1">
              <span v-for="tag in album.tags" :key="tag" class="tag-badge">{{ tag }}</span>
            </div>
            <p class="album-meta mt-1">{{ album.photos?.length || 0 }} 张照片 · 边框: {{ album.frameStyle }}</p>
          </div>
          <div class="album-actions">
            <button class="btn-secondary" @click="startEdit(album)">管理相册</button>
            <button class="btn-secondary" @click="startUpload(album)">上传照片</button>
            <button class="btn-danger" @click="handleDelete(album)">删除</button>
          </div>
        </div>
        
        <div class="album-cover-preview-row mb-3" v-if="album.coverR2Key">
          <span class="text-xs text-muted">当前封面: </span>
          <img :src="getPhotoUrl(album.coverR2Key)" class="cover-mini-thumb" />
        </div>

        <div v-if="album.photos?.length" class="album-thumbs">
          <div v-for="photo in album.photos.slice(0, 6)" :key="photo.id" class="thumb">
            <img :src="getPhotoUrl(photo.r2Key)" :alt="photo.caption" />
          </div>
          <div v-if="album.photos.length > 6" class="thumb-more">
            +{{ album.photos.length - 6 }}
          </div>
        </div>
      </div>
    </div>

    <!-- 新建相册对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
          <div class="modal card">
            <h2 class="title-md">新建相册</h2>
            <div class="form-group">
              <label class="form-label">相册名称</label>
              <input v-model="newAlbum.title" type="text" class="text-input" />
            </div>
            <div class="form-group">
              <label class="form-label">描述</label>
              <textarea v-model="newAlbum.description" class="textarea"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">相框样式</label>
              <select v-model="newAlbum.frameStyle" class="text-input">
                <option value="none">无</option>
                <option value="retro">复古</option>
                <option value="film">胶片</option>
                <option value="polaroid">拍立得</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">标签 (多个标签用逗号隔开)</label>
              <input v-model="newAlbum.tagsInput" type="text" class="text-input" placeholder="例如: 毕业照, 运动会, 旅行" />
            </div>
            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="newAlbum.featured" type="checkbox" />
                <span class="ml-2">精选相册</span>
              </label>
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

    <!-- 编辑相册及照片管理对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="editAlbum" class="modal-overlay" @click.self="closeEdit">
          <div class="modal card edit-album-modal">
            <h2 class="title-md">编辑相册: {{ editAlbum.title }}</h2>
            <div class="form-group">
              <label class="form-label">相册名称</label>
              <input v-model="editForm.title" type="text" class="text-input" />
            </div>
            <div class="form-group">
              <label class="form-label">描述</label>
              <textarea v-model="editForm.description" class="textarea"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">标签 (多个标签用逗号隔开)</label>
              <input v-model="editForm.tagsInput" type="text" class="text-input" placeholder="例如: 毕业照, 运动会, 旅行" />
            </div>
            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="editForm.featured" type="checkbox" />
                <span class="ml-2">精选相册</span>
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">相框样式</label>
              <select v-model="editForm.frameStyle" class="text-input">
                <option value="none">无</option>
                <option value="retro">复古</option>
                <option value="film">胶片</option>
                <option value="polaroid">拍立得</option>
              </select>
            </div>
            
            <!-- 照片列表管理 -->
            <div class="photo-management mt-4">
              <h3 class="title-sm mb-2">照片管理 (输入说明后失焦自动保存，点击▲▼调序)</h3>
              <div v-if="editAlbum.photos && editAlbum.photos.length" class="manage-photo-grid">
                <div v-for="(photo, idx) in editAlbum.photos" :key="photo.id" class="manage-photo-item">
                  <img :src="getPhotoUrl(photo.r2Key)" class="manage-photo-img" />
                  <div class="photo-info">
                    <input v-model="photo.caption" type="text" class="text-input photo-caption-input" placeholder="输入说明..." @blur="updatePhotoCaption(photo)" />
                    <div class="photo-actions mt-1">
                      <button class="btn-secondary btn-action-sm" @click="movePhoto(editAlbum, idx, -1)" :disabled="idx === 0">▲</button>
                      <button class="btn-secondary btn-action-sm" @click="movePhoto(editAlbum, idx, 1)" :disabled="idx === editAlbum.photos.length - 1">▼</button>
                      <button class="btn-secondary btn-action-sm" :class="{ 'btn-active-cover': editForm.coverR2Key === photo.r2Key }" @click="setCover(photo.r2Key)">
                        {{ editForm.coverR2Key === photo.r2Key ? '封面' : '设为封面' }}
                      </button>
                      <button class="btn-danger btn-action-sm" @click="deletePhoto(editAlbum, photo.id)">✕</button>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted text-center py-3">暂无照片，请关闭后选择上传照片</p>
            </div>

            <div class="modal-actions mt-4">
              <button class="btn-secondary" @click="closeEdit">取消</button>
              <button class="btn-primary" @click="handleSaveEdit" :disabled="saving">
                {{ saving ? '保存中...' : '保存修改' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 上传照片对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="uploadAlbum" class="modal-overlay" @click.self="uploadAlbum = null">
          <div class="modal card upload-modal">
            <h2 class="title-md">上传照片到: {{ uploadAlbum.title }}</h2>
            <p class="upload-subtitle">支持拖入多张 JPG、PNG、GIF 或点击选择文件</p>
            <div
              class="upload-dropzone"
              :class="{ 'is-dragover': isDragOver }"
              @dragover.prevent="isDragOver = true"
              @dragenter.prevent="isDragOver = true"
              @dragleave.prevent="isDragOver = false"
              @drop.prevent="handleFileDrop"
              @click="triggerFileInput"
            >
              <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="handleFileSelect" />
              <strong>拖入照片至此</strong>
              <span>或点击选择文件</span>
            </div>
            <div v-if="uploading" class="upload-progress">上传中...</div>
            <div class="modal-actions">
              <button class="btn-secondary" :disabled="uploading" @click="uploadAlbum = null">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminFetch } from '@/api/client'
import { compressImage } from '@/utils/image'
import type { Album, ApiResponse } from '@alumni/shared'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const albums = ref<any[]>([])
const showCreate = ref(false)
const uploadAlbum = ref<any | null>(null)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const creating = ref(false)
const newAlbum = ref({ title: '', description: '', frameStyle: 'none', tagsInput: '', featured: false })

const editAlbum = ref<any | null>(null)
const editForm = ref({
  title: '',
  description: '',
  frameStyle: 'none',
  tagsInput: '',
  coverR2Key: '',
  featured: false,
})

function getPhotoUrl(r2Key: string): string {
  if (r2Key.startsWith('http')) return r2Key
  return `${API_BASE}/api/files/${r2Key}`
}

async function loadAlbums() {
  try {
    const res = await adminFetch<ApiResponse<any[]>>('/api/albums')
    albums.value = res.data || []
  } catch {
    albums.value = []
  }
}

async function handleCreate() {
  if (!newAlbum.value.title.trim()) return
  creating.value = true
  const tags = newAlbum.value.tagsInput
    ? newAlbum.value.tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0)
    : []
  try {
    await adminFetch('/api/albums', {
      method: 'POST',
      body: JSON.stringify({
        title: newAlbum.value.title,
        description: newAlbum.value.description,
        frameStyle: newAlbum.value.frameStyle,
        tags,
        featured: newAlbum.value.featured,
      }),
    })
    showCreate.value = false
    newAlbum.value = { title: '', description: '', frameStyle: 'none', tagsInput: '', featured: false }
    await loadAlbums()
  } catch (e: any) {
    alert(e.message || '创建失败')
  } finally {
    creating.value = false
  }
}

function startUpload(album: any) {
  uploadAlbum.value = album
}

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (files) void uploadFiles(files)
}

function handleFileDrop(event: DragEvent) {
  isDragOver.value = false
  const files = event.dataTransfer?.files
  if (files) void uploadFiles(files)
}

async function uploadFiles(files: FileList) {
  if (!files?.length || !uploadAlbum.value) return

  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      const formData = new FormData()
      const compressed = await compressImage(file, 1280, 0.8)
      formData.append('file', compressed)
      formData.append('type', 'photo')
      formData.append('albumId', uploadAlbum.value.id)
      await adminFetch('/api/upload', {
        method: 'POST',
        body: formData,
        headers: {},
      })
    }
    await loadAlbums()
    alert('上传成功')
  } catch (e: any) {
    alert(e.message || '上传失败')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function handleDelete(album: any) {
  if (!confirm(`确定要删除相册 "${album.title}" 吗？`)) return
  try {
    await adminFetch(`/api/albums/${album.id}`, { method: 'DELETE' })
    await loadAlbums()
  } catch (e: any) {
    alert(e.message || '删除失败')
  }
}

function startEdit(album: any) {
  editAlbum.value = { ...album }
  editAlbum.value.photos = album.photos ? album.photos.map((p: any) => ({ ...p })) : []
  
  editForm.value = {
    title: album.title || '',
    description: album.description || '',
    frameStyle: album.frameStyle || 'none',
    tagsInput: album.tags ? album.tags.join(', ') : '',
    coverR2Key: album.coverR2Key || '',
    featured: !!album.featured,
  }
}

function closeEdit() {
  editAlbum.value = null
}

function setCover(r2Key: string) {
  editForm.value.coverR2Key = r2Key
}

async function updatePhotoCaption(photo: any) {
  try {
    await adminFetch(`/api/photos/${photo.id}`, {
      method: 'PUT',
      body: JSON.stringify({ caption: photo.caption })
    })
  } catch (e: any) {
    alert('更新照片说明失败: ' + e.message)
  }
}

async function movePhoto(album: any, idx: number, direction: number) {
  const targetIdx = idx + direction
  if (targetIdx < 0 || targetIdx >= album.photos.length) return
  
  const temp = album.photos[idx]
  album.photos[idx] = album.photos[targetIdx]
  album.photos[targetIdx] = temp
  
  try {
    await Promise.all([
      adminFetch(`/api/photos/${album.photos[idx].id}`, {
        method: 'PUT',
        body: JSON.stringify({ sortOrder: idx })
      }),
      adminFetch(`/api/photos/${album.photos[targetIdx].id}`, {
        method: 'PUT',
        body: JSON.stringify({ sortOrder: targetIdx })
      })
    ])
  } catch (e: any) {
    alert('调整排序失败: ' + e.message)
  }
}

async function deletePhoto(album: any, photoId: string) {
  if (!confirm('确定要删除这张照片吗？')) return
  const reason = prompt('请输入删除原因：')
  if (reason === null || !reason.trim()) return
  try {
    await adminFetch(`/api/photos/${photoId}`, {
      method: 'DELETE', body: JSON.stringify({ reason: reason.trim() })
    })
    album.photos = album.photos.filter((p: any) => p.id !== photoId)
    // 如果被删除照片是封面，则清空封面
    const targetPhoto = editAlbum.value.photos.find((p: any) => p.id === photoId)
    if (targetPhoto && editForm.value.coverR2Key === targetPhoto.r2Key) {
      editForm.value.coverR2Key = ''
    }
  } catch (e: any) {
    alert('删除照片失败: ' + e.message)
  }
}

const saving = ref(false)
async function handleSaveEdit() {
  if (!editAlbum.value) return
  saving.value = true
  
  const tags = editForm.value.tagsInput
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)
    
  try {
    await adminFetch(`/api/albums/${editAlbum.value.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: editForm.value.title,
        description: editForm.value.description,
        frameStyle: editForm.value.frameStyle,
        coverR2Key: editForm.value.coverR2Key,
        tags,
        featured: editForm.value.featured,
      })
    })
    closeEdit()
    await loadAlbums()
  } catch (e: any) {
    alert('保存修改失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

onMounted(loadAlbums)
</script>

<style scoped>
.featured-badge {
  display: inline-block;
  padding: 1px 6px;
  background: var(--color-accent-amber);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  border-radius: var(--rounded-xs);
  margin-left: 6px;
  vertical-align: middle;
}

.checkbox-group {
  display: flex;
  align-items: center;
  margin-top: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  font-size: var(--type-body-sm-size);
  color: var(--color-body);
  cursor: pointer;
}

.checkbox-label input {
  margin-right: 8px;
  cursor: pointer;
}

.ml-2 {
  margin-left: 8px;
}

.album-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.album-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.album-meta {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
}

.album-actions {
  display: flex;
  gap: var(--spacing-xs);
}

.album-thumbs {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.thumb {
  width: 80px;
  height: 80px;
  border-radius: var(--rounded-sm);
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-more {
  width: 80px;
  height: 80px;
  border-radius: var(--rounded-sm);
  background: var(--color-surface-cream-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
}

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
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.edit-album-modal {
  max-width: 600px;
}

.modal h2 { margin-bottom: var(--spacing-lg); }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); }
.upload-progress { padding: var(--spacing-md); text-align: center; color: var(--color-muted); }
.upload-modal { max-width: 520px; }
.upload-subtitle { margin: calc(var(--spacing-md) * -1) 0 var(--spacing-md); color: var(--color-muted); font-size: var(--type-body-sm-size); }
.upload-dropzone { display: grid; min-height: 180px; place-content: center; gap: var(--spacing-xs); padding: var(--spacing-lg); color: var(--color-muted); text-align: center; border: 2px dashed var(--color-hairline); border-radius: var(--rounded-lg); background: var(--color-surface-cream); cursor: pointer; transition: border-color .2s ease, background-color .2s ease, color .2s ease; }
.upload-dropzone strong { color: inherit; font-size: var(--type-title-sm-size); }.upload-dropzone span { font-size: var(--type-body-sm-size); }
.upload-dropzone:hover, .upload-dropzone.is-dragover { color: var(--color-primary); border-color: var(--color-primary); background: var(--color-surface-cream-strong); }

.tag-badge {
  display: inline-block;
  padding: 2px var(--spacing-xs);
  background: var(--color-surface-cream-strong);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--rounded-pill);
  margin-right: 4px;
}

.album-cover-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cover-mini-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--rounded-xs);
  border: 1px solid var(--color-hairline);
}

.photo-management {
  border-top: 1px solid var(--color-hairline);
  padding-top: var(--spacing-md);
}

.manage-photo-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-sm);
  background: var(--color-surface-cream);
}

.manage-photo-item {
  display: flex;
  gap: var(--spacing-xs);
  background: #fff;
  border: 1px solid var(--color-hairline);
  padding: var(--spacing-xs);
  border-radius: var(--rounded-sm);
}

.manage-photo-img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: var(--rounded-xs);
}

.photo-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.photo-caption-input {
  padding: var(--spacing-xxs) var(--spacing-xs);
  font-size: 12px;
}

.photo-actions {
  display: flex;
  gap: var(--spacing-xxs);
}

.btn-action-sm {
  font-size: 10px;
  padding: 2px 6px;
  height: 24px;
}

.btn-active-cover {
  background: var(--color-primary) !important;
  color: #fff !important;
  border-color: var(--color-primary) !important;
}

.text-muted {
  color: var(--color-muted);
}
.text-center {
  text-align: center;
}
.py-3 {
  padding-top: var(--spacing-md);
  padding-bottom: var(--spacing-md);
}
.mt-4 { margin-top: 16px; }
.mb-3 { margin-bottom: 12px; }

@media (max-width: 600px) {
  .album-header-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }
  .album-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }
  .album-actions button {
    flex: 1;
    min-width: 80px;
  }
  .manage-photo-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
