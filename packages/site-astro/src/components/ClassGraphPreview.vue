<template>
  <section class="graph-preview paper-panel museum-motion-soft">
    <p class="museum-kicker">ARCHIVE // 班级图谱卷宗</p>
    <h2>班级社交网络图谱</h2>
    <p v-if="graph" class="archive-desc">检索成功: 已整理 <span class="highlight-count">{{ graph.nodes.length }}</span> 位同学与 <span class="highlight-count">{{ graph.edges.length }}</span> 条关系线索。</p>
    <p v-else-if="loading" class="archive-desc">正在检索班级关系卷宗...</p>
    <p v-else class="archive-desc">基于同桌、留言及共同兴趣分析生成的网络关联检索入口。</p>
    <button class="btn-secondary" @click="loaded = true">调阅图谱预览</button>
    <div v-if="loaded" class="graph-preview__nodes">
      <span v-for="name in sampleNames" :key="name">{{ name }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  apiBase?: string
  sampleNames?: string[]
}>()

const loaded = ref(false)
const loading = ref(false)
const graph = ref<{ nodes: any[]; edges: any[] } | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(`${props.apiBase || ''}/api/highlights/class-graph`)
    const json = await res.json()
    if (json.success) {
      graph.value = json.data
    }
  } catch (e) {
    console.error('Failed to load class graph summary:', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.graph-preview {
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

.graph-preview h2 {
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

.graph-preview__nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: var(--spacing-md);
}

.graph-preview__nodes span {
  padding: 6px 10px;
  border-radius: var(--rounded-pill);
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  color: var(--color-paper-ink-soft);
}
</style>
