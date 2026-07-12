<template>
  <div v-if="open" class="new-conversation-overlay" @click.self="$emit('close')">
    <section ref="dialog" class="new-conversation-dialog" role="dialog" aria-modal="true" aria-label="新建私聊" tabindex="-1">
      <header>
        <div><p class="paper-kicker">NEW DIRECT NOTE</p><h2>新建私聊</h2></div>
        <button ref="closeButton" type="button" aria-label="关闭新建私聊" @click="$emit('close')">关闭</button>
      </header>
      <p>选择同学后会打开已有会话，或等待你的第一句消息建立新会话。</p>
      <RecipientPicker :api-base="apiBase" :model-value="recipient" @update:model-value="chooseRecipient" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ClassmateEntry } from '@alumni/shared'
import RecipientPicker from './RecipientPicker.vue'

const props = defineProps<{ open: boolean; apiBase: string }>()
const emit = defineEmits<{ close: []; choose: [recipient: ClassmateEntry] }>()
const recipient = ref<ClassmateEntry | null>(null)
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null
let previousBodyOverflow: string | null = null

function restoreFocus() {
  if (previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow
    previousBodyOverflow = null
  }
  const target = previousFocus
  previousFocus = null
  if (target && document.contains(target)) target.focus()
}

function trapFocus(event: KeyboardEvent) {
  if (!dialog.value) return
  const focusable = Array.from(dialog.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'Tab') trapFocus(event)
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (props.open) handleKeydown(event)
}

watch(() => props.open, async (open) => {
  recipient.value = null
  if (!open) {
    restoreFocus()
    return
  }
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  closeButton.value?.focus()
})

onMounted(() => window.addEventListener('keydown', handleWindowKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  restoreFocus()
})

function chooseRecipient(value: ClassmateEntry | null) {
  recipient.value = value
  if (!value) return
  emit('choose', value)
  emit('close')
}
</script>

<style scoped>
.new-conversation-overlay { position: fixed; inset: 0; z-index: var(--z-modal); display: grid; padding: var(--spacing-lg); place-items: center; background: rgba(46, 34, 22, 0.28); }
.new-conversation-dialog { width: min(460px, 100%); padding: var(--spacing-xl); color: var(--color-paper-ink); background: var(--color-paper-card); border: 1px solid var(--color-paper-border); box-shadow: var(--shadow-paper-panel); }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--spacing-md); padding-bottom: var(--spacing-md); border-bottom: 1px solid var(--color-paper-border); }
header p, header h2 { margin: 0; }
header h2 { margin-top: 2px; font-family: var(--font-display); font-size: 28px; }
header button { min-height: 34px; padding: 0 8px; color: var(--color-paper-muted); background: transparent; border: 1px solid var(--color-paper-border); font: inherit; cursor: pointer; }
.new-conversation-dialog > p { margin: var(--spacing-lg) 0 var(--spacing-sm); color: var(--color-paper-muted); font-size: 13px; line-height: 1.65; }
</style>
