<template>
  <ClassmateLoginBook :api-base="apiBase" />
</template>

<script setup lang="ts">
import ClassmateLoginBook from './ClassmateLoginBook.vue'

defineProps<{
  apiBase: string
}>()
</script>
