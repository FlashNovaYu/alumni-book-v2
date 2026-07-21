<template>
  <Teleport to="body">
    <div
      ref="dialogRef"
      class="crop-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
      tabindex="-1"
      @click.self="requestCancel"
      @keydown="handleKeydown"
    >
      <div class="crop-panel">
        <header class="crop-header">
          <div>
            <h2 id="avatar-crop-title">调整头像</h2>
            <p>拖动照片调整位置，圆形范围内将作为头像</p>
          </div>
          <button type="button" class="crop-close" aria-label="取消头像裁切" :disabled="busy" @click="requestCancel">×</button>
        </header>

        <div
          ref="viewportRef"
          class="crop-viewport"
          @pointerdown="startDrag"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @wheel.prevent="handleWheel"
        >
          <img :src="src" alt="待裁切头像预览" draggable="false" :style="imageStyle" />
          <div class="crop-circle" aria-hidden="true" />
        </div>

        <label class="zoom-control">
          <span>缩放</span>
          <input
            v-model.number="zoom"
            type="range"
            min="1"
            max="3"
            step="0.01"
            aria-label="头像缩放比例"
            :disabled="busy"
          />
        </label>

        <p v-if="error" class="crop-error" role="alert">{{ error }}</p>

        <div class="crop-actions">
          <button type="button" class="btn-secondary" :disabled="busy" @click="requestCancel">取消</button>
          <button type="button" class="btn-primary" :disabled="busy" @click="confirmCrop">
            {{ busy ? '上传中…' : '确认并上传' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SquareCrop } from '@alumni/shared'

const props = defineProps<{
  src: string
  naturalWidth: number
  naturalHeight: number
  busy?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  confirm: [crop: SquareCrop]
  cancel: []
}>()

const dialogRef = ref<HTMLElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const viewportSize = ref(280)
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
let drag: { pointerId: number; clientX: number; clientY: number; offsetX: number; offsetY: number } | null = null

const baseScale = computed(() => Math.max(
  viewportSize.value / props.naturalWidth,
  viewportSize.value / props.naturalHeight,
))
const imageScale = computed(() => baseScale.value * zoom.value)
const renderedWidth = computed(() => props.naturalWidth * imageScale.value)
const renderedHeight = computed(() => props.naturalHeight * imageScale.value)

const imageStyle = computed(() => ({
  width: `${renderedWidth.value}px`,
  height: `${renderedHeight.value}px`,
  transform: `translate(calc(-50% + ${offsetX.value}px), calc(-50% + ${offsetY.value}px))`,
}))

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function clampOffsets() {
  const maxX = Math.max(0, (renderedWidth.value - viewportSize.value) / 2)
  const maxY = Math.max(0, (renderedHeight.value - viewportSize.value) / 2)
  offsetX.value = clamp(offsetX.value, -maxX, maxX)
  offsetY.value = clamp(offsetY.value, -maxY, maxY)
}

function syncViewportSize() {
  const size = viewportRef.value?.clientWidth
  if (size && size > 0) viewportSize.value = size
  clampOffsets()
}

function startDrag(event: PointerEvent) {
  if (props.busy) return
  drag = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  }
  viewportRef.value?.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  offsetX.value = drag.offsetX + event.clientX - drag.clientX
  offsetY.value = drag.offsetY + event.clientY - drag.clientY
  clampOffsets()
}

function endDrag(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  if (viewportRef.value?.hasPointerCapture(event.pointerId)) {
    viewportRef.value.releasePointerCapture(event.pointerId)
  }
  drag = null
}

function handleWheel(event: WheelEvent) {
  if (props.busy) return
  zoom.value = clamp(zoom.value + (event.deltaY > 0 ? -0.08 : 0.08), 1, 3)
}

function confirmCrop() {
  const scale = imageScale.value
  const size = viewportSize.value / scale
  const x = (renderedWidth.value / 2 - viewportSize.value / 2 - offsetX.value) / scale
  const y = (renderedHeight.value / 2 - viewportSize.value / 2 - offsetY.value) / scale
  emit('confirm', { x, y, size })
}

function requestCancel() {
  if (!props.busy) emit('cancel')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') requestCancel()
}

watch(zoom, clampOffsets)

onMounted(async () => {
  await nextTick()
  syncViewportSize()
  window.addEventListener('resize', syncViewportSize)
  dialogRef.value?.focus()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportSize)
  drag = null
})
</script>

<style scoped>
.crop-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal, 300) + 10);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 25, 23, 0.72);
}

.crop-panel {
  width: min(100%, 420px);
  padding: 22px;
  border-radius: var(--rounded-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-elevated, 0 18px 60px rgba(0, 0, 0, 0.28));
}

.crop-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.crop-header h2 {
  margin: 0;
  color: var(--color-paper-brown);
  font-size: 18px;
}

.crop-header p {
  margin: 5px 0 0;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.5;
}

.crop-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: var(--color-surface-cream-strong);
  color: var(--color-muted);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.crop-viewport {
  position: relative;
  width: min(280px, calc(100vw - 84px));
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  border-radius: var(--rounded-md);
  background: #201d1a;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.crop-viewport:active { cursor: grabbing; }

.crop-viewport img {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  pointer-events: none;
  user-select: none;
}

.crop-circle {
  position: absolute;
  inset: 0;
  border: 3px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow: 0 0 0 999px rgba(16, 14, 12, 0.54);
  pointer-events: none;
}

.zoom-control {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  color: var(--color-muted);
  font-size: 13px;
}

.zoom-control input { width: 100%; accent-color: var(--color-primary); }

.crop-error {
  margin: 12px 0 0;
  color: var(--color-error);
  font-size: 13px;
  line-height: 1.45;
}

.crop-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.crop-actions button:disabled,
.crop-close:disabled {
  cursor: wait;
  opacity: 0.55;
}

@media (max-width: 480px) {
  .crop-overlay { align-items: flex-end; padding: 0; }
  .crop-panel { border-radius: var(--rounded-lg) var(--rounded-lg) 0 0; padding: 20px 20px calc(20px + env(safe-area-inset-bottom)); }
}
</style>
