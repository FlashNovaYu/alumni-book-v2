<template>
  <span :class="badgeClasses" v-bind="$attrs">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type BadgeVariant = 'accent'
type BadgeSize = 'sm'

interface Props {
  variant?: BadgeVariant
  size?: BadgeSize
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'accent',
  size: 'sm',
})

const badgeClasses = computed(() => [
  'ui-badge',
  `ui-badge--${props.variant}`,
  `ui-badge--${props.size}`,
])
</script>

<style scoped>
.ui-badge { display: inline-flex; align-items: center; font-weight: var(--weight-medium); line-height: 1; white-space: nowrap; }
.ui-badge--sm { min-height: 18px; padding: 2px 6px; border-radius: var(--radius-sm); font-size: var(--type-caption); }
.ui-badge--accent { background: var(--accent-soft); color: var(--accent); }
</style>
