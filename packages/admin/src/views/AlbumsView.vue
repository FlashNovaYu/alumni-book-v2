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
            <h3 class="title-md">{{ album.title }}</h3>
            <p class="album-meta">{{ album.photos?.length || 0 }} 张照片</p>
          </div>
          <div class="album-actions">
            <button class="btn-secondary" @click="startUpload(album)">上传照片</button>
            <button class="btn-danger" @click="handleDelete(album)">删除</button>
          </div>
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
            <div class="modal-actions">
              <button class="btn-secondary" @click="showCreate = false">取消</button>
              <button class="btn-primary" @click="handleCreate">创建</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 上传照片对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="uploadAlbum" class="modal-overlay" @click.self="uploadAlbum = null">
          <div class="modal card">
            <h2 class="title-md">上传照片到: {{ uploadAlbum.title }}</h2>
            <div class="form-group">
              <input type="file" accept="image/*" multiple @change="handlePhotoUpload" />
            </div>
            <div v-if="uploading" class="upload-progress">上传中...</div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="uploadAlbum = null">关闭</button>
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

const albums = ref<Album[]>([])
const showCreate = ref(false)
const uploadAlbum = ref<Album | null>(null)
const uploading = ref(false)
const newAlbum = ref({ title: '', description: '', frameStyle: 'none' })

function getPhotoUrl(r2Key: string): string {
  if (r2Key.startsWith('http')) return r2Key
  return `${API_BASE}/api/files/${r2Key}`
}

async function loadAlbums() {
  try {
    const res = await adminFetch<ApiResponse<Album[]>>('/api/albums')
    albums.value = res.data || []
  } catch {
    albums.value = []
  }
}

async function handleCreate() {
  if (!newAlbum.value.title.trim()) return
  try {
    await adminFetch('/api/albums', {
      method: 'POST',
      body: JSON.stringify(newAlbum.value),
    })
    showCreate.value = false
    newAlbum.value = { title: '', description: '', frameStyle: 'none' }
    await loadAlbums()
  } catch (e: any) {
    alert(e.message || '创建失败')
  }
}

function startUpload(album: Album) {
  uploadAlbum.value = album
}

async function handlePhotoUpload(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length || !uploadAlbum.value) return

  uploading.value = true
  try {
    for (const file of files) {
      const formData = new FormData()
      const compressed = await compressImage(file)
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
  }
}

async function handleDelete(album: Album) {
  if (!confirm(`确定要删除相册 "${album.title}" 吗？`)) return
  try {
    await adminFetch(`/api/albums/${album.id}`, { method: 'DELETE' })
    await loadAlbums()
  } catch (e: any) {
    alert(e.message || '删除失败')
  }
}

onMounted(loadAlbums)
</script>

<style scoped>
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
  margin-top: var(--spacing-xxs);
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
}

.modal h2 { margin-bottom: var(--spacing-lg); }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); margin-top: var(--spacing-lg); }
.upload-progress { padding: var(--spacing-md); text-align: center; color: var(--color-muted); }
</style>
