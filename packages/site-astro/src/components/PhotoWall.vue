<template>
  <div class="photo-wall">
    <div v-for="photo in photos" :key="photo" class="photo-item">
      <img :src="photoUrl(photo)" alt="" loading="lazy" decoding="async" style="aspect-ratio: 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

const props = defineProps<{ photos: string[] }>()
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
function photoUrl(p: string) {
  if (p.startsWith('http')) return p
  return `${API_BASE}${p}`
}

onMounted(() => {
  import('gsap/ScrollTrigger').then(() => {
    import('gsap').then(({ default: gsap }) => {
      gsap.fromTo('.photo-item', { autoAlpha: 0, y: 24 },
        {
          autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.45, ease: 'back.out(1.4)',
          scrollTrigger: { trigger: '.photo-wall', start: 'top 85%', once: true },
        }
      )
    })
  })
})
</script>

<style scoped>
.photo-wall { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-sm); }
.photo-item { aspect-ratio: 1; border-radius: var(--rounded-sm); overflow: hidden; cursor: pointer; transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart); }
.photo-item:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover); }
.photo-item img { width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 768px) { .photo-wall { grid-template-columns: repeat(2, 1fr); } }
</style>
