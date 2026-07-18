<template>
  <div class="ui-tabs" :class="{ 'ui-tabs--vertical': vertical }">
    <div
      class="ui-tabs__list"
      role="tablist"
      :aria-orientation="vertical ? 'vertical' : 'horizontal'"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="[
          'ui-tabs__tab',
          { 'ui-tabs__tab--active': modelValue === tab.id }
        ]"
        :aria-selected="modelValue === tab.id"
        :aria-controls="`tabpanel-${tab.id}`"
        :id="`tab-${tab.id}`"
        role="tab"
        @click="selectTab(tab.id)"
      >
        <span v-if="tab.icon" class="ui-tabs__tab-icon" aria-hidden="true">
          <slot :name="`icon-${tab.id}`">
            {{ tab.icon }}
          </slot>
        </span>
        <span class="ui-tabs__tab-label">{{ tab.label }}</span>
      </button>
      <div
        v-if="!vertical"
        class="ui-tabs__indicator"
        :style="indicatorStyle"
      />
    </div>
    <div class="ui-tabs__panels">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'

export interface TabItem {
  id: string
  label: string
  icon?: string
  disabled?: boolean
}

interface Props {
  modelValue: string
  tabs: TabItem[]
  vertical?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const indicatorStyle = ref({
  left: '0px',
  width: '0px',
  transform: 'translateX(0)',
})

const activeTabIndex = computed(() =>
  props.tabs.findIndex(tab => tab.id === props.modelValue)
)

function updateIndicator() {
  if (props.vertical) return

  nextTick(() => {
    const tabList = document.querySelector('.ui-tabs__list')
    if (!tabList) return

    const tabElements = tabList.querySelectorAll('.ui-tabs__tab')
    const activeTab = tabElements[activeTabIndex.value] as HTMLElement

    if (activeTab) {
      indicatorStyle.value = {
        left: `${activeTab.offsetLeft}px`,
        width: `${activeTab.offsetWidth}px`,
        transform: 'translateX(0)',
      }
    }
  })
}

function selectTab(id: string) {
  emit('update:modelValue', id)
}

watch(() => props.modelValue, updateIndicator, { immediate: true })
watch(() => props.tabs, updateIndicator, { deep: true })
</script>

<style scoped>
.ui-tabs {
  display: flex;
  flex-direction: column;
}

.ui-tabs--vertical {
  flex-direction: row;
  gap: var(--space-6);
}

.ui-tabs__list {
  position: relative;
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-5);
}

.ui-tabs--vertical .ui-tabs__list {
  flex-direction: column;
  border-bottom: none;
  border-right: 1px solid var(--border);
  margin-bottom: 0;
  margin-right: var(--space-5);
  min-width: 160px;
}

.ui-tabs__tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: var(--type-body-md);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo);
}

.ui-tabs--vertical .ui-tabs__tab {
  border-bottom: none;
  border-right: 2px solid transparent;
  justify-content: flex-start;
  width: 100%;
}

.ui-tabs__tab:hover {
  color: var(--text-primary);
}

.ui-tabs__tab--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.ui-tabs--vertical .ui-tabs__tab--active {
  border-bottom: none;
  border-right-color: var(--accent);
}

.ui-tabs__tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ui-tabs__tab-label {
  line-height: 1;
}

.ui-tabs__indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
  border-radius: var(--radius-pill);
  transition:
    left var(--duration-normal) var(--ease-out-expo),
    width var(--duration-normal) var(--ease-out-expo);
}

.ui-tabs__panels {
  flex: 1;
  min-width: 0;
}

@media (max-width: 640px) {
  .ui-tabs__list {
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .ui-tabs__list::-webkit-scrollbar {
    display: none;
  }

  .ui-tabs--vertical {
    flex-direction: column;
  }

  .ui-tabs--vertical .ui-tabs__list {
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--border);
    margin-right: 0;
    margin-bottom: var(--space-5);
    min-width: auto;
    width: 100%;
  }

  .ui-tabs--vertical .ui-tabs__tab {
    border-right: none;
    border-bottom: 2px solid transparent;
  }

  .ui-tabs--vertical .ui-tabs__tab--active {
    border-right: none;
    border-bottom-color: var(--accent);
  }
}
</style>
