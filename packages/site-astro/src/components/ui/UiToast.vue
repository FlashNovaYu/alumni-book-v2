<template>
  <Teleport to="body">
    <div class="ui-toast__container" role="region" aria-live="polite" aria-label="通知">
      <TransitionGroup name="ui-toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['ui-toast', `ui-toast--${toast.type}`]"
          role="status"
        >
          <span class="ui-toast__icon" aria-hidden="true">
            <svg v-if="toast.type === 'success'" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.5" />
              <path d="M5 9L8 12L13 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg v-else-if="toast.type === 'error'" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.5" />
              <path d="M7 7L11 11M11 7L7 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <svg v-else-if="toast.type === 'warning'" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L16 15H2L9 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
              <path d="M9 7V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <circle cx="9" cy="13" r="0.5" fill="currentColor" />
            </svg>
            <svg v-else width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.5" />
              <path d="M9 5V9L11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </span>
          <span class="ui-toast__message">{{ toast.message }}</span>
          <button
            class="ui-toast__close"
            aria-label="关闭通知"
            @click="remove(toast.id)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
}

const toasts = ref<Toast[]>([])
let toastId = 0

function show(message: string, type: ToastType = 'default', duration = 4000) {
  const id = `toast-${++toastId}`
  const toast: Toast = { id, message, type, duration }
  toasts.value.push(toast)

  if (duration > 0) {
    setTimeout(() => remove(id), duration)
  }

  return id
}

function remove(id: string) {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index > -1) {
    toasts.value.splice(index, 1)
  }
}

function success(message: string, duration?: number) {
  return show(message, 'success', duration)
}

function error(message: string, duration?: number) {
  return show(message, 'error', duration)
}

function warning(message: string, duration?: number) {
  return show(message, 'warning', duration)
}

function info(message: string, duration?: number) {
  return show(message, 'info', duration)
}

function clear() {
  toasts.value = []
}

// Expose methods for programmatic use
defineExpose({
  show,
  success,
  error,
  warning,
  info,
  remove,
  clear,
})

// Auto-cleanup on unmount
onUnmounted(() => {
  clear()
})
</script>

<style scoped>
.ui-toast__container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  z-index: var(--z-toast);
  pointer-events: none;
}

.ui-toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  min-width: 280px;
  max-width: 420px;
}

.ui-toast__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ui-toast__message {
  flex: 1;
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
  line-height: var(--leading-normal);
}

.ui-toast__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out-expo);
  flex-shrink: 0;
}

.ui-toast__close:hover {
  color: var(--text-primary);
}

/* Types */
.ui-toast--success {
  border-left: 3px solid var(--success);
}

.ui-toast--success .ui-toast__icon {
  color: var(--success);
}

.ui-toast--error {
  border-left: 3px solid var(--error);
}

.ui-toast--error .ui-toast__icon {
  color: var(--error);
}

.ui-toast--warning {
  border-left: 3px solid var(--warning);
}

.ui-toast--warning .ui-toast__icon {
  color: var(--warning);
}

.ui-toast--info {
  border-left: 3px solid var(--info);
}

.ui-toast--info .ui-toast__icon {
  color: var(--info);
}

.ui-toast--default .ui-toast__icon {
  color: var(--text-muted);
}

/* Transitions */
.ui-toast-enter-active,
.ui-toast-leave-active {
  transition:
    transform var(--duration-normal) var(--ease-out-expo),
    opacity var(--duration-normal) var(--ease-out-expo);
}

.ui-toast-enter-from,
.ui-toast-leave-to {
  transform: translateX(40px);
  opacity: 0;
}

@media (max-width: 640px) {
  .ui-toast__container {
    left: var(--space-4);
    right: var(--space-4);
    bottom: var(--space-4);
  }

  .ui-toast {
    max-width: 100%;
    min-width: auto;
  }
}
</style>
