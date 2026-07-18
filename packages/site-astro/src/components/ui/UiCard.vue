<template>
  <div
    :class="cardClasses"
    v-bind="$attrs"
  >
    <div v-if="$slots.header || title" class="ui-card__header">
      <slot name="header">
        <h3 v-if="title" class="ui-card__title">{{ title }}</h3>
        <p v-if="subtitle" class="ui-card__subtitle">{{ subtitle }}</p>
      </slot>
    </div>
    <div class="ui-card__body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="ui-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type CardVariant = 'default' | 'elevated' | 'ghost' | 'outlined'

interface Props {
  variant?: CardVariant
  title?: string
  subtitle?: string
  hover?: boolean
  padding?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  hover: true,
  padding: 'md',
})

const cardClasses = computed(() => [
  'ui-card',
  `ui-card--${props.variant}`,
  `ui-card--padding-${props.padding}`,
  {
    'ui-card--hover': props.hover,
  },
])
</script>

<style scoped>
.ui-card {
  border-radius: var(--radius-lg);
  transition:
    transform var(--duration-normal) var(--ease-out-expo),
    box-shadow var(--duration-normal) var(--ease-out-expo),
    border-color var(--duration-normal) var(--ease-out-expo);
}

.ui-card--default {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.ui-card--elevated {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
}

.ui-card--ghost {
  background: transparent;
  border: 1px solid var(--border);
}

.ui-card--outlined {
  background: transparent;
  border: 1.5px solid var(--border-strong);
}

.ui-card--hover:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-card-hover);
}

.ui-card--padding-sm {
  padding: var(--space-4);
}

.ui-card--padding-md {
  padding: var(--space-5);
}

.ui-card--padding-lg {
  padding: var(--space-6);
}

.ui-card__header {
  margin-bottom: var(--space-4);
}

.ui-card__title {
  font-size: var(--type-title-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
  margin: 0;
}

.ui-card__subtitle {
  font-size: var(--type-body-sm);
  color: var(--text-muted);
  margin-top: var(--space-1);
  line-height: var(--leading-normal);
}

.ui-card__body {
  color: var(--text-secondary);
}

.ui-card__footer {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
</style>
