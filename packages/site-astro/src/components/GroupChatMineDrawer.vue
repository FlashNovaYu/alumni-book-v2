<template>
  <Teleport to="body">
    <div v-show="open" class="mine-overlay" @click.self="closeDrawer">
      <aside ref="drawer" class="mine-drawer" role="dialog" aria-modal="true" aria-label="我的群聊记录" tabindex="-1" @keydown="handleKeydown">
        <header>
          <div><p class="paper-kicker">MY CHAT ARCHIVE</p><h2>我的群聊记录</h2></div>
          <button ref="closeButton" type="button" aria-label="关闭我的记录" @click="closeDrawer">关闭</button>
        </header>
        <p v-if="loading" class="mine-state">正在整理记录</p>
        <p v-else-if="!groupedMessages.length" class="mine-state">还没有可归档的群聊记录。</p>
        <div v-else class="mine-list">
          <section v-for="group in groupedMessages" :key="group.key" class="mine-group" :aria-label="group.label">
            <h3>{{ group.label }}</h3>
            <article v-for="message in group.items" :key="message.id">
              <div><time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time></div>
              <p>{{ message.content || '这条消息已被撤回' }}</p>
              <small v-if="message.moderationReason">{{ message.moderationReason }}</small>
            </article>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { GroupChatMessage } from '@alumni/shared'
const props = defineProps<{ open: boolean; items: GroupChatMessage[]; loading: boolean }>()
const emit = defineEmits<{ close: [] }>()
const drawer = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const previousBodyOverflow = ref<string | null>(null)
let focusReturnTarget: HTMLElement | null = null

const groupedMessages = computed(() => {
  const groups = [
    { key: 'pending', label: '待审核', statuses: ['pending'] },
    { key: 'rejected', label: '未通过', statuses: ['rejected'] },
    { key: 'hidden', label: '已隐藏', statuses: ['hidden'] },
    { key: 'recalled', label: '已撤回', statuses: ['recalled_by_author', 'recalled_by_admin'] },
    { key: 'visible', label: '已发布', statuses: ['visible'] },
  ]

  return groups
    .map(group => ({ ...group, items: props.items.filter(message => group.statuses.includes(message.status)) }))
    .filter(group => group.items.length)
})

function lockInteractionState() {
  if (typeof document === 'undefined') return
  focusReturnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousBodyOverflow.value = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function restoreInteractionState() {
  if (typeof document !== 'undefined' && previousBodyOverflow.value !== null) {
    document.body.style.overflow = previousBodyOverflow.value
    previousBodyOverflow.value = null
  }

  const target = focusReturnTarget
  focusReturnTarget = null
  if (target && typeof document !== 'undefined' && document.contains(target)) target.focus()
}

function closeDrawer() {
  emit('close')
}

function trapFocus(event: KeyboardEvent) {
  if (!drawer.value) return
  const focusable = Array.from(drawer.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
  if (!focusable.length) {
    event.preventDefault()
    drawer.value.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeElement = document.activeElement
  if (event.shiftKey && (activeElement === first || !drawer.value.contains(activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (activeElement === last || !drawer.value.contains(activeElement))) {
    event.preventDefault()
    first.focus()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDrawer()
    return
  }
  if (event.key === 'Tab') trapFocus(event)
}

watch(() => props.open, async (open) => {
  if (!open) {
    restoreInteractionState()
    return
  }

  lockInteractionState()
  await nextTick()
  closeButton.value?.focus()
})

onBeforeUnmount(restoreInteractionState)
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>
<style scoped>
.mine-overlay { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; justify-content: flex-end; background: rgba(46,34,22,.28); }
.mine-drawer { width: min(390px, 100vw); height: 100%; padding: var(--spacing-lg); overflow-y: auto; color: var(--color-paper-ink); background: var(--color-paper-card); border-left: 1px solid var(--color-paper-border); box-shadow: -12px 0 28px rgba(74,50,29,.16); }
header { display:flex; justify-content:space-between; gap:var(--spacing-md); padding-bottom:var(--spacing-md); border-bottom:1px solid var(--color-paper-border); }
h2, h3, p { margin:0; }
h2 { font-family:var(--font-display); font-size:24px; }
header button { min-height:36px; padding:0 8px; color:var(--color-paper-muted); background:transparent; border:0; font:inherit; cursor:pointer; }
.mine-state { padding:var(--spacing-xl) 0; color:var(--color-paper-muted); text-align:center; }
.mine-list { display:grid; gap:var(--spacing-lg); margin-top:var(--spacing-md); }
.mine-group { display:grid; gap:var(--spacing-sm); }
.mine-group h3 { color:var(--color-paper-brown); font-size:13px; }
article { padding:var(--spacing-md); border:1px solid var(--color-paper-border); background:var(--color-paper-bg-soft); }
article div { display:flex; justify-content:space-between; gap:var(--spacing-sm); color:var(--color-paper-muted); font-size:12px; }
article p { margin-top:var(--spacing-xs); line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
article small { display:block; margin-top:var(--spacing-xs); color:var(--color-paper-stamp-red); }
</style>
