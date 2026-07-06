<template>
  <section class="seat-preview paper-panel museum-motion-soft">
    <p class="museum-kicker">ARCHIVE // 班级座位分布卷宗</p>
    <h2>教室座位记忆图</h2>
    <p v-if="seatMap" class="archive-desc">检索成功: 已收录 <span class="highlight-count">{{ seatMap.seats.length }}</span> 个座位，<span class="highlight-count">{{ seatMap.missingSeatCount }}</span> 位同学待补充。</p>
    <p v-else-if="loading" class="archive-desc">正在提取教室座位记忆...</p>
    <p v-else class="archive-desc">载入班级座位分布的档案缩略图解。</p>
    <div class="seat-preview__grid">
      <span v-for="seat in seats" :key="seat" class="seat-cell">{{ seat }}</span>
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
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  color: var(--color-paper-ink);
  box-shadow: var(--shadow-paper-card);
}

.museum-kicker {
  color: var(--color-paper-brown);
  font-family: var(--font-display);
  font-size: var(--type-caption-size);
  letter-spacing: 0.1em;
}

.seat-preview h2 {
  color: var(--color-paper-brown);
  font-family: var(--font-display);
  margin-top: var(--spacing-xxs);
  margin-bottom: var(--spacing-xs);
}

.archive-desc {
  color: var(--color-paper-muted);
  font-size: var(--type-body-sm-size);
  margin-bottom: var(--spacing-md);
}

.highlight-count {
  color: var(--color-paper-brown);
  font-weight: bold;
}

.seat-preview__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(42px, 1fr));
  gap: 8px;
  margin-top: var(--spacing-md);
}

.seat-cell {
  min-height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-sm);
  background: var(--color-paper-bg-soft);
}
</style>
