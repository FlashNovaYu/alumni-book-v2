<template>
  <nav class="class-space-section-nav" aria-label="班级空间目录">
    <a
      v-for="section in sections"
      :key="section.id"
      :href="`#${section.id}`"
      :class="{ 'is-active': activeId === section.id }"
      @click="activeId = section.id"
    >
      <span class="section-copy">
        <strong>{{ section.label }}</strong>
        <small class="section-description">{{ section.description }}</small>
      </span>
      <small class="section-count">{{ section.count }}</small>
    </a>
  </nav>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface ClassSpaceSection {
  id: string
  label: string
  description: string
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
.class-space-section-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); width: min(840px, 100%); margin: 0 auto; padding: var(--space-3); background: var(--surface-paper); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-surface); }
.class-space-section-nav a { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); min-height: 72px; padding: var(--space-3) var(--space-4); color: var(--text-muted); background: transparent; border: 1px solid transparent; border-bottom-color: var(--border-subtle); text-decoration: none; }
.class-space-section-nav a::after { position: absolute; right: var(--space-4); bottom: -1px; left: var(--space-4); height: 2px; content: ''; background: transparent; }
.class-space-section-nav a.is-active { color: var(--text-primary); background: var(--surface-raised); border-color: var(--border-subtle); }
.class-space-section-nav a.is-active::after { background: var(--accent); }
.section-copy { display: grid; min-width: 0; gap: 3px; }
.section-copy strong { overflow: hidden; font-size: 14px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.section-description { overflow: hidden; color: var(--text-muted); font-size: 10px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.section-count { display: grid; width: 24px; height: 24px; place-items: center; color: var(--accent); font-size: 11px; font-variant-numeric: tabular-nums; border: 1px solid var(--border-subtle); border-radius: 50%; }

@media (max-width: 700px) {
  .class-space-section-nav { grid-template-columns: 1fr; }
  .class-space-section-nav a { min-height: 60px; }
}
</style>
