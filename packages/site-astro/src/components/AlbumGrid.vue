<template>
  <div>
    <div v-for="album in albums" :key="album.id" class="album-section">
      <h2 class="album-name title-lg">{{ album.title }}</h2>
      <p v-if="album.description" class="album-desc">{{ album.description }}</p>
      <div class="photo-grid" :class="'frame-' + album.frameStyle">
        <div v-for="(photo, i) in album.photos" :key="photo.id" class="photo-item" @click="openLightbox(album.photos, i)">
          <img :src="getPhotoUrl(photo.r2Key)" :alt="photo.caption" loading="lazy" decoding="async" style="aspect-ratio: 1" />
          <div v-if="photo.caption" class="photo-caption">{{ photo.caption }}</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="lightbox">
      <div v-if="lightbox.open" class="lightbox" @click.self="closeLightbox">
        <button class="lightbox-close" @click="closeLightbox"><IconClose :size="28" /></button>
        <button v-if="lightbox.index > 0" class="lightbox-nav prev" @click="prevPhoto"><IconChevronLeft :size="36" /></button>
        <img :src="getPhotoUrl(lightbox.photos[lightbox.index]?.r2Key)" class="lightbox-img" />
        <button v-if="lightbox.index < lightbox.photos.length - 1" class="lightbox-nav next" @click="nextPhoto"><IconChevronRight :size="36" /></button>
        <div class="lightbox-caption">{{ lightbox.photos[lightbox.index]?.caption }}</div>
        <div class="lightbox-counter">{{ lightbox.index + 1 }} / {{ lightbox.photos.length }}</div>
      </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { reactive, onUnmounted } from 'vue'
import IconClose from './icons/IconClose.astro'
import IconChevronLeft from './icons/IconChevronLeft.astro'
import IconChevronRight from './icons/IconChevronRight.astro'

const props = defineProps<{
  albums: Array<{
    id: string; title: string; description: string; frameStyle: string
    photos: Array<{ id: string; r2Key: string; caption: string }>
  }>
  apiBase: string
}>()

function getPhotoUrl(r2Key: string) {
  if (r2Key.startsWith('http')) return r2Key
  return `${props.apiBase}/api/files/${r2Key}`
}

const lightbox = reactive({ open: false, photos: [] as any[], index: 0 })

function openLightbox(photos: any[], index: number) {
  lightbox.photos = photos; lightbox.index = index; lightbox.open = true
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleKeydown)
}
function closeLightbox() {
  lightbox.open = false; document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKeydown)
}
function prevPhoto() { if (lightbox.index > 0) lightbox.index-- }
function nextPhoto() { if (lightbox.index < lightbox.photos.length - 1) lightbox.index++ }
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeLightbox()
  if (e.key === 'ArrowLeft') prevPhoto()
  if (e.key === 'ArrowRight') nextPhoto()
}
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.album-section { margin-bottom: var(--spacing-section); }
.album-name { margin-bottom: var(--spacing-xs); }
.album-desc { font-size: var(--type-body-sm-size); color: var(--color-muted); margin-bottom: var(--spacing-lg); }
.photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-sm); }
.photo-item { position: relative; aspect-ratio: 1; border-radius: var(--rounded-sm); overflow: hidden; cursor: pointer; transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart); }
.photo-item:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover); }
.photo-item img { width: 100%; height: 100%; object-fit: cover; }
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
/* ── Lightbox transitions ── */
.lightbox-enter-active { transition: opacity var(--duration-slow) var(--ease-out-quart); }
.lightbox-leave-active { transition: opacity var(--duration-normal) var(--ease-out-quart); }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }

@media (max-width: 768px) { .photo-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
