<template>
  <div class="photo-wall">
    <div
      v-for="(photo, idx) in photos"
      :key="photoKey(photo)"
      class="photo-item"
      :style="{ '--photo-index': idx }"
      @click="openLightbox(idx)"
    >
      <img
        v-if="!photoErrors[photoKey(photo)]"
        :src="photoMedia(photo).src"
        :srcset="photoMedia(photo).srcset || undefined"
        :sizes="photoMedia(photo).sizes"
        alt=""
        loading="lazy"
        decoding="async"
        style="aspect-ratio: 1"
        @error="photoErrors[photoKey(photo)] = true"
      />
      <div v-else class="photo-error-placeholder">⚠️ 图片加载失败</div>
    </div>

    <!-- 灯箱大图预览 -->
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
            <img
              v-if="!lightboxErrors[lightbox.index]"
              :src="photoUrl(photos[lightbox.index])"
              class="lightbox-img"
              @error="lightboxErrors[lightbox.index] = true"
            />
            <div v-else class="lightbox-error-placeholder">⚠️ 无法加载大图</div>
          </div>

          <button v-if="lightbox.index < photos.length - 1" class="lightbox-nav next" @click="nextPhoto">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <div class="lightbox-counter">{{ lightbox.index + 1 }} / {{ photos.length }}</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, reactive, watch } from 'vue'
import { joinApiUrl } from '../utils/apiBase'
import { buildMediaSources, type MediaVariant } from '@alumni/shared'

type PhotoInput = string | {
  r2Key?: string
  url?: string
  key?: string
  media?: { variants?: MediaVariant[] } | null
  variants?: MediaVariant[] | null
  width?: number
  height?: number
}
const props = defineProps<{ photos: PhotoInput[]; apiBase: string }>()

const isMounted = ref(false)
const photoErrors = ref<Record<string, boolean>>({})
const lightboxErrors = ref<Record<number, boolean>>({})

const lightbox = reactive({
  open: false,
  index: 0
})

function photoKey(p: PhotoInput) {
  if (typeof p === 'string') return p
  return String(p.r2Key || p.url || p.key || '')
}
function photoUrl(p: PhotoInput) {
  const value = photoKey(p)
  if (!value) return ''
  if (value.startsWith('http')) return value
  if (value.startsWith('/api/files/')) return joinApiUrl(props.apiBase, value)
  return joinApiUrl(props.apiBase, `/api/files/${value.replace(/^\/+/, '')}`)
}
function photoMedia(p: PhotoInput) {
  const variants = typeof p === 'string' ? undefined : (p.media?.variants || p.variants || undefined)
  return buildMediaSources(photoUrl(p), variants, typeof p === 'string' ? 320 : (p.width || 320), typeof p === 'string' ? 320 : (p.height || 320))
}

function openLightbox(index: number) {
  lightbox.index = index
  lightbox.open = true
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleKeydown)
  preloadImages()
}

function closeLightbox() {
  lightbox.open = false
  document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKeydown)
}

function prevPhoto() {
  if (lightbox.index > 0) lightbox.index--
}

function nextPhoto() {
  if (lightbox.index < props.photos.length - 1) lightbox.index++
}

function preloadImages() {
  const nextIdx = lightbox.index + 1
  const prevIdx = lightbox.index - 1
  if (nextIdx < props.photos.length) {
    const img = new Image()
    img.src = photoUrl(props.photos[nextIdx])
  }
  if (prevIdx >= 0) {
    const img = new Image()
    img.src = photoUrl(props.photos[prevIdx])
  }
}

watch(() => lightbox.index, preloadImages)

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeLightbox()
  if (e.key === 'ArrowLeft') prevPhoto()
  if (e.key === 'ArrowRight') nextPhoto()
}

onMounted(() => { isMounted.value = true })

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.photo-wall {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
}

.photo-item {
  aspect-ratio: 1;
  border: 6px solid var(--color-paper-card);
  border-radius: var(--rounded-sm);
  background: var(--color-paper-card-muted);
  box-shadow: var(--shadow-paper-card);
  overflow: hidden;
  cursor: pointer;
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
  position: relative;
  animation: photo-item-enter 450ms var(--ease-out-quart) both;
  animation-delay: min(calc(var(--photo-index) * 80ms), 480ms);
}

@keyframes photo-item-enter {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .photo-item { animation: none; }
}

.photo-item:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card-hover);
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 768px) {
  .photo-wall {
    grid-template-columns: repeat(2, 1fr);
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

/* 灯箱大图样式 */
.lightbox { position: fixed; inset: 0; z-index: var(--z-lightbox, 200); background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center; }
.lightbox-close { position: absolute; top: 20px; right: 24px; color: rgba(240,210,150,0.6); font-size: 28px; background: none; border: none; cursor: pointer; transition: color var(--duration-fast) var(--ease-out-quart), transform var(--duration-fast) var(--ease-out-quart); z-index: 10; }
.lightbox-close:hover { color: var(--color-on-dark); transform: rotate(90deg); }
.lightbox-content { display: flex; align-items: center; justify-content: center; max-width: 90vw; max-height: 85vh; }
.lightbox-img { max-width: 100%; max-height: 85vh; border-radius: 2px; box-shadow: 0 10px 60px rgba(0,0,0,0.5); object-fit: contain; }
.lightbox-error-placeholder {
  width: 320px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c62828;
  background: rgba(255,255,255,0.08);
  border-radius: var(--rounded-md);
  border: 1px dashed rgba(255,255,255,0.2);
  font-size: 14px;
}
.lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); color: rgba(240,210,150,0.5); font-size: 36px; background: rgba(0,0,0,0.3); border: none; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart), transform var(--duration-fast) var(--ease-out-quart); z-index: 10; }
.lightbox-nav:hover { background: rgba(0,0,0,0.6); color: var(--color-on-dark); }
.lightbox-nav.prev:hover { transform: translateY(-50%) translateX(-2px); }
.lightbox-nav.next:hover { transform: translateY(-50%) translateX(2px); }
.lightbox-nav.prev { left: 16px; }
.lightbox-nav.next { right: 16px; }
.lightbox-counter { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); color: rgba(240,210,150,0.4); font-size: var(--type-caption-size); z-index: 10; }

/* Lightbox transitions */
.lightbox-enter-active { transition: opacity var(--duration-slow) var(--ease-out-quart); }
.lightbox-leave-active { transition: opacity var(--duration-normal) var(--ease-out-quart); }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }
</style>
