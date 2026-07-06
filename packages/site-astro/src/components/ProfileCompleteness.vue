<template>
  <aside class="profile-completeness" aria-label="资料完整度">
    <div class="profile-completeness__top">
      <span>资料完整度</span>
      <strong>{{ completion }}%</strong>
    </div>
    <div class="profile-completeness__track">
      <div class="profile-completeness__bar" :style="{ width: completion + '%' }"></div>
    </div>
    <p v-if="missingFields.length" class="profile-completeness__hint">
      还缺 {{ missingFields.slice(0, 3).map((item) => item.label).join('、') }}
    </p>
    <p v-else class="profile-completeness__hint">这份档案已经很完整了</p>
  </aside>
</template>

<script setup lang="ts">
import type { MissingProfileField } from '../utils/profileCompleteness'

defineProps<{
  completion: number
  missingFields: MissingProfileField[]
}>()
</script>

<style scoped>
.profile-completeness {
  padding: var(--spacing-md);
  border-radius: var(--rounded-md);
}

.profile-completeness__top {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  color: var(--color-paper-ink);
}

.profile-completeness__track {
  height: 8px;
  margin: var(--spacing-sm) 0;
  overflow: hidden;
  border-radius: var(--rounded-pill);
  background: rgba(38, 48, 58, 0.1);
}

.profile-completeness__bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-paper-brown), var(--color-primary));
  transition: width var(--duration-slow) var(--ease-out-quart);
}

.profile-completeness__hint {
  color: var(--color-paper-muted);
  font-size: 13px;
  line-height: 1.6;
}
</style>
