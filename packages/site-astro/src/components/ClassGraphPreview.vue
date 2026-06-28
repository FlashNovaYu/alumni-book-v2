<template>
  <section class="graph-preview museum-paper museum-motion-soft">
    <p class="museum-kicker">CLASS GRAPH</p>
    <h2>班级图谱</h2>
    <p v-if="graph">已整理 {{ graph.nodes.length }} 位同学与 {{ graph.edges.length }} 条关系线索。</p>
    <p v-else-if="loading">正在整理班级关系线索...</p>
    <p v-else>根据兴趣、座位、小组和留言互动生成的班级关系入口。</p>
    <button class="btn-secondary" @click="loaded = true">查看图谱预览</button>
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
  background: rgba(138, 162, 182, 0.18);
}
</style>
