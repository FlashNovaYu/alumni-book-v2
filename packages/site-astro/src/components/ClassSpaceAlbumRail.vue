<template>
  <div class="album-rail-container">
    <div class="album-rail-viewport">
      <div v-if="albums.length > 0" class="album-rail-track">
        <a
          v-for="album in albums"
          :key="album.id"
          :href="'/album#album-' + album.id"
          class="album-rail-card"
        >
          <div class="album-cover-wrapper">
            <img
              v-if="album.coverR2Key"
              :src="getPhotoUrl(album.coverR2Key)"
              :alt="album.title"
              loading="lazy"
              class="album-cover"
            />
            <div v-else class="album-cover-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
            </div>
            <div class="photo-count-badge">
              {{ album.photoCount }} 张
            </div>
          </div>
          <div class="album-info">
            <h3 class="album-title">{{ album.title }}</h3>
            <div class="album-tags" v-if="album.tags && album.tags.length > 0">
              <span v-for="tag in album.tags" :key="tag" class="tag-badge">{{ tag }}</span>
            </div>
          </div>
        </a>
      </div>
      <div v-else class="empty-albums">
        <p class="empty-text">影像馆暂无相册记录 ~</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClassSpaceAlbumPreview } from '@alumni/shared'

const props = defineProps<{
  albums: ClassSpaceAlbumPreview[]
  apiBase: string
}>()

function getPhotoUrl(r2Key: string | null) {
  if (!r2Key) return ''
  if (r2Key.startsWith('http')) return r2Key
  // 拼接 API base 路径
  return `${props.apiBase}/api/files/${r2Key}`
}
</script>

<style scoped>
.album-rail-container {
  width: 100%;
  position: relative;
  overflow: hidden;
}

.album-rail-viewport {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: var(--spacing-sm) 0 var(--spacing-md) 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-paper-border) transparent;
}

/* 隐藏 Webkit 默认滚动条，使用自定义的优雅滚动条 */
.album-rail-viewport::-webkit-scrollbar {
  height: 6px;
}
.album-rail-viewport::-webkit-scrollbar-track {
  background: transparent;
}
.album-rail-viewport::-webkit-scrollbar-thumb {
  background-color: var(--color-paper-border);
  border-radius: var(--rounded-pill);
}

.album-rail-track {
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: nowrap;
  padding-bottom: var(--spacing-xs);
}

.album-rail-card {
  flex: 0 0 240px;
  width: 240px;
  background: var(--color-paper-card, #fcfaf2);
  border: 1px solid var(--color-paper-border, #eedec4);
  border-radius: var(--rounded-md);
  overflow: hidden;
  box-shadow: var(--shadow-paper-card, 0 4px 12px rgba(139,120,95,0.06));
  text-decoration: none;
  color: inherit;
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart), border-color var(--duration-normal) var(--ease-out-quart);
}

.album-rail-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 24px rgba(139,120,95,0.12);
  border-color: var(--color-paper-brown, #b8903a);
}

.album-cover-wrapper {
  position: relative;
  width: 100%;
  height: 160px;
  background: var(--color-surface-soft, #f7f6f2);
  overflow: hidden;
}

.album-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--duration-slow) var(--ease-out-quart);
}

.album-rail-card:hover .album-cover {
  transform: scale(1.05);
}

.album-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
}

.photo-count-badge {
  position: absolute;
  bottom: var(--spacing-sm);
  right: var(--spacing-sm);
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 11px;
  padding: 3px var(--spacing-xs);
  border-radius: var(--rounded-sm);
  font-weight: 500;
}

.album-info {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.album-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-paper-ink, #4a3e3d);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-badge {
  font-size: 10px;
  background: var(--color-surface-cream-strong, #eedec4);
  color: var(--color-primary, #8b785f);
  padding: 1px var(--spacing-xxs);
  border-radius: var(--rounded-pill);
}

.empty-albums {
  padding: var(--spacing-xl);
  text-align: center;
  background: var(--color-surface-cream, #fbfaf7);
  border: 1px dashed var(--color-paper-border);
  border-radius: var(--rounded-lg);
  width: 100%;
}

.empty-text {
  color: var(--color-muted);
  font-size: var(--type-body-sm-size);
}

@media (max-width: 768px) {
  .album-rail-card {
    flex: 0 0 200px;
    width: 200px;
  }
  .album-cover-wrapper {
    height: 130px;
  }
}
</style>
