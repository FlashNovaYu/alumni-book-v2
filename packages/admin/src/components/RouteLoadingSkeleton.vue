<template>
  <section class="route-loading" role="status" aria-label="页面加载中">
    <div class="route-loading__title" />
    <div class="route-loading__line route-loading__line--wide" />
    <div class="route-loading__line" />
    <div class="route-loading__card" />
    <span class="sr-only">页面加载中</span>
  </section>
</template>

<style scoped>
.route-loading { display: grid; gap: 14px; max-width: 960px; }
.route-loading__title, .route-loading__line, .route-loading__card { border-radius: 8px; background: linear-gradient(90deg, var(--color-surface-cream) 25%, var(--color-surface-cream-strong) 50%, var(--color-surface-cream) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
.route-loading__title { width: min(260px, 55%); height: 30px; }.route-loading__line { width: min(460px, 90%); height: 14px; }.route-loading__line--wide { width: min(640px, 100%); }.route-loading__card { height: 220px; margin-top: 8px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .route-loading__title, .route-loading__line, .route-loading__card { animation: none; } }
</style>
