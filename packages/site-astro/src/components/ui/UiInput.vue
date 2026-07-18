<template>
  <div class="ui-input__wrapper">
    <label v-if="label" :for="inputId" class="ui-input__label">
      {{ label }}
      <span v-if="required" class="ui-input__required" aria-hidden="true">*</span>
    </label>
    <component
      :is="multiline ? 'textarea' : 'input'"
      :id="inputId"
      :class="inputClasses"
      :value="modelValue"
      :type="nativeType"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :rows="multiline ? rows : undefined"
      v-bind="$attrs"
      @input="handleInput"
      @blur="handleBlur"
      @focus="handleFocus"
    />
    <div v-if="hint || error" class="ui-input__meta">
      <span v-if="error" class="ui-input__error" role="alert">
        {{ error }}
      </span>
      <span v-else-if="hint" class="ui-input__hint">
        {{ hint }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue?: string | number
  label?: string
  placeholder?: string
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search'
  multiline?: boolean
  rows?: number
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  error?: string
  hint?: string
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
  multiline: false,
  rows: 4,
  disabled: false,
  readonly: false,
  required: false,
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'blur': [event: FocusEvent]
  'focus': [event: FocusEvent]
}>()

const inputId = computed(() => `ui-input-${Math.random().toString(36).slice(2, 9)}`)

const nativeType = computed(() => {
  if (props.multiline) return undefined
  return props.type
})

const inputClasses = computed(() => [
  'ui-input',
  `ui-input--${props.size}`,
  {
    'ui-input--error': !!props.error,
    'ui-input--disabled': props.disabled,
    'ui-input--multiline': props.multiline,
  },
])

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

function handleBlur(event: FocusEvent) {
  emit('blur', event)
}

function handleFocus(event: FocusEvent) {
  emit('focus', event)
}
</script>

<style scoped>
.ui-input__wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ui-input__label {
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  color: var(--text-secondary);
  line-height: var(--leading-normal);
}

.ui-input__required {
  color: var(--error);
  margin-left: var(--space-1);
}

.ui-input {
  width: 100%;
  font-family: var(--font-body);
  font-size: var(--type-body-lg);
  font-weight: var(--weight-regular);
  color: var(--text-primary);
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  outline: none;
  transition:
    border-color var(--duration-fast) var(--ease-out-expo),
    box-shadow var(--duration-fast) var(--ease-out-expo);
  resize: vertical;
}

.ui-input::placeholder {
  color: var(--text-dim);
}

.ui-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.ui-input:disabled {
  background-color: var(--bg-soft);
  color: var(--text-dim);
  cursor: not-allowed;
}

/* Sizes */
.ui-input--sm {
  height: 36px;
  padding: 0 var(--space-3);
  font-size: var(--type-body-sm);
  border-radius: var(--radius-sm);
}

.ui-input--md {
  height: 44px;
  padding: 0 var(--space-4);
  font-size: var(--type-body-md);
  border-radius: var(--radius-md);
}

.ui-input--lg {
  height: 52px;
  padding: 0 var(--space-5);
  font-size: var(--type-body-lg);
  border-radius: var(--radius-lg);
}

.ui-input--multiline {
  height: auto;
  min-height: 100px;
  padding: var(--space-3) var(--space-4);
  line-height: var(--leading-normal);
}

/* Error state */
.ui-input--error {
  border-color: var(--error);
}

.ui-input--error:focus {
  box-shadow: 0 0 0 3px rgba(198, 69, 69, 0.12);
}

.ui-input__meta {
  min-height: 18px;
}

.ui-input__error {
  font-size: var(--type-caption);
  color: var(--error);
  line-height: var(--leading-normal);
}

.ui-input__hint {
  font-size: var(--type-caption);
  color: var(--text-muted);
  line-height: var(--leading-normal);
}
</style>
