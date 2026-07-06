<template>
  <section class="preface-wall paper-page fade-in">
    <div class="preface-body fade-in">
      <p class="preface-content" v-html="formattedContent"></p>
    </div>

    <hr v-if="hasAcknowledgments" class="hairline" style="margin: var(--spacing-xxl) 0;" />

    <div v-if="hasAcknowledgments" class="acknowledgment fade-in">
      <h2 class="ack-title display-sm">特别致谢</h2>
      <div class="ack-grid">
        <div v-for="ack in activeAcknowledgments" :key="ack.name" class="ack-person paper-note">
          <div class="ack-avatar">
            <img v-if="ack.avatarUrl" :src="getAvatarUrl(ack.avatarUrl)" :alt="ack.name" loading="lazy" decoding="async" />
            <span v-else class="avatar-placeholder">{{ ack.name.charAt(0) }}</span>
          </div>
          <div class="ack-name title-sm">{{ ack.name }}</div>
          <div class="ack-role">{{ ack.role }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { runWhenIdle, isDeepEqual } from '../utils/deferredFetch'

interface PrefaceConfig {
  preface: { title: string; subtitle: string; content: string }
  acknowledgments: Array<{ name: string; role: string; tip: string; avatarUrl?: string; avatar?: string }>
}

const props = defineProps<{
  initialConfig: PrefaceConfig
  apiBase: string
}>()

const config = ref<PrefaceConfig>({ ...props.initialConfig })

const formattedContent = computed(() => {
  const content = config.value.preface?.content || ''
  return content.replace(/\n/g, '<br>')
})

const hasAcknowledgments = computed(() => {
  return config.value.acknowledgments && config.value.acknowledgments.length > 0
})

const activeAcknowledgments = computed(() => {
  if (!config.value.acknowledgments) return []
  return config.value.acknowledgments.filter(a => a.name && a.name.trim())
})

function getAvatarUrl(url: string) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${props.apiBase}${url}`
}

onMounted(() => {
  runWhenIdle(async () => {
    try {
      const res = await fetch(`${props.apiBase}/api/config`)
      const data = await res.json()
      if (data.success && data.data) {
        if (!isDeepEqual(data.data, config.value)) {
          config.value = data.data
        }
      }
    } catch (e) {
      console.error('Failed to sync preface config via SWR:', e)
    }
  })
})
</script>

<style scoped>
.preface-wall {
  color: var(--color-paper-ink);
}

.preface-content {
  color: var(--color-paper-ink-soft);
  line-height: 2.15;
}

.ack-person {
  color: var(--color-paper-ink);
}

.ack-role {
  color: var(--color-paper-muted);
}
</style>
