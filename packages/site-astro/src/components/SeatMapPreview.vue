<template>
  <section class="seat-preview museum-paper museum-motion-soft">
    <p class="museum-kicker">CLASSROOM MEMORY</p>
    <h2>座位记忆</h2>
    <p v-if="seatMap">已收录 {{ seatMap.seats.length }} 个座位，{{ seatMap.missingSeatCount }} 位同学待补充。</p>
    <p v-else-if="loading">正在提取教室座位记忆...</p>
    <p v-else>载入班级座位分布的记忆缩略。</p>
    <div class="seat-preview__grid">
      <span v-for="seat in seats" :key="seat">{{ seat }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  apiBase?: string
  seats?: string[]
}>()

const loading = ref(false)
const seatMap = ref<{ seats: any[]; missingSeatCount: number } | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(`${props.apiBase || ''}/api/highlights/seat-map`)
    const json = await res.json()
    if (json.success) {
      seatMap.value = json.data
    }
  } catch (e) {
    console.error('Failed to load seat map summary:', e)
  } finally {
    loading.value = false
  }
})
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
