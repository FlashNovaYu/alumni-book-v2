<template>
  <span
    :class="badgeClasses"
    v-bind="$attrs"
  >
    <slot name="icon" />
    <span class="ui-badge__text">
      <slot />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info'
type BadgeSize = 'sm' | 'md'

interface Props {
  variant?: BadgeVariant
  size?: BadgeSize
  pill?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  pill: false,
})

const badgeClasses = computed(() => [
  'ui-badge',
  `ui-badge--${props.variant}`,
  `ui-badge--${props.size}`,
  {
    'ui-badge--pill': props.pill,
  },
])
</script>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
}

/* Sizes */
.ui-badge--sm {
  min-height: 18px;
  padding: 2px 6px;
  font-size: var(--type-caption);
  border-radius: var(--radius-sm);
}

.ui-badge--md {
  min-height: 22px;
  padding: 3px 10px;
  font-size: var(--type-body-sm);
  border-radius: var(--radius-md);
}

.ui-badge--pill {
  border-radius: var(--radius-pill);
}

/* Variants */
.ui-badge--default {
  background: var(--bg-soft);
  color: var(--text-secondary);
}

.ui-badge--accent {
  background: var(--accent-soft);
  color: var(--accent);
}

.ui-badge--success {
  background: rgba(93, 184, 114, 0.12);
  color: #3a8f52;
}

.ui-badge--warning {
  background: rgba(212, 160, 23, 0.12);
  color: #a07810;
}

.ui-badge--error {
  background: rgba(198, 69, 69, 0.12);
  color: #b03e3e;
}

.ui-badge--info {
  background: rgba(93, 184, 166, 0.12);
  color: #3a8f7d;
}

.ui-badge__text {
  display: inline;
}
</style>
