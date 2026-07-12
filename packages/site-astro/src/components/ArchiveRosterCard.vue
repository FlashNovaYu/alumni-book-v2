<template>
  <a :href="card.hasPage ? card.href : '#'" class="archive-card">
    <div class="archive-card__avatar">
      <img v-if="card.avatarUrl && !avatarError" :src="avatarSrc" :alt="card.name" width="72" height="72" loading="lazy" decoding="async" style="aspect-ratio: 1" @error="avatarError = true" />
      <span v-else>{{ card.name.charAt(0) }}</span>
    </div>
    <div class="archive-card__body">
      <div class="archive-card__name">{{ card.name }}</div>
      <p class="archive-card__motto">{{ card.motto }}</p>
      <div class="archive-card__tags">
        <span v-for="tag in card.tags" :key="tag">{{ tag }}</span>
      </div>
      <div class="archive-card__status">{{ card.statusLabel }}</div>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ArchiveClassmateCard } from '../utils/museumViewModels'

const props = defineProps<{ card: ArchiveClassmateCard; apiBase: string }>()
const avatarError = ref(false)

watch(() => props.card.avatarUrl, () => { avatarError.value = false })

const avatarSrc = computed(() => {
  if (!props.card.avatarUrl) return ''
  if (props.card.avatarUrl.startsWith('http')) return props.card.avatarUrl
  return `${props.apiBase}${props.card.avatarUrl}`
})
</script>

<style scoped>
.archive-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  text-decoration: none;
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
}

.archive-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-paper-panel);
}

.archive-card__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--color-paper-card-muted), var(--color-paper-brown-soft));
  color: var(--color-paper-ink);
  border: 1px solid var(--color-paper-border);
  font-family: var(--font-display);
  font-size: 30px;
}

.archive-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.archive-card__name {
  font-size: 19px;
  font-weight: 600;
  color: var(--color-paper-ink);
}

.archive-card__motto {
  margin-top: 6px;
  color: var(--color-paper-muted);
  font-size: 13px;
  line-height: 1.6;
}

.archive-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.archive-card__tags span {
  padding: 2px 8px;
  border-radius: var(--rounded-sm);
  background: color-mix(in srgb, var(--color-paper-brown) 12%, var(--color-paper-card));
  color: var(--color-paper-ink-soft);
  font-size: 12px;
}

.archive-card__status {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-paper-stamp-red);
  min-height: 22px;
}
</style>
