<template>
  <div class="ui-skeleton" :class="{ 'ui-skeleton--animate': animate }">
    <!-- Text skeleton -->
    <template v-if="variant === 'text'">
      <div
        v-for="i in lines"
        :key="i"
        class="ui-skeleton__line"
        :style="{ width: i === lines && lastLineWidth ? lastLineWidth : undefined }"
      />
    </template>

    <!-- Card skeleton -->
    <template v-else-if="variant === 'card'">
      <div class="ui-skeleton__card">
        <div class="ui-skeleton__image" />
        <div class="ui-skeleton__content">
          <div class="ui-skeleton__title" />
          <div class="ui-skeleton__text" />
          <div class="ui-skeleton__text ui-skeleton__text--short" />
        </div>
      </div>
    </template>

    <!-- Avatar skeleton -->
    <template v-else-if="variant === 'avatar'">
      <div class="ui-skeleton__avatar-wrapper">
        <div class="ui-skeleton__avatar" :style="{ width: avatarSize + 'px', height: avatarSize + 'px' }" />
        <div class="ui-skeleton__avatar-text">
          <div class="ui-skeleton__title" />
          <div class="ui-skeleton__text ui-skeleton__text--short" />
        </div>
      </div>
    </template>

    <!-- Image skeleton -->
    <template v-else-if="variant === 'image'">
      <div class="ui-skeleton__image-block" :style="{ aspectRatio }" />
    </template>
  </div>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'text' | 'card' | 'avatar' | 'image'
  lines?: number
  lastLineWidth?: string
  avatarSize?: number
  aspectRatio?: string
  animate?: boolean
}

withDefaults(defineProps<Props>(), {
  variant: 'text',
  lines: 3,
  lastLineWidth: undefined,
  avatarSize: 48,
  aspectRatio: '16/9',
  animate: true,
})
</script>

<style scoped>
.ui-skeleton {
  width: 100%;
}

.ui-skeleton__line,
.ui-skeleton__title,
.ui-skeleton__text,
.ui-skeleton__image,
.ui-skeleton__avatar,
.ui-skeleton__image-block {
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
}

.ui-skeleton--animate .ui-skeleton__line,
.ui-skeleton--animate .ui-skeleton__title,
.ui-skeleton--animate .ui-skeleton__text,
.ui-skeleton--animate .ui-skeleton__image,
.ui-skeleton--animate .ui-skeleton__avatar,
.ui-skeleton--animate .ui-skeleton__image-block {
  background: linear-gradient(
    90deg,
    var(--bg-soft) 25%,
    var(--bg-raised) 50%,
    var(--bg-soft) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Text variant */
.ui-skeleton__line {
  height: 12px;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-sm);
}

.ui-skeleton__line:last-child {
  margin-bottom: 0;
  width: 60%;
}

/* Card variant */
.ui-skeleton__card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.ui-skeleton__card .ui-skeleton__image {
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: 0;
}

.ui-skeleton__card .ui-skeleton__content {
  padding: var(--space-4);
}

.ui-skeleton__card .ui-skeleton__title {
  height: 16px;
  width: 70%;
  margin-bottom: var(--space-2);
}

.ui-skeleton__card .ui-skeleton__text {
  height: 12px;
  margin-bottom: var(--space-2);
}

.ui-skeleton__card .ui-skeleton__text--short {
  width: 50%;
}

/* Avatar variant */
.ui-skeleton__avatar-wrapper {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ui-skeleton__avatar {
  border-radius: 50%;
  flex-shrink: 0;
}

.ui-skeleton__avatar-text {
  flex: 1;
  min-width: 0;
}

.ui-skeleton__avatar-text .ui-skeleton__title {
  height: 14px;
  width: 60%;
  margin-bottom: var(--space-2);
}

.ui-skeleton__avatar-text .ui-skeleton__text {
  height: 10px;
  width: 40%;
}

/* Image variant */
.ui-skeleton__image-block {
  width: 100%;
  border-radius: var(--radius-md);
}
</style>
