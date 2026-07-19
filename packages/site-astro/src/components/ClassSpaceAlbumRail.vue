<template>
  <div class="album-rail-container">
    <div class="album-rail-viewport">
      <div v-if="albums.length > 0" class="album-rail-track">
        <a
          v-for="album in albums"
          :key="album.id"
          :href="albumHref(album.id)"
          class="album-rail-card"
        >
          <div class="album-cover-wrapper">
            <img
              v-if="album.coverR2Key"
              :src="coverMedia(album).src"
              :srcset="coverMedia(album).srcset || undefined"
              :sizes="coverMedia(album).sizes"
              :alt="album.title"
              width="292"
              height="195"
              loading="lazy"
              decoding="async"
              class="album-cover"
            />
            <div v-else class="album-cover-placeholder">暂无封面</div>
            <div class="album-cover-overlay">
              <h3 class="album-title">{{ album.title }}</h3>
            </div>
            <div class="photo-count-badge">
              {{ album.photoCount }} 张
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
import { buildMediaSources, type ClassSpaceAlbumPreview } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

const props = defineProps<{
  albums: ClassSpaceAlbumPreview[]
  apiBase: string
  siteBase: string
}>()

function getPhotoUrl(r2Key: string | null) {
  if (!r2Key) return ''
  if (r2Key.startsWith('http')) return r2Key
  return joinApiUrl(props.apiBase, `/api/files/${r2Key.replace(/^\/+/, '')}`)
}

function coverMedia(album: ClassSpaceAlbumPreview) {
  return buildMediaSources(getPhotoUrl(album.coverR2Key), album.media?.variants, 292, 195)
}

function albumHref(albumId: string) {
  const base = props.siteBase.endsWith('/') ? props.siteBase : `${props.siteBase}/`
  return `${base}album#album-${albumId}`
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
  scroll-snap-type: x proximity;
  touch-action: pan-x pan-y;
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
  position: relative;
  flex: 0 0 clamp(220px, 25vw, 292px);
  aspect-ratio: 3 / 2;
  background: var(--color-paper-card, #fcfaf2);
  border: 1px solid var(--color-paper-border, #eedec4);
  border-radius: var(--rounded-md);
  overflow: hidden;
  box-shadow: var(--shadow-paper-card, 0 4px 12px rgba(139,120,95,0.06));
  text-decoration: none;
  color: inherit;
  scroll-snap-align: start;
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart), border-color var(--duration-normal) var(--ease-out-quart);
}

.album-rail-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 24px rgba(139,120,95,0.12);
  border-color: var(--color-paper-brown, #b8903a);
}

.album-cover-wrapper {
  position: absolute;
  inset: 0;
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
  color: #fff;
  font-size: 11px;
  padding: 3px var(--spacing-xs);
  border-radius: var(--rounded-sm);
  font-weight: 500;
}

.album-cover-overlay {
  position: absolute;
  top: var(--spacing-md);
  left: var(--spacing-md);
  right: var(--spacing-md);
  pointer-events: none;
}

.album-title {
  margin: 0;
  display: inline;
  padding: 4px 7px;
  color: #fffaf2;
  background: rgba(47, 35, 24, 0.68);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.55;
  overflow-wrap: anywhere;
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
    flex-basis: min(72vw, 260px);
  }
}
</style>
