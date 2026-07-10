<template>
  <div class="timeline-preview-container">
    <div v-if="timeline.length > 0" class="timeline-list">
      <div
        v-for="item in timeline"
        :key="item.id"
        :class="['timeline-item', `type-${item.type}`]"
      >
        <!-- 时间轴指示线与圆点 -->
        <div class="timeline-indicator">
          <div class="timeline-line"></div>
          <div class="timeline-dot">
            <span class="dot-inner"></span>
          </div>
        </div>

        <!-- 内容区域 -->
        <div class="timeline-content">
          <div class="timeline-header">
            <time :datetime="item.date" class="timeline-time">{{ formatDate(item.date) }}</time>
            <span :class="['type-badge', `badge-${item.type}`]">
              {{ getTypeLabel(item.type) }}
            </span>
          </div>
          <h4 class="timeline-title">{{ item.title }}</h4>
          <p v-if="item.description" class="timeline-desc">{{ item.description }}</p>
          
          <div v-if="item.photoUrl" class="timeline-media">
            <img
              :src="getPhotoUrl(item.photoUrl)"
              :alt="item.title"
              loading="lazy"
              class="timeline-thumbnail"
            />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-timeline">
      <p class="empty-text">时间轴暂无记录 ~</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClassSpaceTimelinePreview } from '@alumni/shared'

const props = defineProps<{
  timeline: ClassSpaceTimelinePreview[]
  apiBase: string
}>()

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch (e) {
    return dateStr
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'event': return '重要事件'
    case 'message': return '留言寄语'
    case 'photo': return '精彩瞬间'
    case 'join': return '新成员加入'
    default: return '记录'
  }
}

function getPhotoUrl(url: string | null) {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('/')) return url
  return `${props.apiBase}/api/files/${url}`
}
</script>

<style scoped>
.timeline-preview-container {
  width: 100%;
  position: relative;
}

.timeline-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.timeline-item {
  display: flex;
  gap: var(--spacing-lg);
  position: relative;
}

.timeline-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 0 20px;
}

.timeline-line {
  position: absolute;
  top: 10px;
  bottom: -20px;
  width: 2px;
  background: var(--color-paper-border, #eedec4);
  z-index: 1;
}

.timeline-item:last-child .timeline-line {
  display: none;
}

.timeline-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--color-paper-brown, #b8903a);
  background: var(--color-paper-card, #fcfaf2);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  margin-top: 4px;
}

.dot-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-paper-brown, #b8903a);
  transition: transform var(--duration-fast) ease;
}

.timeline-item:hover .dot-inner {
  transform: scale(1.3);
}

.timeline-content {
  flex: 1;
  background: var(--color-paper-card, #fcfaf2);
  border: 1px solid var(--color-paper-border, #eedec4);
  border-radius: var(--rounded-md);
  padding: var(--spacing-md) var(--spacing-lg);
  box-shadow: var(--shadow-paper-card, 0 4px 12px rgba(139,120,95,0.06));
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
}

.timeline-content:hover {
  transform: translateX(4px);
  box-shadow: 0 6px 16px rgba(139,120,95,0.1);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
}

.timeline-time {
  font-size: var(--type-caption-size, 12px);
  color: var(--color-paper-muted, #8b785f);
  font-weight: 500;
}

.type-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--rounded-sm);
  font-weight: 500;
}

.badge-event {
  background: #fdf2f2;
  color: #c53030;
}

.badge-message {
  background: #ebf8ff;
  color: #2b6cb0;
}

.badge-photo {
  background: #f0fff4;
  color: #22543d;
}

.badge-join {
  background: #faf5ff;
  color: #553c9a;
}

.timeline-title {
  margin: 0 0 var(--spacing-xxs) 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-paper-ink, #4a3e3d);
}

.timeline-desc {
  margin: 0;
  font-size: var(--type-body-sm-size, 13px);
  color: var(--color-muted, #666);
  line-height: 1.5;
}

.timeline-media {
  margin-top: var(--spacing-sm);
  border-radius: var(--rounded-sm);
  overflow: hidden;
  max-width: 240px;
  border: 1px solid var(--color-paper-border);
}

.timeline-thumbnail {
  width: 100%;
  max-height: 150px;
  object-fit: cover;
  display: block;
}

.empty-timeline {
  padding: var(--spacing-xl);
  text-align: center;
  background: var(--color-surface-cream, #fbfaf7);
  border: 1px dashed var(--color-paper-border);
  border-radius: var(--rounded-lg);
}

.empty-text {
  color: var(--color-muted);
  font-size: var(--type-body-sm-size);
}
</style>
