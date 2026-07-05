<template>
  <div class="visitor-pass">
    <NameGate :api-base="apiBase" />
  </div>
</template>

<script setup lang="ts">
import NameGate from './NameGate.vue'

defineProps<{ apiBase: string }>()
</script>

<style scoped>
.visitor-pass {
  width: min(100%, 460px);
  margin: 0 auto;
}
</style>
