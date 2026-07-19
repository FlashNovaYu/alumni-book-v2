<template>
  <div>
    <!-- 标签过滤导航栏 -->
    <div v-if="allTags.length > 1" class="tags-filter-bar mb-4 fade-in">
      <button
        v-for="tag in allTags"
        :key="tag"
        class="tag-filter-btn"
        :class="{ active: selectedTag === tag }"
        @click="selectedTag = tag"
      >
        {{ tag }}
      </button>
    </div>

    <!-- 相册网格列表 -->
    <div v-if="filteredAlbums.length" class="album-sections">
      <div v-for="album in filteredAlbums" :key="album.id" :id="'album-' + album.id" class="album-section">
        <div class="album-header-container">
          <div>
            <h2 class="album-name title-lg">{{ album.title }}</h2>
            <p v-if="album.description" class="album-desc">{{ album.description }}</p>
          </div>
          <div v-if="album.tags && album.tags.length" class="album-card-tags">
            <span v-for="tag in album.tags" :key="tag" class="album-tag-badge">{{ tag }}</span>
          </div>
        </div>

        <TransitionGroup name="photo-list" tag="div" class="photo-grid" :class="'frame-' + album.frameStyle">
          <div
            v-for="(photo, i) in album.photos"
            :key="photo.id"
            class="photo-item"
            :class="{ 'is-hovered': getState(photo.id).isHovered }"
            :style="getTiltStyles(photo.id, `rotateZ(${getStaticRotation(i)}deg) translateY(${getStaticY(i)}px)`)"
            @mousemove="onMouseMove($event, photo.id)"
            @mouseenter="onMouseEnter(photo.id); playPaperSlide()"
            @mouseleave="onMouseLeave(photo.id)"
            @touchstart="playPaperSlide()"
            @click="openLightbox(album.photos, i); playCrystalTick()"
          >
            <div class="glare-layer" :style="{ opacity: getState(photo.id).isHovered ? 1 : 0 }"></div>
            <img
              v-if="!photoErrors[photo.id]"
              :src="getMedia(photo).src"
              :srcset="getMedia(photo).srcset || undefined"
              :sizes="getMedia(photo).sizes"
              :alt="photo.caption"
              loading="lazy"
              decoding="async"
              style="aspect-ratio: 1"
              @error="photoErrors[photo.id] = true"
            />
            <div v-else class="photo-error-placeholder">⚠️ 图片加载失败</div>
            <div v-if="photo.caption" class="photo-caption">{{ photo.caption }}</div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>在此分类下暂无影像</p>
    </div>

    <!-- 灯箱 -->
    <Teleport v-if="isMounted" to="body">
      <Transition name="lightbox">
      <div v-if="lightbox.open" class="lightbox" @click.self="closeLightbox">
        <button class="lightbox-close" @click="closeLightbox">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button v-if="lightbox.index > 0" class="lightbox-nav prev" @click="prevPhoto">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="lightbox-content">
          <!-- 模糊占位图（0 延迟，100% 缓存命中，作为大图载入前的优雅遮罩） -->
          <img
            v-if="!highResLoaded"
            :src="getPhotoUrl(lightbox.photos[lightbox.index]?.r2Key)"
            class="lightbox-img placeholder-blur"
            alt="Loading..."
            decoding="async"
          />
          <!-- 高清大图 -->
          <img
            :src="getPhotoUrl(lightbox.photos[lightbox.index]?.r2Key)"
            class="lightbox-img real-img"
            :class="{ 'loaded': highResLoaded }"
            :alt="lightbox.photos[lightbox.index]?.caption"
            decoding="async"
            @load="onHighResLoad"
          />
          <!-- 精致 Spinner 指示器 -->
          <div v-if="!highResLoaded" class="lightbox-spinner">
            <div class="spinner-ring"></div>
          </div>
        </div>
        <button v-if="lightbox.index < lightbox.photos.length - 1" class="lightbox-nav next" @click="nextPhoto">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <div class="lightbox-caption">{{ lightbox.photos[lightbox.index]?.caption }}</div>
        <div class="lightbox-counter">{{ lightbox.index + 1 }} / {{ lightbox.photos.length }}</div>
      </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted, onMounted } from 'vue'
import { joinApiUrl } from '../utils/apiBase'
import { runWhenIdle, isDeepEqual } from '../utils/deferredFetch'
import { useMouseTilt } from '../composables/useMouseTilt'
import { useAudioSynth } from '../composables/useAudioSynth'
import { buildMediaSources, resolveMediaUrl, type MediaVariant } from '@alumni/shared'

const { onMouseMove, onMouseEnter, onMouseLeave, getTiltStyles, getState } = useMouseTilt({ maxTilt: 10, scale: 1.05 })
const { playPaperSlide, playCrystalTick } = useAudioSynth()

function getStaticRotation(index: number) {
  return (Math.sin(index * 1.5) * 2).toFixed(2);
}
function getStaticY(index: number) {
  return (Math.cos(index * 2.1) * 3).toFixed(2);
}

const props = defineProps<{
  albums: Array<{
    id: string; title: string; description: string; frameStyle: string; coverR2Key?: string; tags?: string[]
    photos: Array<{ id: string; r2Key: string; caption: string; media?: { variants: MediaVariant[] } | null }>
  }>
  apiBase: string
}>()

const isMounted = ref(false)
const albumsState = ref([...props.albums])
const photoErrors = ref<Record<string, boolean>>({})
const highResLoaded = ref(false)

function getPhotoUrl(r2Key: string) {
  if (!r2Key) return ''
  if (r2Key.startsWith('http')) return r2Key
  return joinApiUrl(props.apiBase, `/api/files/${r2Key}`)
}

function getMedia(photo: { r2Key: string; media?: { variants: MediaVariant[] } | null }) {
  return buildMediaSources(getPhotoUrl(photo.r2Key), photo.media?.variants, 320, 320)
}

function preloadUrl(photo: { r2Key: string; media?: { variants: MediaVariant[] } | null }) {
  const media = getMedia(photo)
  const variant = media.variants?.find((item) => item.width >= 960) || media.variants?.[media.variants.length - 1]
  return variant ? resolveMediaUrl(getPhotoUrl(photo.r2Key), variant.key) : getPhotoUrl(photo.r2Key)
}

// 标签过滤
const selectedTag = ref('全部')

const allTags = computed(() => {
  const tagsSet = new Set<string>()
  albumsState.value.forEach(album => {
    if (album.tags && Array.isArray(album.tags)) {
      album.tags.forEach(tag => {
        if (tag && tag.trim()) tagsSet.add(tag.trim())
      })
    }
  })
  return ['全部', ...Array.from(tagsSet)]
})

const filteredAlbums = computed(() => {
  if (selectedTag.value === '全部') return albumsState.value
  return albumsState.value.filter(album =>
    album.tags && Array.isArray(album.tags) && album.tags.includes(selectedTag.value)
  )
})

onMounted(() => {
  isMounted.value = true
  runWhenIdle(async () => {
    try {
      const url = joinApiUrl(props.apiBase, '/api/albums')
      const res = await fetch(url)
      const data = await res.json()
      if (data.success && data.data) {
        if (!isDeepEqual(data.data, albumsState.value)) {
          albumsState.value = data.data
        }
      }
    } catch (e) {
      console.error('Failed to sync albums via SWR:', e)
    }
  })
})

const lightbox = reactive({ open: false, photos: [] as any[], index: 0 })

function onHighResLoad() {
  highResLoaded.value = true
}

function openLightbox(photos: any[], index: number) {
  highResLoaded.value = false
  lightbox.photos = photos; lightbox.index = index; lightbox.open = true
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleKeydown)
  preloadImages()
}
function closeLightbox() {
  lightbox.open = false; document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKeydown)
}
function prevPhoto() {
  if (lightbox.index > 0) {
    highResLoaded.value = false
    lightbox.index--
  }
}
function nextPhoto() {
  if (lightbox.index < lightbox.photos.length - 1) {
    highResLoaded.value = false
    lightbox.index++
  }
}

// 预加载逻辑
function preloadImages() {
  const nextIdx = lightbox.index + 1
  const prevIdx = lightbox.index - 1
  if (nextIdx < lightbox.photos.length) {
    const img = new Image()
    img.src = preloadUrl(lightbox.photos[nextIdx])
  }
  if (prevIdx >= 0) {
    const img = new Image()
    img.src = preloadUrl(lightbox.photos[prevIdx])
  }
}

// 监听索引变化进行预加载并重置高清图加载态
watch(() => lightbox.index, () => {
  highResLoaded.value = false
  preloadImages()
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeLightbox()
  if (e.key === 'ArrowLeft') prevPhoto()
  if (e.key === 'ArrowRight') nextPhoto()
}
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.tags-filter-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xl);
}

.tag-filter-btn {
  min-height: 36px;
  padding: var(--spacing-xxs) var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
  border-radius: var(--rounded-pill);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-quart);
}

.tag-filter-btn:hover {
  border-color: var(--color-paper-brown);
  color: var(--color-paper-brown);
}

.tag-filter-btn.active {
  border-color: var(--color-paper-brown);
  background: var(--color-paper-brown);
  color: var(--text-inverse);
}

.album-section {
  margin-bottom: var(--spacing-xxl);
  padding: var(--spacing-xl);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-card);
}
.album-header-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--color-hairline);
  padding-bottom: var(--spacing-sm);
}
.album-name { margin-bottom: var(--spacing-xxs); }
.album-desc { font-size: var(--type-body-sm-size); color: var(--color-muted); }

.album-card-tags {
  display: flex;
  gap: var(--spacing-xxs);
  flex-wrap: wrap;
}
.album-tag-badge {
  font-size: 11px;
  background: var(--color-surface-cream-strong);
  color: var(--color-primary);
  padding: 2px var(--spacing-xs);
  border-radius: var(--rounded-pill);
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-lg);
  perspective: 1200px;
}

.photo-item {
  position: relative;
  border-radius: 4px;
  cursor: pointer;
  /* Retro paper padding */
  padding: 12px;
  padding-bottom: 36px;
  background: #fdfaf6;
  box-shadow:
    0 4px 12px rgba(0,0,0,0.08),
    0 1px 3px rgba(0,0,0,0.1),
    inset 0 0 0 1px rgba(0,0,0,0.05);
  transform-style: preserve-3d;
  will-change: transform;
}

.photo-item.is-hovered {
  box-shadow:
    0 20px 40px rgba(0,0,0,0.15),
    0 8px 16px rgba(0,0,0,0.1),
    inset 0 0 0 1px rgba(0,0,0,0.05);
  z-index: 10;
}

.glare-layer {
  position: absolute;
  inset: 0;
  border-radius: 4px;
  pointer-events: none;
  background: radial-gradient(
    circle at var(--glare-x, 50%) var(--glare-y, 50%),
    var(--glass-border) 0%,
    transparent 100%
  );
  box-shadow: inset 0 1px 0 var(--glass-panel);transition: opacity 0.3s ease;
  z-index: 5;
}

.photo-item img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 2px;
}

.photo-caption {
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  text-align: center;
  padding: 0 12px;
  color: #8c7b64;
  font-family: 'Kaiti', 'STKaiti', cursive, serif;
  font-size: 13px;
  opacity: 0.8;
  transition: opacity var(--duration-normal) var(--ease-out-quart);
  z-index: 6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.photo-item:hover .photo-caption { opacity: 1; color: #5a4b38; }

.frame-retro .photo-item { background: #f4ecd8; padding-bottom: 40px; }
.frame-film .photo-item { padding: 12px; padding-bottom: 12px; background: #1c1c1c; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.frame-film .photo-caption { color: #aaa; bottom: 16px; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding: 8px; opacity: 0; }
.frame-film .photo-item:hover .photo-caption { opacity: 1; color: #eee; }
.frame-polaroid .photo-item { padding: 16px; padding-bottom: 56px; background: var(--bg-surface); box-shadow: var(--shadow-lg); border-radius: 2px; }
.frame-polaroid .photo-caption { bottom: 16px; font-size: 14px; color: #444; }

/* FLIP Animations */
.photo-list-move,
.photo-list-enter-active,
.photo-list-leave-active {
  transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
}

.photo-list-enter-from,
.photo-list-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.9) rotateZ(-2deg);
}

.photo-list-leave-active {
  position: absolute;
}

.lightbox { position: fixed; inset: 0; z-index: var(--z-lightbox, 200); background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center; }
.lightbox-close { position: absolute; top: 20px; right: 24px; color: rgba(240,210,150,0.6); font-size: 28px; background: none; border: none; cursor: pointer; transition: color var(--duration-fast) var(--ease-out-quart), transform var(--duration-fast) var(--ease-out-quart); }
.lightbox-close:hover { color: var(--color-on-dark); transform: rotate(90deg); }

/* 渐进式大图加载容器与图片样式 */
.lightbox-content {
  position: relative;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--rounded-xs);
  box-shadow: 0 10px 60px rgba(0,0,0,0.5);
}

.lightbox-img {
  max-width: 100%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: var(--rounded-xs);
}

.placeholder-blur {
  filter: blur(15px);
  transform: scale(1.08);
  opacity: 0.5;
}

.real-img {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  opacity: 0;
  transition: opacity 0.35s cubic-bezier(0.25, 1, 0.5, 1);
}

.real-img.loaded {
  position: relative;
  width: auto; height: auto;
  opacity: 1;
}

/* 精致圆环 Spinner 指示器 */
.lightbox-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}

.spinner-ring {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(240, 210, 150, 0.1);
  border-top: 3px solid rgba(240, 210, 150, 0.85);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); color: rgba(240,210,150,0.5); font-size: 36px; background: rgba(0,0,0,0.3); border: none; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart), transform var(--duration-fast) var(--ease-out-quart); }
.lightbox-nav:hover { background: rgba(0,0,0,0.6); color: var(--color-on-dark); }
.lightbox-nav.prev:hover { transform: translateY(-50%) translateX(-2px); }
.lightbox-nav.next:hover { transform: translateY(-50%) translateX(2px); }
.lightbox-nav.prev { left: 16px; }
.lightbox-nav.next { right: 16px; }
.lightbox-caption { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); color: rgba(240,210,150,0.7); font-size: var(--type-body-sm-size); letter-spacing: 0.1em; }
.lightbox-counter { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); color: rgba(240,210,150,0.4); font-size: var(--type-caption-size); }

.empty-state { text-align: center; padding: 40px; color: var(--color-muted); }

/* ── Lightbox transitions ── */
.lightbox-enter-active { transition: opacity var(--duration-slow) var(--ease-out-quart); }
.lightbox-leave-active { transition: opacity var(--duration-normal) var(--ease-out-quart); }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .photo-grid { 
    grid-template-columns: repeat(2, 1fr); 
    gap: 12px;
  }

  .tags-filter-bar {
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tag-filter-btn {
    flex: 0 0 auto;
  }

  .album-section {
    padding: var(--spacing-lg);
  }
}

.photo-error-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  background-color: var(--color-surface-soft, #f7f6f2);
  color: var(--color-muted);
  border: 1px dashed var(--color-hairline);
  aspect-ratio: 1;
}
</style>
