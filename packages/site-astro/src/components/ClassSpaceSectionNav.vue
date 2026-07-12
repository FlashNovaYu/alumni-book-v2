<template>
  <nav class="class-space-section-nav" aria-label="班级空间目录">
    <a
      v-for="section in sections"
      :key="section.id"
      :href="`#${section.id}`"
      :class="{ 'is-active': activeId === section.id }"
      @click="activeId = section.id"
    >
      <span>{{ section.label }}</span>
      <small>{{ section.count }}</small>
    </a>
  </nav>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface ClassSpaceSection {
  id: string
  label: string
  count: number
}

const props = defineProps<{ sections: ClassSpaceSection[] }>()
const activeId = ref(props.sections[0]?.id || '')
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    const current = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
    if (current?.target.id) activeId.value = current.target.id
  }, { rootMargin: '-28% 0px -58%', threshold: [0.1, 0.35, 0.7] })

  props.sections.forEach((section) => {
    const target = document.getElementById(section.id)
    if (target) observer?.observe(target)
  })
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.class-space-section-nav {
  display: flex;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  padding: 0 0 var(--spacing-xs);
  border-bottom: 1px solid var(--color-paper-border);
  scrollbar-width: none;
}

.class-space-section-nav::-webkit-scrollbar { display: none; }
.class-space-section-nav a {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  min-height: 42px;
  padding: 0 var(--spacing-sm);
  color: var(--color-paper-muted);
  border-bottom: 2px solid transparent;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.class-space-section-nav a.is-active { color: var(--color-paper-ink); border-bottom-color: var(--color-paper-stamp-red); }
.class-space-section-nav small { color: inherit; font-size: 11px; }

@media (min-width: 1100px) {
  .class-space-section-nav {
    position: sticky;
    top: calc(var(--nav-height) + var(--spacing-md));
    display: grid;
    width: 176px;
    align-self: start;
    padding: var(--spacing-sm);
    overflow: visible;
    background: var(--color-paper-bg-soft);
    border: 1px solid var(--color-paper-border);
    box-shadow: var(--shadow-paper-card);
  }

  .class-space-section-nav a { border-bottom: 0; border-left: 2px solid transparent; }
  .class-space-section-nav a.is-active { border-left-color: var(--color-paper-stamp-red); background: var(--color-paper-card); }
}
</style>
