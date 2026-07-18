<template>
  <div class="ui-skeleton ui-skeleton--animate">
    <div class="ui-skeleton__visual" aria-hidden="true">
      <div class="ui-skeleton__card">
        <span class="ui-skeleton__image" />
        <div class="ui-skeleton__content">
          <span class="ui-skeleton__title" />
          <span class="ui-skeleton__line" />
          <span class="ui-skeleton__line ui-skeleton__line--short" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'card'
}

withDefaults(defineProps<Props>(), {
  variant: 'card',
})
</script>

<style scoped>
.ui-skeleton,
.ui-skeleton__visual { width: 100%; }
.ui-skeleton__line,
.ui-skeleton__title,
.ui-skeleton__image {
  display: block;
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
}
.ui-skeleton__line { height: 12px; margin-top: var(--space-2); }
.ui-skeleton__line--short { width: 60%; }
.ui-skeleton__title { width: 70%; height: 16px; }
.ui-skeleton__image { width: 100%; min-height: 120px; }
.ui-skeleton__card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-surface); }
.ui-skeleton__card .ui-skeleton__image { border-radius: 0; aspect-ratio: 16 / 9; }
.ui-skeleton__content { padding: var(--space-4); }
.ui-skeleton--animate .ui-skeleton__line,
.ui-skeleton--animate .ui-skeleton__title,
.ui-skeleton--animate .ui-skeleton__image {
  background: linear-gradient(90deg, var(--bg-soft) 25%, var(--bg-raised) 50%, var(--bg-soft) 75%);
  background-size: 200% 100%;
  animation: ui-skeleton-shimmer 1.5s linear infinite;
}
@keyframes ui-skeleton-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton--animate .ui-skeleton__line,
  .ui-skeleton--animate .ui-skeleton__title,
  .ui-skeleton--animate .ui-skeleton__image { animation: none; }
}
</style>
