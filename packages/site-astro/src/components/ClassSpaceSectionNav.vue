<template>
  <nav class="class-space-section-nav" aria-label="班级空间目录">
    <a
      v-for="section in sections"
      :key="section.id"
      :href="`#${section.id}`"
      :class="{ 'is-active': activeId === section.id }"
      @click="activeId = section.id"
    >
      <span class="section-index">{{ section.index }}</span>
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
  index: string
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
.class-space-section-nav { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(176px, 68vw); gap: var(--spacing-xs); min-width: 0; overflow-x: auto; padding: 0 0 var(--spacing-sm); scrollbar-width: thin; scrollbar-color: var(--color-paper-border) transparent; }
.class-space-section-nav a { position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: center; gap: var(--spacing-xs); min-height: 64px; padding: var(--spacing-sm); color: var(--color-paper-muted); background: var(--color-paper-bg-soft); border: 1px solid var(--color-paper-border); text-decoration: none; }
.class-space-section-nav a::before { position: absolute; inset: var(--spacing-sm) auto var(--spacing-sm) 0; width: 2px; content: ''; background: transparent; }
.class-space-section-nav a.is-active { color: var(--color-paper-ink); background: var(--color-paper-card); box-shadow: var(--shadow-paper-card); }
.class-space-section-nav a.is-active::before { background: var(--color-paper-stamp-red); }
.section-index { color: var(--color-paper-brown); font-size: 11px; font-variant-numeric: tabular-nums; letter-spacing: 0.08em; }
.section-copy { display: grid; min-width: 0; gap: 3px; }
.section-copy strong { overflow: hidden; font-size: 14px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.section-description { overflow: hidden; color: var(--color-paper-muted); font-size: 10px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.section-count { display: grid; width: 24px; height: 24px; place-items: center; color: var(--color-paper-brown); font-size: 11px; font-variant-numeric: tabular-nums; border: 1px solid var(--color-paper-border); border-radius: 50%; }

@media (min-width: 1100px) {
  .class-space-section-nav { position: sticky; top: calc(var(--nav-height) + var(--spacing-md)); grid-auto-flow: row; grid-auto-columns: auto; width: 176px; padding: var(--spacing-sm); overflow: visible; background: color-mix(in srgb, var(--color-paper-bg-soft) 82%, transparent); border: 1px solid var(--color-paper-border); box-shadow: var(--shadow-paper-card); }
  .class-space-section-nav a { min-height: 70px; padding-right: var(--spacing-xs); background: transparent; border-color: transparent; border-bottom-color: color-mix(in srgb, var(--color-paper-border) 72%, transparent); }
  .class-space-section-nav a:last-child { border-bottom-color: transparent; }
  .class-space-section-nav a.is-active { border-color: var(--color-paper-border); }
}
</style>
