<template>
  <section class="public-message-board">
    <!-- 留言发布组件 -->
    <MessageComposer
      ref="composer"
      :submitting="submitting"
      :notice="notice"
      @submit="handleComposerSubmit"
    />

    <!-- 选项卡切换 -->
    <div class="public-message-board__tabs" role="tablist" aria-label="留言筛选">
      <button :class="{ active: tab === 'approved' }" @click="switchTab('approved')">公共留言</button>
      <button :class="{ active: tab === 'mine' }" @click="switchTab('mine')">我的提交</button>
    </div>

    <!-- 留言列表展示 -->
    <div v-if="loading" class="board-loading">正在展开留言墙...</div>
    <div v-else-if="visibleMessages.length === 0" class="board-empty">这里还没有便签。</div>
    <MessageCardGrid
      v-else
      :messages="visibleMessages"
      @react="handleReact"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MessageComposer from './MessageComposer.vue'
import MessageCardGrid from './MessageCardGrid.vue'
import { usePublicMessages } from '../composables/usePublicMessages'

const props = defineProps<{ apiBase: string }>()

const {
  approved,
  mine,
  loading,
  submitting,
  notice,
  loadApproved,
  loadMine,
  submit,
  react,
} = usePublicMessages(props.apiBase)

const tab = ref<'approved' | 'mine'>('approved')
const composer = ref<InstanceType<typeof MessageComposer> | null>(null)

const visibleMessages = computed(() => (tab.value === 'mine' ? mine.value : approved.value))

async function switchTab(targetTab: 'approved' | 'mine') {
  tab.value = targetTab
  if (targetTab === 'mine') {
    await loadMine()
  } else {
    await loadApproved()
  }
}

async function handleComposerSubmit({ content, cardStyle }: { content: string; cardStyle: string }) {
  const success = await submit(content, cardStyle)
  if (success) {
    tab.value = 'mine'
    composer.value?.reset()
  }
}

async function handleReact({ id, reaction }: { id: string; reaction: string }) {
  await react(id, reaction)
}

onMounted(loadApproved)
</script>

<style scoped>
.public-message-board {
  display: grid;
  gap: var(--spacing-xl);
}
.public-message-board__tabs {
  display: flex;
  gap: var(--spacing-xs);
  overflow-x: auto;
}
.public-message-board__tabs button {
  min-height: 40px;
  padding: 0 var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-pill);
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
  cursor: pointer;
}
.public-message-board__tabs button.active {
  color: var(--color-paper-brown);
  border-color: var(--color-paper-brown);
}
</style>
