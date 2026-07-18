<template>
  <component
    :is="tag"
    :class="buttonClasses"
    :disabled="disabled || loading"
    :type="nativeType"
    v-bind="$attrs"
  >
    <span v-if="loading" class="ui-button__spinner" aria-hidden="true" />
    <slot v-else name="icon-left" />
    <span class="ui-button__text" :class="{ 'sr-only': iconOnly }">
      <slot />
    </span>
    <slot v-if="!loading" name="icon-right" />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

interface Props {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  iconOnly?: boolean
  tag?: string
  nativeType?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  iconOnly: false,
  tag: 'button',
  nativeType: 'button',
})

const buttonClasses = computed(() => [
  'ui-button',
  `ui-button--${props.variant}`,
  `ui-button--${props.size}`,
  {
    'ui-button--loading': props.loading,
    'ui-button--icon-only': props.iconOnly,
    'ui-button--disabled': props.disabled || props.loading,
  },
])
</script>

<style scoped>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-weight: var(--weight-medium);
  border: none;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo),
    transform var(--duration-fast) var(--ease-out-expo),
    box-shadow var(--duration-fast) var(--ease-out-expo);
}

.ui-button:active:not(:disabled) {
  transform: scale(0.97);
}

.ui-button:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

/* Sizes */
.ui-button--sm {
  height: 32px;
  padding: 0 var(--space-4);
  font-size: var(--type-body-sm);
  border-radius: var(--radius-sm);
}

.ui-button--md {
  height: 44px;
  padding: 0 var(--space-5);
  font-size: var(--type-body-md);
  border-radius: var(--radius-md);
}

.ui-button--lg {
  height: 52px;
  padding: 0 var(--space-6);
  font-size: var(--type-body-lg);
  border-radius: var(--radius-lg);
}

/* Icon only */
.ui-button--icon-only.ui-button--sm {
  width: 32px;
  padding: 0;
}

.ui-button--icon-only.ui-button--md {
  width: 44px;
  padding: 0;
}

.ui-button--icon-only.ui-button--lg {
  width: 52px;
  padding: 0;
}

/* Variants */
.ui-button--primary {
  background-color: var(--accent);
  color: var(--bg-raised);
  box-shadow: var(--shadow-sm);
}

.ui-button--primary:hover:not(:disabled) {
  background-color: var(--accent-active);
  box-shadow: var(--shadow-md);
}

.ui-button--secondary {
  background-color: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.ui-button--secondary:hover:not(:disabled) {
  background-color: var(--bg-soft);
  border-color: var(--border-strong);
}

.ui-button--danger {
  background-color: var(--error);
  color: var(--bg-raised);
}

.ui-button--danger:hover:not(:disabled) {
  background-color: #b03e3e;
}

.ui-button--ghost {
  background: transparent;
  color: var(--text-secondary);
}

.ui-button--ghost:hover:not(:disabled) {
  background-color: var(--accent-soft);
  color: var(--accent);
}

.ui-button--outline {
  background: transparent;
  color: var(--accent);
  border: 1.5px solid var(--accent);
}

.ui-button--outline:hover:not(:disabled) {
  background-color: var(--accent-soft);
}

/* Loading state */
.ui-button--loading {
  cursor: wait;
}

.ui-button__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* Disabled */
.ui-button--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
