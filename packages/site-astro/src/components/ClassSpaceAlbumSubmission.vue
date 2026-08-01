<template>
  <div class="album-submission">
    <label class="album-submission__trigger" :class="{ 'is-uploading': uploading }">
      {{ uploading ? '正在压缩并投稿…' : `向「${albumTitle}」投稿` }}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        :disabled="uploading"
        @change="uploadPhotos"
      />
    </label>
    <p class="album-submission__hint">每名同学最多 5 张，图片会自动压缩。</p>
    <p v-if="message" class="album-submission__message" :class="`is-${message.type}`" role="status">{{ message.text }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { appendImageVariants, compressImage, generateImageVariants, getClassmateToken } from '@alumni/shared'
import { handleClassmateUnauthorized } from '../api/classmateSession'
import { joinApiUrl } from '../utils/apiBase'

const props = defineProps<{
  apiBase: string
  albumTitle: string
}>()

const uploading = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)

async function uploadPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).slice(0, 5)
  const token = getClassmateToken()
  if (!files.length || !token) {
    input.value = ''
    if (!token) handleClassmateUnauthorized()
    return
  }

  uploading.value = true
  message.value = null
  try {
    for (const file of files) {
      const compressed = await compressImage(file, 1920, 0.82)
      const variants = await generateImageVariants(compressed, { widths: [640, 1280], quality: 0.82 })
      const formData = new FormData()
      formData.append('file', compressed)
      appendImageVariants(formData, variants, 'photos', 'classmate-submission')
      const res = await fetch(joinApiUrl(props.apiBase, '/api/classmate/album-photos'), {
        method: 'POST',
        headers: { 'X-Classmate-Token': token },
        body: formData,
      })
      if (res.status === 401) handleClassmateUnauthorized()
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || '投稿失败')
    }
    message.value = { type: 'success', text: `已投稿 ${files.length} 张图片` }
  } catch (error) {
    message.value = { type: 'error', text: error instanceof Error ? error.message : '投稿失败' }
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<style scoped>
.album-submission {
  display: grid;
  gap: 6px;
  padding-top: var(--spacing-sm);
}

.album-submission__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--accent);
  border-radius: var(--rounded-md);
  color: var(--accent);
  background: var(--surface-raised);
  font-size: var(--type-body-sm-size);
  font-weight: 600;
  cursor: pointer;
}

.album-submission__trigger:hover:not(.is-uploading) {
  background: var(--accent-soft);
}

.album-submission__trigger.is-uploading {
  cursor: progress;
  opacity: .7;
}

.album-submission__trigger input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}

.album-submission__hint,
.album-submission__message {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.album-submission__hint {
  color: var(--color-muted);
}

.album-submission__message.is-success {
  color: var(--success);
}

.album-submission__message.is-error {
  color: var(--error);
}
</style>
