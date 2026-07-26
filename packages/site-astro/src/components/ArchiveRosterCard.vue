<template>
  <a
    :href="card.hasPage ? card.href : '#'"
    class="roster-card"
    :data-student-identity-card="card.slug"
    @click="handleTransition"
    @pointerenter="handlePointerEnter($event, card.slug)"
    @pointerleave="onMouseLeave(card.slug)"
    @pointermove="onPointerMove($event, card.slug)"
    @pointerup="onPointerEnd($event, card.slug)"
    @pointercancel="onPointerEnd($event, card.slug)"
    @pointerdown="handlePointerDown"
    :style="getTiltStyles(card.slug, baseTransform)"
  >
    <div class="roster-card__inner">
      <div
        class="roster-card__transition-surface"
        :style="surfaceTransitionStyle"
        aria-hidden="true"
      />

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
        <div data-student-card-details class="roster-card__details" :style="detailsTransitionStyle">
          <p v-if="card.motto" class="roster-card__motto">{{ card.motto }}</p>
          <div v-if="card.tags?.length" class="roster-card__tags">
            <span v-for="tag in card.tags" :key="tag" class="roster-card__tag">{{ tag }}</span>
          </div>
          <div v-if="card.statusLabel" class="roster-card__status">{{ card.statusLabel }}</div>
        </div>
      </div>
      
      <!-- 光晕层完全封装在卡片内部并利用 overflow:hidden 绝不漏光 -->
      <div class="glare-layer" :style="{ opacity: getState(card.slug).isHovered || getState(card.slug).isOrientationActive ? 1 : 0 }"></div>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ArchiveClassmateCard } from '../utils/museumViewModels'
import { buildMediaSources } from '@alumni/shared'
import { useMouseTilt } from '../composables/useMouseTilt'
import { useAudioSynth } from '../composables/useAudioSynth'

const props = withDefaults(defineProps<{ 
  card: ArchiveClassmateCard; 
  apiBase: string;
  baseTransform?: string;
}>(), { baseTransform: '' })
const emit = defineEmits<{ 'identity-transition': [slug: string] }>()

const avatarError = ref(false)
const avatarImage = ref<HTMLImageElement | null>(null)
const isTransitioning = ref(false)

const { onPointerMove, onPointerEnd, onMouseEnter, onMouseLeave, getTiltStyles, getState } = useMouseTilt({ maxTilt: 6, scale: 1.02 })
const { playArchiveSlide } = useAudioSynth()
let lastTouchAt = 0

function handlePointerEnter(event: PointerEvent, slug: string) {
  onMouseEnter(slug)
  if (event.pointerType !== 'touch') playArchiveSlide()
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch') return
  const now = performance.now()
  if (now - lastTouchAt < 220) return
  lastTouchAt = now
  playArchiveSlide()
}

const avatarTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage || !props.card.hasStandardProfile) return undefined
  return {
    viewTransitionName: 'student-avatar-' + props.card.slug,
    viewTransitionClass: 'student-identity student-avatar',
  }
})

const nameTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage || !props.card.hasStandardProfile) return undefined
  return {
    viewTransitionName: 'student-name-' + props.card.slug,
    viewTransitionClass: 'student-identity student-name',
  }
})

const detailsTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage || !props.card.hasStandardProfile) return undefined
  return {
    viewTransitionName: 'student-card-details-' + props.card.slug,
    viewTransitionClass: 'student-card-details',
  }
})

const surfaceTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage || !props.card.hasStandardProfile) return undefined
  return {
    viewTransitionName: 'student-surface-' + props.card.slug,
    viewTransitionClass: 'student-surface',
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
  transform-style: preserve-3d;
  will-change: transform;
  /* Ensure a high z-index when hovered for 3d effect */
  position: relative;
  z-index: 1;
}

.roster-card:hover {
  z-index: 10;
}

.roster-card__inner {
  position: relative;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-skeuo-sm, var(--shadow-sm));
  transition:
    box-shadow var(--duration-normal) var(--ease-out-expo),
    border-color var(--duration-normal) var(--ease-out-expo);
  /* Absolute glare clip */
  overflow: hidden;
  height: 100%;
}

.roster-card__transition-surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--bg-surface);
  border-radius: inherit;
}

.roster-card__avatar,
.roster-card__body {
  position: relative;
  z-index: 1;
}

.roster-card:hover .roster-card__inner {
  box-shadow: var(--shadow-skeuo-lg, var(--shadow-card-hover));
  border-color: var(--border-strong);
}

.glare-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    circle 200px at var(--glare-x, 50%) var(--glare-y, 50%),
    rgba(255, 255, 255, 0.12) 0%,
    transparent 100%
  );
  mix-blend-mode: plus-lighter;
  transition: opacity 0.3s ease;
  z-index: 5;
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
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
    grid-template-columns: 60px minmax(0, 1fr);
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
