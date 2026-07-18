<template>
  <a
    :href="card.hasPage ? card.href : '#'"
    class="roster-card"
    :data-student-identity-card="card.slug"
    @click="handleTransition"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @mousemove="handleMouseMove"
  >
    <div class="roster-card__inner" :style="tiltStyle">
      <!-- 头像 -->
      <div class="roster-card__avatar" :style="avatarTransitionStyle">
        <img
          v-if="card.avatarUrl && !avatarError"
          ref="avatarImage"
          :src="avatarMedia.src"
          :srcset="avatarMedia.srcset || undefined"
          :sizes="avatarMedia.sizes"
          :alt="card.name"
          width="72"
          height="72"
          loading="lazy"
          decoding="async"
          @error="markAvatarError"
        />
        <span v-else class="roster-card__avatar-fallback">{{ card.name.charAt(0) }}</span>
        <!-- 照片 glow 效果 -->
        <div v-if="card.avatarUrl && !avatarError" class="roster-card__avatar-glow" aria-hidden="true" />
      </div>

      <!-- 内容 -->
      <div class="roster-card__body">
        <div class="roster-card__name" :style="nameTransitionStyle">{{ card.name }}</div>
        <p v-if="card.motto" class="roster-card__motto">{{ card.motto }}</p>
        <div v-if="card.tags?.length" class="roster-card__tags">
          <span v-for="tag in card.tags" :key="tag" class="roster-card__tag">{{ tag }}</span>
        </div>
        <div v-if="card.statusLabel" class="roster-card__status">{{ card.statusLabel }}</div>
      </div>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ArchiveClassmateCard } from '../utils/museumViewModels'
import { buildMediaSources } from '@alumni/shared'

const props = defineProps<{ card: ArchiveClassmateCard; apiBase: string }>()
const emit = defineEmits<{ 'identity-transition': [slug: string] }>()

const avatarError = ref(false)
const avatarImage = ref<HTMLImageElement | null>(null)
const isTransitioning = ref(false)

// 3D Tilt 效果
const tiltX = ref(0)
const tiltY = ref(0)
const isHovered = ref(false)

const tiltStyle = computed(() => {
  if (!isHovered.value) {
    return {
      transform: 'perspective(800px) rotateX(0deg) rotateY(0deg)',
      transition: 'transform 0.3s var(--ease-out-expo)',
    }
  }
  return {
    transform: `perspective(800px) rotateX(${tiltY.value}deg) rotateY(${tiltX.value}deg)`,
    transition: 'transform 0.1s ease-out',
  }
})

function handleMouseEnter() {
  isHovered.value = true
}

function handleMouseLeave() {
  isHovered.value = false
  tiltX.value = 0
  tiltY.value = 0
}

function handleMouseMove(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  tiltX.value = x * 16  // max ±8°
  tiltY.value = -y * 16
}

const avatarTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage || !props.card.hasStandardProfile) return undefined
  return {
    viewTransitionName: 'student-avatar-' + props.card.slug,
    viewTransitionClass: 'student-avatar',
  }
})

const nameTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage || !props.card.hasStandardProfile) return undefined
  return {
    viewTransitionName: 'student-name-' + props.card.slug,
    viewTransitionClass: 'student-name',
  }
})

function handleTransition() {
  if (props.card.hasPage && props.card.hasStandardProfile) {
    isTransitioning.value = true
    emit('identity-transition', props.card.slug)
  }
}

function markAvatarError() {
  avatarError.value = true
}

function checkAvatarImage() {
  if (avatarImage.value?.complete && avatarImage.value.naturalWidth === 0) {
    markAvatarError()
  }
}

watch(() => props.card.avatarUrl, async () => {
  avatarError.value = false
  await nextTick()
  checkAvatarImage()
})

onMounted(() => {
  checkAvatarImage()
})

const avatarSrc = computed(() => {
  if (!props.card.avatarUrl) return ''
  if (props.card.avatarUrl.startsWith('http')) return props.card.avatarUrl
  return `${props.apiBase}${props.card.avatarUrl}`
})
const avatarMedia = computed(() => buildMediaSources(avatarSrc.value, props.card.avatarMedia?.variants, 72, 72))
</script>

<style scoped>
.roster-card {
  display: block;
  text-decoration: none;
  perspective: 800px;
}

.roster-card__inner {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--duration-normal) var(--ease-out-expo),
    border-color var(--duration-normal) var(--ease-out-expo);
  will-change: transform;
}

.roster-card:hover .roster-card__inner {
  box-shadow: var(--shadow-card-hover);
  border-color: var(--border-strong);
}

/* Avatar */
.roster-card__avatar {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--bg-soft), var(--bg-raised));
  color: var(--text-primary);
  border: 1px solid var(--border);
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: var(--weight-semibold);
  flex-shrink: 0;
}

.roster-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.roster-card__avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--bg-soft), var(--bg-raised));
}

/* Avatar glow for photos */
.roster-card__avatar-glow {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-soft) 0%, transparent 70%);
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out-expo);
  pointer-events: none;
  z-index: -1;
}

.roster-card:hover .roster-card__avatar-glow {
  opacity: 1;
}

/* Body */
.roster-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.roster-card__name {
  font-size: var(--type-title-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
}

.roster-card__motto {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--type-body-sm);
  line-height: var(--leading-normal);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.roster-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.roster-card__tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  transition: background-color var(--duration-fast) var(--ease-out-expo);
}

.roster-card:hover .roster-card__tag {
  background: var(--accent-soft);
  color: var(--accent);
}

.roster-card__status {
  font-size: var(--type-caption);
  color: var(--error);
  font-weight: var(--weight-medium);
  min-height: 18px;
}

@media (max-width: 768px) {
  .roster-card__inner {
    padding: var(--space-4);
    gap: var(--space-3);
  }

  .roster-card__avatar {
    width: 60px;
    height: 60px;
    font-size: 24px;
  }
}
</style>
