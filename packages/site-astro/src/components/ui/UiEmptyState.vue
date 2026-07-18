<template>
  <div class="ui-empty-state" :class="{ 'ui-empty-state--compact': compact }">
    <div class="ui-empty-state__icon" aria-hidden="true">
      <slot name="icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.3" />
          <circle cx="32" cy="32" r="12" stroke="currentColor" stroke-width="1.5" opacity="0.2" />
          <circle cx="32" cy="32" r="4" fill="currentColor" opacity="0.15" />
        </svg>
      </slot>
    </div>
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

withDefaults(defineProps<Props>(), {
  compact: false,
})
</script>

<style scoped>
.ui-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-8) var(--space-5);
  gap: var(--space-4);
}

.ui-empty-state--compact {
  padding: var(--space-6) var(--space-4);
  gap: var(--space-3);
}

.ui-empty-state__icon {
  color: var(--text-dim);
  line-height: 0;
}

.ui-empty-state__title {
  font-size: var(--type-title-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
  margin: 0;
}

.ui-empty-state__description {
  font-size: var(--type-body-md);
  color: var(--text-muted);
  line-height: var(--leading-normal);
  max-width: 400px;
  margin: 0;
}

.ui-empty-state__action {
  margin-top: var(--space-2);
}

@media (max-width: 640px) {
  .ui-empty-state {
    padding: var(--space-6) var(--space-4);
  }
}
</style>
