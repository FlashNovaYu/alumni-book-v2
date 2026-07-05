<!-- packages/site-astro/src/components/FirstLoginPasswordGuide.vue -->
<!-- CCSwitch: 首次登录强制改密引导的占位组件，满足 Task 5 的编译依赖。 -->

<template>
  <div class="guide-placeholder"></div>
</template>

<script setup lang="ts">
defineProps<{
  apiBase: string
  slug: string
  oldPassword?: string
}>()

defineEmits<{
  (e: 'completed'): void
  (e: 'cancel'): void
}>()
</script>
