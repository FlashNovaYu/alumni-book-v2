<template>
  <span :class="badgeClasses" v-bind="$attrs">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info'
type BadgeSize = 'sm' | 'md'

interface Props {
  variant?: BadgeVariant
  size?: BadgeSize
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
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
.ui-badge--md { min-height: 22px; padding: 3px 10px; border-radius: var(--radius-md); font-size: var(--type-body-sm); }
.ui-badge--default { background: var(--bg-soft); color: var(--text-secondary); }
.ui-badge--accent { background: var(--accent-soft); color: var(--accent); }
.ui-badge--success { background: rgba(93, 184, 114, 0.12); color: #3a8f52; }
.ui-badge--warning { background: rgba(212, 160, 23, 0.12); color: #a07810; }
.ui-badge--error { background: rgba(198, 69, 69, 0.12); color: #b03e3e; }
.ui-badge--info { background: rgba(93, 184, 166, 0.12); color: #3a8f7d; }
</style>
