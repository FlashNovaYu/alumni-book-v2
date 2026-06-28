<template>
  <a :href="card.hasPage ? card.href : '#'" class="archive-card museum-motion-soft" :class="{ 'is-empty': !card.hasPage }">
    <div class="archive-card__avatar">
      <img v-if="card.avatarUrl && !avatarError" :src="avatarSrc" :alt="card.name" loading="lazy" decoding="async" @error="avatarError = true" />
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
import { computed, ref } from 'vue'
import type { ArchiveClassmateCard } from '../utils/museumViewModels'

const props = defineProps<{ card: ArchiveClassmateCard; apiBase: string }>()
const avatarError = ref(false)

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
  min-height: 152px;
  padding: var(--spacing-lg);
  color: inherit;
  text-decoration: none;
  background: var(--color-museum-paper);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-museum-paper);
}

.archive-card.is-empty {
  opacity: 0.72;
}

.archive-card__avatar {
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--color-museum-paper-strong), var(--color-museum-film-blue));
  color: var(--color-museum-ink);
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
  color: var(--color-museum-ink);
}

.archive-card__motto {
  margin-top: 6px;
  color: var(--color-muted);
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
  background: rgba(200, 169, 106, 0.18);
  color: var(--color-museum-ink-soft);
  font-size: 12px;
}

.archive-card__status {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-museum-stamp-red);
  min-height: 22px;
}
</style>
