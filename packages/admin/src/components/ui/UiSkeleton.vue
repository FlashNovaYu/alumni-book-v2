<template>
  <div class="ui-skeleton" :class="{ 'ui-skeleton--animate': animate }" aria-hidden="true">
    <template v-if="variant === 'text'">
      <span v-for="line in lines" :key="line" class="ui-skeleton__line" />
    </template>
    <div v-else-if="variant === 'card'" class="ui-skeleton__card">
      <span class="ui-skeleton__image" />
      <div class="ui-skeleton__content">
        <span class="ui-skeleton__title" />
        <span class="ui-skeleton__line" />
        <span class="ui-skeleton__line ui-skeleton__line--short" />
      </div>
    </div>
    <div v-else-if="variant === 'avatar'" class="ui-skeleton__avatar-row">
      <span class="ui-skeleton__avatar" :style="{ width: `${avatarSize}px`, height: `${avatarSize}px` }" />
      <div class="ui-skeleton__content">
        <span class="ui-skeleton__title" />
        <span class="ui-skeleton__line ui-skeleton__line--short" />
      </div>
    </div>
    <span v-else class="ui-skeleton__image" :style="{ aspectRatio }" />
  </div>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'text' | 'card' | 'avatar' | 'image'
  lines?: number
  avatarSize?: number
  aspectRatio?: string
  animate?: boolean
}

withDefaults(defineProps<Props>(), {
  variant: 'text',
  lines: 3,
  avatarSize: 48,
  aspectRatio: '16 / 9',
  animate: true,
})
</script>

<style scoped>
.ui-skeleton { width: 100%; }
.ui-skeleton__line,
.ui-skeleton__title,
.ui-skeleton__image,
.ui-skeleton__avatar {
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
.ui-skeleton__avatar-row { display: flex; align-items: center; gap: var(--space-3); }
.ui-skeleton__avatar { flex: 0 0 auto; border-radius: 50%; }
.ui-skeleton__avatar-row .ui-skeleton__content { flex: 1; min-width: 0; padding: 0; }
.ui-skeleton--animate .ui-skeleton__line,
.ui-skeleton--animate .ui-skeleton__title,
.ui-skeleton--animate .ui-skeleton__image,
.ui-skeleton--animate .ui-skeleton__avatar {
  background: linear-gradient(90deg, var(--bg-soft) 25%, var(--bg-raised) 50%, var(--bg-soft) 75%);
  background-size: 200% 100%;
  animation: ui-skeleton-shimmer 1.5s linear infinite;
}
@keyframes ui-skeleton-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton--animate .ui-skeleton__line,
  .ui-skeleton--animate .ui-skeleton__title,
  .ui-skeleton--animate .ui-skeleton__image,
  .ui-skeleton--animate .ui-skeleton__avatar { animation: none; }
}
</style>
