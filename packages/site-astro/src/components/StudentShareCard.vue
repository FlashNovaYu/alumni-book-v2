<template>
  <div class="share-modal">
    <div class="share-modal-overlay" @click="$emit('close')"></div>
    <div class="share-card card">
      <button class="share-close-btn" @click="$emit('close')">✕</button>
      <div class="share-card-content">
        <div class="share-avatar-wrapper">
          <img v-if="avatarSrc" :src="avatarSrc" class="share-avatar" :alt="studentName" />
          <span v-else class="avatar-char share-avatar-placeholder">{{ studentName.charAt(0) }}</span>
        </div>
        <h3 class="share-name">{{ studentName }}</h3>
        <p class="share-motto">{{ motto || '一句话故事' }}</p>
        <div class="share-qr-wrapper">
          <img :src="qrCodeSrc" class="share-qr" alt="二维码" />
          <p class="share-qr-tip">扫码访问 TA 的主页</p>
        </div>
      </div>
      <div class="share-actions-grid mt-4">
        <button class="btn-primary" @click="printPage">打印 / 存为 PDF</button>
        <button class="btn-secondary" @click="copyShareLink">
          {{ copySuccess ? '✓ 已复制' : '🔗 复制链接' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  studentName: string
  avatarSrc: string | null
  motto: string
}>()

defineEmits(['close'])

const copySuccess = ref(false)

const qrCodeSrc = computed(() => {
  if (typeof window === 'undefined') return ''
  const pageUrl = encodeURIComponent(window.location.href)
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${pageUrl}`
})

function printPage() {
  window.print()
}

function copyShareLink() {
  if (typeof window === 'undefined') return
  const url = window.location.href
  navigator.clipboard.writeText(url).then(() => {
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  }).catch(() => {
    alert('无法自动复制，请手动复制浏览器地址栏的链接。')
  })
}
</script>

<style scoped>
.share-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
}
.share-modal-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}
.share-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  background: var(--color-surface-card);
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.share-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--color-muted);
}
.share-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
}
.share-avatar-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-hairline);
  margin-bottom: var(--spacing-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-cream-strong);
}
.share-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.share-avatar-placeholder {
  font-family: var(--font-display);
  font-size: 24px;
  color: var(--color-muted);
}
.share-name {
  font-size: var(--type-title-md-size);
  margin-bottom: var(--spacing-xs);
}
.share-motto {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
  font-style: italic;
  margin-bottom: var(--spacing-lg);
  max-width: 240px;
}
.share-qr-wrapper {
  background: var(--color-canvas);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.share-qr {
  width: 120px;
  height: 120px;
}
.share-qr-tip {
  font-size: 11px;
  color: var(--color-muted);
  margin-top: 8px;
}
.share-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  width: 100%;
}
.mt-4 { margin-top: var(--spacing-lg); }
</style>
