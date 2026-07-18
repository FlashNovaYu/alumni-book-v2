<template>
  <Teleport to="body">
    <Transition name="ui-modal">
      <div
        v-if="modelValue"
        class="ui-modal__overlay"
        role="dialog"
        :aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="handleOverlayClick"
      >
        <div
          class="ui-modal"
          :class="[`ui-modal--${size}`, { 'ui-modal--no-padding': noPadding }]"
          role="document"
        >
          <!-- Header -->
          <div v-if="title || $slots.header || showClose" class="ui-modal__header">
            <slot name="header">
              <h2 :id="titleId" class="ui-modal__title">{{ title }}</h2>
            </slot>
            <button
              v-if="showClose"
              class="ui-modal__close"
              aria-label="关闭"
              @click="close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="ui-modal__body">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer || showActions" class="ui-modal__footer">
            <slot name="footer">
              <UiButton
                v-if="cancelText"
                variant="ghost"
                @click="handleCancel"
              >
                {{ cancelText }}
              </UiButton>
              <UiButton
                v-if="confirmText"
                :variant="danger ? 'danger' : 'primary'"
                :loading="confirmLoading"
                @click="handleConfirm"
              >
                {{ confirmText }}
              </UiButton>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import UiButton from './UiButton.vue'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

interface Props {
  modelValue: boolean
  title?: string
  size?: ModalSize
  showClose?: boolean
  showActions?: boolean
  cancelText?: string
  confirmText?: string
  confirmLoading?: boolean
  danger?: boolean
  noPadding?: boolean
  closeOnOverlay?: boolean
  closeOnEsc?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showClose: true,
  showActions: false,
  cancelText: '取消',
  confirmText: '确认',
  confirmLoading: false,
  danger: false,
  noPadding: false,
  closeOnOverlay: true,
  closeOnEsc: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': []
  'cancel': []
  'close': []
}>()

const titleId = computed(() => `ui-modal-title-${Math.random().toString(36).slice(2, 9)}`)

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function handleOverlayClick() {
  if (props.closeOnOverlay) {
    close()
  }
}

function handleCancel() {
  emit('cancel')
  close()
}

function handleConfirm() {
  emit('confirm')
}

// ESC key handler
watch(() => props.modelValue, (visible) => {
  if (visible && props.closeOnEsc) {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        document.removeEventListener('keydown', handler)
      }
    }
    document.addEventListener('keydown', handler)
  }
})
</script>

<style scoped>
.ui-modal__overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(28, 25, 23, 0.5);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal);
  overflow-y: auto;
}

.ui-modal {
  position: relative;
  width: 100%;
  max-height: calc(100vh - var(--space-10));
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Sizes */
.ui-modal--sm { max-width: 400px; }
.ui-modal--md { max-width: 560px; }
.ui-modal--lg { max-width: 720px; }
.ui-modal--xl { max-width: 960px; }
.ui-modal--full { max-width: calc(100vw - var(--space-10)); max-height: calc(100vh - var(--space-10)); }

.ui-modal--no-padding .ui-modal__body {
  padding: 0;
}

.ui-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5) 0;
}

.ui-modal__title {
  font-size: var(--type-title-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
  margin: 0;
}

.ui-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo);
  flex-shrink: 0;
}

.ui-modal__close:hover {
  background: var(--bg-soft);
  color: var(--text-primary);
}

.ui-modal__body {
  padding: var(--space-5);
  overflow-y: auto;
  flex: 1;
}

.ui-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border);
}

/* Transitions */
.ui-modal-enter-active,
.ui-modal-leave-active {
  transition: opacity var(--duration-normal) var(--ease-out-expo);
}

.ui-modal-enter-active .ui-modal,
.ui-modal-leave-active .ui-modal {
  transition:
    transform var(--duration-normal) var(--ease-out-expo),
    opacity var(--duration-normal) var(--ease-out-expo);
}

.ui-modal-enter-from,
.ui-modal-leave-to {
  opacity: 0;
}

.ui-modal-enter-from .ui-modal,
.ui-modal-leave-to .ui-modal {
  transform: translateY(16px) scale(0.98);
  opacity: 0;
}

@media (max-width: 640px) {
  .ui-modal__overlay {
    padding: 0;
    align-items: flex-end;
  }

  .ui-modal {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    max-height: calc(100vh - var(--space-6));
  }

  .ui-modal--sm,
  .ui-modal--md,
  .ui-modal--lg,
  .ui-modal--xl {
    max-width: 100%;
  }
}
</style>
