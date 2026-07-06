<template>
  <section class="public-message-board">
    <div class="public-message-board__composer">
      <textarea
        v-model="content"
        class="paper-textarea"
        placeholder="写一张便签，贴到全班的留言墙上..."
        maxlength="500"
      />
      <div class="public-message-board__tools">
        <select v-model="cardStyle" class="paper-select" aria-label="便签样式">
          <option value="paper">复古纸张</option>
          <option value="letter">横格信笺</option>
          <option value="photoback">拍立得背面</option>
          <option value="chalkboard">黑板便签</option>
        </select>
        <span class="char-count">{{ content.length }}/500</span>
        <button class="btn-primary" :disabled="submitting || !content.trim()" @click="submit">
          {{ submitting ? '投递中...' : '提交留言' }}
        </button>
      </div>
      <p v-if="notice" :class="['board-notice', notice.type]">{{ notice.text }}</p>
    </div>

    <div class="public-message-board__tabs" role="tablist" aria-label="留言筛选">
      <button :class="{ active: tab === 'approved' }" @click="tab = 'approved'">公共留言</button>
      <button :class="{ active: tab === 'mine' }" @click="loadMine">我的提交</button>
    </div>

    <div v-if="loading" class="board-loading">正在展开留言墙...</div>
    <div v-else-if="visibleMessages.length === 0" class="board-empty">这里还没有便签。</div>
    <div v-else class="public-message-list">
      <article v-for="msg in visibleMessages" :key="msg.id" :class="['public-message-card', `style-${msg.cardStyle}`]">
        <div class="message-card-meta">
          <span>{{ msg.authorName }}</span>
          <span>{{ formatDate(msg.createdAt) }}</span>
        </div>
        <p>{{ msg.content }}</p>
        <span v-if="msg.status === 'pending'" class="status-stamp">待审核</span>
        <span v-if="msg.status === 'rejected'" class="status-stamp rejected">未通过</span>
        <p v-if="msg.reviewReason" class="review-reason">{{ msg.reviewReason }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchMyPublicMessages, fetchPublicMessages, submitPublicMessage } from '../api/postOffice'

type PublicMessage = {
  id: string
  authorName: string
  content: string
  cardStyle: string
  status: string
  reviewReason?: string | null
  createdAt: string
}

const props = defineProps<{ apiBase: string }>()

const tab = ref<'approved' | 'mine'>('approved')
const approvedMessages = ref<PublicMessage[]>([])
const myMessages = ref<PublicMessage[]>([])
const loading = ref(true)
const submitting = ref(false)
const content = ref('')
const cardStyle = ref('paper')
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const visibleMessages = computed(() => tab.value === 'mine' ? myMessages.value : approvedMessages.value)

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

async function loadApproved() {
  loading.value = true
  try {
    const data = await fetchPublicMessages(props.apiBase)
    if (data.success) approvedMessages.value = data.data?.items || []
  } finally {
    loading.value = false
  }
}

async function loadMine() {
  tab.value = 'mine'
  loading.value = true
  try {
    const data = await fetchMyPublicMessages(props.apiBase)
    if (data.success) myMessages.value = data.data?.items || []
  } finally {
    loading.value = false
  }
}

async function submit() {
  submitting.value = true
  notice.value = null
  try {
    const data = await submitPublicMessage(props.apiBase, content.value.trim(), cardStyle.value)
    if (data.success) {
      content.value = ''
      notice.value = { type: 'success', text: data.message || '留言已提交，等待审核' }
      await loadMine()
    } else {
      notice.value = { type: 'error', text: data.message || '提交失败' }
    }
  } catch {
    notice.value = { type: 'error', text: '网络错误，请稍后重试' }
  } finally {
    submitting.value = false
  }
}

onMounted(loadApproved)
</script>

<style scoped>
.public-message-board {
  display: grid;
  gap: var(--spacing-xl);
}
.public-message-board__composer {
  padding: var(--spacing-lg);
  border: 1px dashed var(--color-paper-border);
  background: color-mix(in srgb, var(--color-paper-card) 88%, #fffaf2);
}
.paper-textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  color: var(--color-paper-ink);
  padding: var(--spacing-md);
  font: inherit;
}
.public-message-board__tools {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  flex-wrap: wrap;
}
.paper-select {
  min-height: 40px;
  border: 1px solid var(--color-paper-border);
  background: var(--color-paper-card);
  border-radius: var(--rounded-md);
  color: var(--color-paper-ink);
  padding: 0 var(--spacing-sm);
}
.char-count {
  margin-left: auto;
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.board-notice.success { color: var(--color-success); }
.board-notice.error { color: var(--color-error); }
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
}
.public-message-board__tabs button.active {
  color: var(--color-paper-brown);
  border-color: var(--color-paper-brown);
}
.public-message-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacing-lg);
}
.public-message-card {
  position: relative;
  padding: var(--spacing-lg);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  box-shadow: var(--shadow-paper-card);
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
}
.public-message-list > article:nth-child(even) {
  transform: rotate(0.6deg);
}
.public-message-list > article:nth-child(odd) {
  transform: rotate(-0.6deg);
}
.public-message-card:hover {
  transform: translateY(-4px) rotate(0deg) scale(1.01) !important;
  box-shadow: 0 10px 24px rgba(74, 50, 29, 0.12);
  z-index: 2;
}
.public-message-card p {
  word-break: break-word;
  overflow-wrap: break-word;
}
.message-card-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm);
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.status-stamp {
  display: inline-flex;
  margin-top: var(--spacing-sm);
  color: var(--color-paper-stamp-red);
  font-size: var(--type-caption-size);
  border: 1px solid currentColor;
  border-radius: var(--rounded-sm);
  padding: 2px 8px;
}
.review-reason {
  color: var(--color-error);
  font-size: var(--type-body-sm-size);
}

/* Card Styles */
.style-paper {
  background: #fcfaf2;
  border: 1px solid #eedec4;
  color: #4a3e3d;
  box-shadow: 0 4px 12px rgba(139,120,95,0.08);
}
.style-chalkboard {
  background: #1e2d2f;
  border: 1px solid #10191a;
  color: #f5f5f5;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.style-chalkboard .message-card-meta,
.style-chalkboard p,
.style-chalkboard .status-stamp,
.style-chalkboard .review-reason {
  color: #e0f2f1;
}
.style-photoback {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  color: #212121;
  box-shadow: 0 8px 20px rgba(0,0,0,0.06);
}
.style-letter {
  background: #faf6f0;
  background-image: repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 27px, #e0d4c9 28px);
  line-height: 28px !important;
  color: #3e2723;
  border: 1px solid #e0d4c9;
  box-shadow: 0 4px 12px rgba(93,64,55,0.08);
}
.style-letter p {
  line-height: 28px !important;
}

@media (max-width: 768px) {
  .public-message-list { grid-template-columns: 1fr; }
  .char-count { margin-left: 0; }
  .public-message-board__tools .btn-primary { width: 100%; }
}
</style>
