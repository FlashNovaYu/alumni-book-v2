<template>
  <a
    :href="card.hasPage ? card.href : '#'"
    class="roster-card"
    :data-student-identity-card="card.slug"
    data-audio-hover
    @click="handleTransition"
    @pointerenter="handlePointerEnter($event, card.slug)"
    @pointerleave="onMouseLeave(card.slug)"
    @pointermove="onPointerMove($event, card.slug)"
    @pointerup="onPointerEnd($event, card.slug)"
    @pointercancel="onPointerEnd($event, card.slug)"
    @pointerdown="handlePointerDown"
    :style="getTiltStyles(card.slug)"
  >
    <div class="roster-card__inner">
      <div
        class="roster-card__transition-surface"
        :style="surfaceTransitionStyle"
        aria-hidden="true"
      />
      <span class="roster-card__punch" aria-hidden="true" />
      <span class="roster-card__archive-id">{{ archiveId }}</span>

      <div class="roster-card__seal" :class="'roster-card__avatar'" :style="avatarTransitionStyle">
        <img
          v-if="card.avatarUrl && !avatarError"
          ref="avatarImage"
          :src="avatarMedia.src"
          :srcset="avatarMedia.srcset || undefined"
          :sizes="avatarMedia.sizes"
          :alt="card.name"
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
          @error="markAvatarError"
        />
        <span v-else class="roster-card__avatar-fallback">{{ card.name.charAt(0) }}</span>
        <div v-if="card.avatarUrl && !avatarError" class="roster-card__avatar-glow" aria-hidden="true" />
      </div>

      <span class="roster-card__rule" aria-hidden="true" />
      <div class="roster-card__body">
        <div class="roster-card__name" :style="nameTransitionStyle">{{ card.name }}</div>
        <div v-if="card.statusLabel" class="roster-card__meta">
          <span class="roster-card__status">{{ card.statusLabel }}</span>
        </div>
        <div data-student-card-details class="roster-card__details" :style="detailsTransitionStyle">
          <p v-if="card.motto" class="roster-card__motto">{{ card.motto }}</p>
          <div v-if="card.tags?.length" class="roster-card__tags">
            <span class="roster-card__tag">{{ card.tags[0] }}</span>
          </div>
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

const props = defineProps<{
  card: ArchiveClassmateCard; 
  apiBase: string;
  archiveId: string;
}>()
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
const avatarMedia = computed(() => buildMediaSources(avatarSrc.value, props.card.avatarMedia?.variants, 256, 256))
</script>

<style scoped>
.roster-card {
  display: block;
  aspect-ratio: 1 / 1;
  min-width: 0;
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
  grid-template-rows: auto 1px minmax(0, 1fr);
  justify-items: center;
  gap: clamp(9px, 3.5%, var(--space-3));
  height: 100%;
  padding: clamp(28px, 9%, 42px) clamp(var(--space-3), 6%, var(--space-5)) clamp(var(--space-3), 6%, var(--space-5));
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--surface-raised) 48%, transparent), transparent 52%),
    color-mix(in srgb, var(--bg-surface) 94%, var(--surface-raised));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-skeuo-sm, var(--shadow-sm));
  transition:
    box-shadow var(--duration-normal) var(--ease-out-expo),
    border-color var(--duration-normal) var(--ease-out-expo);
  /* Absolute glare clip */
  overflow: hidden;
}

.roster-card__transition-surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--bg-surface);
  border-radius: inherit;
}

.roster-card__seal,
.roster-card__body {
  position: relative;
  z-index: 1;
}

.roster-card__punch {
  position: absolute;
  top: clamp(12px, 5%, 18px);
  left: 50%;
  z-index: 3;
  width: 8px;
  aspect-ratio: 1;
  border-radius: 50%;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--text-primary) 36%, var(--bg));
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.24), 0 1px 0 color-mix(in srgb, var(--surface-raised) 52%, transparent);
}

.roster-card__meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 16px;
}

.roster-card__archive-id {
  position: absolute;
  z-index: 3;
  top: clamp(11px, 5%, 18px);
  right: clamp(11px, 5%, 18px);
  color: var(--text-muted);
  font-size: var(--type-caption-uppercase);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-widest);
  line-height: var(--leading-tight);
}

.roster-card:hover .roster-card__inner {
  box-shadow: var(--shadow-skeuo-lg, var(--shadow-card-hover));
  border-color: var(--border-strong);
}

.roster-card__rule {
  position: relative;
  z-index: 1;
  display: block;
  width: 62%;
  background: linear-gradient(90deg, transparent, var(--border-strong) 10% 90%, transparent);
}

.glare-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    circle 200px at var(--glare-x, 50%) var(--glare-y, 50%),
    color-mix(in srgb, var(--surface-paper) 12%, transparent) 0%,
    transparent 100%
  );
  mix-blend-mode: plus-lighter;
  transition: opacity 0.3s ease;
  z-index: 5;
}

/* 档案圆章：头像仅作为索引标记，不占据整张卡片。 */
.roster-card__seal {
  position: relative;
  width: clamp(56px, 29%, 90px);
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 35% 28%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 48%),
    linear-gradient(135deg, var(--bg-soft), var(--bg-raised));
  color: var(--text-primary);
  border: 1px solid var(--border);
  font-family: var(--font-display);
  font-size: clamp(26px, 7vw, 40px);
  font-weight: var(--weight-semibold);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--bg-surface) 62%, transparent), 0 0 0 5px var(--border);
}

.roster-card__seal img {
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
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle, var(--accent-soft) 0%, transparent 70%);
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out-expo);
  pointer-events: none;
  z-index: 1;
}

.roster-card:hover .roster-card__avatar-glow {
  opacity: 1;
}

/* Body */
.roster-card__body {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(3px, 2%, var(--space-2));
  text-align: center;
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
  max-width: 24ch;
}

.roster-card__tags {
  display: flex;
  justify-content: center;
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
  color: var(--accent);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  text-align: center;
}

@media (max-width: 768px) {
  .roster-card__inner {
    padding: clamp(var(--space-3), 5%, var(--space-4));
  }

  .roster-card__name {
    font-size: var(--type-body-lg);
  }
}
</style>
