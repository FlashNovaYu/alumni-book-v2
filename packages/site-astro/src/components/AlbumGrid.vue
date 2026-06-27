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
      <div v-for="album in filteredAlbums" :key="album.id" class="album-section">
        <div class="album-header-container">
          <div>
            <h2 class="album-name title-lg">{{ album.title }}</h2>
            <p v-if="album.description" class="album-desc">{{ album.description }}</p>
          </div>
          <div v-if="album.tags && album.tags.length" class="album-card-tags">
            <span v-for="tag in album.tags" :key="tag" class="album-tag-badge">{{ tag }}</span>
          </div>
        </div>
        
        <div class="photo-grid" :class="'frame-' + album.frameStyle">
          <div v-for="(photo, i) in album.photos" :key="photo.id" class="photo-item" @click="openLightbox(album.photos, i)">
            <img
              v-if="!photoErrors[photo.id]"
              :src="getPhotoUrl(photo.r2Key)"
              :alt="photo.caption"
              loading="lazy"
              decoding="async"
              style="aspect-ratio: 1"
              @error="photoErrors[photo.id] = true"
              @load="loadedPhotos[photo.id] = true"
              :class="{ 'img-loaded': loadedPhotos[photo.id] }"
              class="fade-in-img"
            />
            <div v-else class="photo-error-placeholder">⚠️ 图片加载失败</div>
            <div v-if="photo.caption" class="photo-caption">{{ photo.caption }}</div>
          </div>
        </div>
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
        <img :src="getPhotoUrl(lightbox.photos[lightbox.index]?.r2Key)" class="lightbox-img" />
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

const props = defineProps<{
  albums: Array<{
    id: string; title: string; description: string; frameStyle: string; coverR2Key?: string; tags?: string[]
    photos: Array<{ id: string; r2Key: string; caption: string }>
  }>
  apiBase: string
}>()

const isMounted = ref(false)
const albumsState = ref([...props.albums])
const photoErrors = ref<Record<string, boolean>>({})
const loadedPhotos = ref<Record<string, boolean>>({})

function getPhotoUrl(r2Key: string) {
  if (!r2Key) return ''
  if (r2Key.startsWith('http')) return r2Key
  return joinApiUrl(props.apiBase, `/api/files/${r2Key}`)
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

function openLightbox(photos: any[], index: number) {
  lightbox.photos = photos; lightbox.index = index; lightbox.open = true
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleKeydown)
  preloadImages()
}
function closeLightbox() {
  lightbox.open = false; document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKeydown)
}
function prevPhoto() { if (lightbox.index > 0) lightbox.index-- }
function nextPhoto() { if (lightbox.index < lightbox.photos.length - 1) lightbox.index++ }

// 预加载逻辑
function preloadImages() {
  const nextIdx = lightbox.index + 1
  const prevIdx = lightbox.index - 1
  if (nextIdx < lightbox.photos.length) {
    const img = new Image()
    img.src = getPhotoUrl(lightbox.photos[nextIdx].r2Key)
  }
  if (prevIdx >= 0) {
    const img = new Image()
    img.src = getPhotoUrl(lightbox.photos[prevIdx].r2Key)
  }
}

// 监听索引变化进行预加载
watch(() => lightbox.index, preloadImages)

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
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: var(--spacing-xl);
}

.tag-filter-btn {
  padding: 6px 16px;
  background: var(--color-surface-card, #fff);
  color: var(--color-muted);
  border: 1px solid var(--color-hairline);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-quart);
}

.tag-filter-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.tag-filter-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  box-shadow: 0 4px 12px rgba(204, 120, 92, 0.2);
}

.album-section { margin-bottom: var(--spacing-section); }
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
  gap: 4px;
  flex-wrap: wrap;
}
.album-tag-badge {
  font-size: 11px;
  background: var(--color-surface-cream-strong);
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: 10px;
}

.photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-sm); }
.photo-item { position: relative; aspect-ratio: 1; border-radius: var(--rounded-sm); overflow: hidden; cursor: pointer; transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart); }
.photo-item:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover); }
.photo-item img { width: 100%; height: 100%; object-fit: cover; }
.fade-in-img {
  opacity: 0;
  transition: opacity 0.5s ease-in-out;
}
.fade-in-img.img-loaded {
  opacity: 1;
}
.photo-caption { position: absolute; bottom: 0; left: 0; right: 0; padding: 6px 10px; background: linear-gradient(to top, rgba(0,0,0,0.5), transparent); color: var(--color-on-dark); font-size: var(--type-caption-size); opacity: 0; transition: opacity var(--duration-normal) var(--ease-out-quart); }
.photo-item:hover .photo-caption { opacity: 1; }

.frame-retro .photo-item { border: 6px solid #e8d5a8; box-shadow: 0 0 0 2px #b8903a; border-radius: 2px; }
.frame-film .photo-item { border: 5px solid #1c1c1c; box-shadow: inset 0 0 0 2px #2e2e2e; border-radius: 2px; }
.frame-polaroid .photo-item { border: 8px solid #fff; border-bottom: 32px solid #fff; box-shadow: 0 2px 14px rgba(0,0,0,0.12); border-radius: 1px; }

.lightbox { position: fixed; inset: 0; z-index: var(--z-lightbox, 200); background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center; }
.lightbox-close { position: absolute; top: 20px; right: 24px; color: rgba(240,210,150,0.6); font-size: 28px; background: none; border: none; cursor: pointer; transition: color var(--duration-fast) var(--ease-out-quart), transform var(--duration-fast) var(--ease-out-quart); }
.lightbox-close:hover { color: var(--color-on-dark); transform: rotate(90deg); }
.lightbox-img { max-width: 90vw; max-height: 85vh; border-radius: 2px; box-shadow: 0 10px 60px rgba(0,0,0,0.5); }
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

@media (max-width: 768px) { .photo-grid { grid-template-columns: repeat(2, 1fr); } }

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
