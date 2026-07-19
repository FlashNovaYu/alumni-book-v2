<template>
  <div class="ui-data-table">
    <div v-if="title || $slots.header" class="ui-data-table__header">
      <slot name="header">
        <h3 v-if="title" class="ui-data-table__title">{{ title }}</h3>
      </slot>
    </div>
    <div class="ui-data-table__wrapper">
      <table class="ui-data-table__table">
        <thead>
          <tr>
            <th v-if="selectable" class="ui-data-table__cell--checkbox">
              <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
            </th>
            <th v-for="col in columns" :key="col.key" :class="{ 'ui-data-table__cell--sortable': col.sortable }" @click="col.sortable && handleSort(col.key)">
              {{ col.label }}
              <span v-if="col.sortable" class="ui-data-table__sort-icon">
                {{ sortKey === col.key ? (sortOrder === 'asc' ? '↑' : '↓') : '⇅' }}
              </span>
            </th>
            <th v-if="$slots.actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in paginatedData" :key="getRowKey(row)" :class="{ 'ui-data-table__row--selected': isSelected(row) }">
            <td v-if="selectable" class="ui-data-table__cell--checkbox">
              <input type="checkbox" :checked="isSelected(row)" @change="toggleSelect(row)" />
            </td>
            <td v-for="col in columns" :key="col.key">
              <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                {{ row[col.key] }}
              </slot>
            </td>
            <td v-if="$slots.actions" class="ui-data-table__actions">
              <slot name="actions" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pagination" class="ui-data-table__pagination">
      <span class="ui-data-table__info">共 {{ total }} 条，第 {{ currentPage }} / {{ totalPages }} 页</span>
      <div class="ui-data-table__page-buttons">
        <button :disabled="currentPage <= 1" @click="currentPage--">上一页</button>
        <button v-for="page in visiblePages" :key="page" :class="{ 'ui-data-table__page--active': page === currentPage }" @click="currentPage = page">{{ page }}</button>
        <button :disabled="currentPage >= totalPages" @click="currentPage++">下一页</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Column {
  key: string
  label: string
  sortable?: boolean
}

interface Props {
  title?: string
  columns: Column[]
  data: any[]
  selectable?: boolean
  pagination?: boolean
  pageSize?: number
  rowKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  selectable: false,
  pagination: false,
  pageSize: 10,
  rowKey: 'id',
})

const emit = defineEmits<{
  'sort': [key: string, order: 'asc' | 'desc']
  'select': [selected: any[]]
}>()

const sortKey = ref('')
const sortOrder = ref<'asc' | 'desc'>('asc')
const currentPage = ref(1)
const selectedRows = ref<Set<any>>(new Set())

const sortedData = computed(() => {
  if (!sortKey.value) return props.data
  return [...props.data].sort((a, b) => {
    const aVal = a[sortKey.value]
    const bVal = b[sortKey.value]
    const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0
    return sortOrder.value === 'asc' ? cmp : -cmp
  })
})

const paginatedData = computed(() => {
  if (!props.pagination) return sortedData.value
  const start = (currentPage.value - 1) * props.pageSize
  return sortedData.value.slice(start, start + props.pageSize)
})

const total = computed(() => props.data.length)
const totalPages = computed(() => Math.ceil(total.value / props.pageSize))

const visiblePages = computed(() => {
  const pages: number[] = []
  for (let i = 1; i <= totalPages.value; i++) {
    if (i === 1 || i === totalPages.value || (i >= currentPage.value - 1 && i <= currentPage.value + 1)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== -1) {
      pages.push(-1)
    }
  }
  return pages.filter((p, i, arr) => p !== -1 || arr[i - 1] !== -1)
})

const isAllSelected = computed(() => {
  return props.data.length > 0 && props.data.every(row => selectedRows.value.has(row))
})

function getRowKey(row: any) {
  return row[props.rowKey] ?? JSON.stringify(row)
}

function isSelected(row: any) {
  return selectedRows.value.has(row)
}

function toggleSelect(row: any) {
  if (selectedRows.value.has(row)) {
    selectedRows.value.delete(row)
  } else {
    selectedRows.value.add(row)
  }
  emit('select', Array.from(selectedRows.value))
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedRows.value.clear()
  } else {
    props.data.forEach(row => selectedRows.value.add(row))
  }
  emit('select', Array.from(selectedRows.value))
}

function handleSort(key: string) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
  emit('sort', sortKey.value, sortOrder.value)
}
</script>

<style scoped>
.ui-data-table {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.ui-data-table__header {
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}
.ui-data-table__title {
  font-size: var(--type-title-md);
  font-weight: var(--weight-semibold);
  margin: 0;
}
.ui-data-table__wrapper {
  overflow-x: auto;
}
.ui-data-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--type-body-sm);
}
.ui-data-table__table th,
.ui-data-table__table td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.ui-data-table__table th {
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  background: var(--bg-soft);
  white-space: nowrap;
}
.ui-data-table__cell--sortable {
  cursor: pointer;
  user-select: none;
}
.ui-data-table__sort-icon {
  margin-left: var(--space-1);
  opacity: 0.5;
}
.ui-data-table__row--selected {
  background: var(--accent-soft);
}
.ui-data-table__actions {
  display: flex;
  gap: var(--space-2);
}
.ui-data-table__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border);
}
.ui-data-table__info {
  font-size: var(--type-body-sm);
  color: var(--text-muted);
}
.ui-data-table__page-buttons {
  display: flex;
  gap: var(--space-1);
}
.ui-data-table__page-buttons button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: var(--type-body-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
}
.ui-data-table__page-buttons button:hover:not(:disabled) {
  background: var(--bg-soft);
  border-color: var(--border-strong);
}
.ui-data-table__page-buttons button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ui-data-table__page--active {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: var(--bg-raised) !important;
}
</style>
