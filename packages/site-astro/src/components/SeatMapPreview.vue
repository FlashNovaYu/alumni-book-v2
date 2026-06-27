<template>
  <section class="seat-preview museum-paper">
    <p class="museum-kicker">CLASSROOM MEMORY</p>
    <h2>座位记忆</h2>
    <div class="seat-preview__grid">
      <span v-for="seat in seats" :key="seat">{{ seat }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ seats: string[] }>()
</script>

<style scoped>
.seat-preview {
  padding: var(--spacing-lg);
  border-radius: var(--rounded-md);
}

.seat-preview__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(42px, 1fr));
  gap: 8px;
  margin-top: var(--spacing-md);
}

.seat-preview__grid span {
  min-height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-sm);
  background: var(--color-canvas);
}
</style>
