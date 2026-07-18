<template>
  <div class="ui-empty-state" :class="{ 'ui-empty-state--compact': compact }">
    <h3 v-if="title" class="ui-empty-state__title">{{ title }}</h3>
    <p v-if="description" class="ui-empty-state__description">{{ description }}</p>
    <div v-if="$slots.action" class="ui-empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  compact?: boolean
}

withDefaults(defineProps<Props>(), { compact: false })
</script>

<style scoped>
.ui-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-3); padding: var(--space-8) var(--space-5); text-align: center; }
.ui-empty-state--compact { gap: var(--space-2); padding: var(--space-6) var(--space-4); }
.ui-empty-state__title { margin: 0; color: var(--text-primary); font-size: var(--type-title-md); font-weight: var(--weight-semibold); line-height: var(--leading-snug); }
.ui-empty-state__description { max-width: 400px; margin: 0; color: var(--text-muted); font-size: var(--type-body-md); line-height: var(--leading-normal); }
.ui-empty-state__action { margin-top: var(--space-1); }
</style>
