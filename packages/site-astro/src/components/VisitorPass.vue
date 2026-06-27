<template>
  <div class="visitor-pass museum-paper">
    <div class="pass-label">访客登记</div>
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
  padding: var(--spacing-lg);
  border-radius: var(--rounded-md);
}

.pass-label {
  margin-bottom: var(--spacing-sm);
  font-size: var(--type-caption-uppercase-size);
  letter-spacing: 0.14em;
  color: var(--color-museum-ink-soft);
}
</style>
