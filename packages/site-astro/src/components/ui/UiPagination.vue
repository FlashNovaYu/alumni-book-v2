<template>
  <nav v-if="totalPages > 1" class="ui-pagination" :aria-label="ariaLabel">
    <!-- Previous -->
    <button
      class="ui-pagination__button"
      :disabled="modelValue <= 1"
      :aria-label="prevLabel"
      @click="goToPage(modelValue - 1)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <!-- Pages -->
    <div class="ui-pagination__pages">
      <template v-for="page in visiblePages" :key="page">
        <button
          v-if="page !== 'ellipsis'"
          :class="[
            'ui-pagination__page',
            { 'ui-pagination__page--active': page === modelValue }
          ]"
          :aria-current="page === modelValue ? 'page' : undefined"
          @click="goToPage(page as number)"
        >
          {{ page }}
        </button>
        <span
          v-else
          class="ui-pagination__ellipsis"
          aria-hidden="true"
        >
          …
        </span>
      </template>
    </div>

    <!-- Next -->
    <button
      class="ui-pagination__button"
      :disabled="modelValue >= totalPages"
      :aria-label="nextLabel"
      @click="goToPage(modelValue + 1)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: number
  totalPages: number
  siblingCount?: number
  ariaLabel?: string
  prevLabel?: string
  nextLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  siblingCount: 1,
  ariaLabel: '分页导航',
  prevLabel: '上一页',
  nextLabel: '下一页',
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const visiblePages = computed(() => {
  const pages: (number | 'ellipsis')[] = []
  const total = props.totalPages
  const current = props.modelValue
  const sibling = props.siblingCount

  // Always show first page
  pages.push(1)

  // Calculate range
  const leftSibling = Math.max(current - sibling, 2)
  const rightSibling = Math.min(current + sibling, total - 1)

  // Add ellipsis after first page if needed
  if (leftSibling > 2) {
    pages.push('ellipsis')
  } else if (leftSibling === 2) {
    pages.push(2)
  }

  // Add middle pages
  for (let i = Math.max(leftSibling, 2); i <= rightSibling; i++) {
    if (i > 1 && i < total) {
      pages.push(i)
    }
  }

  // Add ellipsis before last page if needed
  if (rightSibling < total - 1) {
    pages.push('ellipsis')
  } else if (rightSibling === total - 1) {
    pages.push(total - 1)
  }

  // Always show last page if more than 1
  if (total > 1) {
    // Remove duplicate if last page was already added
    if (pages[pages.length - 1] !== total) {
      pages.push(total)
    }
  }

  return pages
})

function goToPage(page: number) {
  if (page >= 1 && page <= props.totalPages && page !== props.modelValue) {
    emit('update:modelValue', page)
  }
}
</script>

<style scoped>
.ui-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.ui-pagination__button,
.ui-pagination__page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo);
}

.ui-pagination__button:hover:not(:disabled),
.ui-pagination__page:hover:not(.ui-pagination__page--active) {
  background: var(--bg-soft);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.ui-pagination__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ui-pagination__pages {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.ui-pagination__page--active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-raised);
}

.ui-pagination__ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--text-muted);
  font-size: var(--type-body-sm);
  user-select: none;
}

@media (max-width: 640px) {
  .ui-pagination__page,
  .ui-pagination__button,
  .ui-pagination__ellipsis {
    width: 32px;
    height: 32px;
    font-size: var(--type-caption);
  }
}
</style>
