<template>
  <div class="recipient-picker">
    <!-- 已选中收件人的展示状态 -->
    <div v-if="selectedRecipient" class="selected-recipient-card">
      <div class="recipient-avatar">
        <img
          v-if="selectedRecipient.avatarUrl"
          :src="getAvatarUrl(selectedRecipient.avatarUrl)"
          :alt="selectedRecipient.name"
          @error="handleAvatarError"
        />
        <div v-else class="avatar-fallback">{{ selectedRecipient.name[0] }}</div>
      </div>
      <div class="recipient-info">
        <span class="recipient-name">{{ selectedRecipient.name }}</span>
        <span class="recipient-slug">@{{ selectedRecipient.slug }}</span>
      </div>
      <button type="button" class="btn-clear" @click="clearSelection" aria-label="清除选择">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- 搜索输入框及下拉列表 -->
    <div v-else class="search-container">
      <div class="input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          class="picker-input"
          placeholder="搜索收件人姓名或拼音..."
          @focus="isDropdownOpen = true"
          @blur="handleBlur"
        />
        <span class="search-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </span>
      </div>

      <!-- 下拉过滤列表 -->
      <transition name="fade">
        <ul v-if="isDropdownOpen && filteredClassmates.length > 0" class="recipient-dropdown">
          <li
            v-for="classmate in filteredClassmates"
            :key="classmate.slug"
            class="dropdown-item"
            @mousedown="selectRecipient(classmate)"
          >
            <div class="recipient-avatar">
              <img
                v-if="classmate.avatarUrl"
                :src="getAvatarUrl(classmate.avatarUrl)"
                :alt="classmate.name"
              />
              <div v-else class="avatar-fallback">{{ classmate.name[0] }}</div>
            </div>
            <span class="dropdown-name">{{ classmate.name }}</span>
          </li>
        </ul>
        <ul v-else-if="isDropdownOpen && searchQuery.trim() !== ''" class="recipient-dropdown empty-dropdown">
          <li class="dropdown-item empty-item">没有找到匹配的同学</li>
        </ul>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchRecipientDirectory } from '../api/postOffice'
import type { ClassmateEntry } from '@alumni/shared'

const props = defineProps<{
  apiBase: string
  modelValue: ClassmateEntry | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ClassmateEntry | null): void
}>()

const classmates = ref<ClassmateEntry[]>([])
const searchQuery = ref('')
const isDropdownOpen = ref(false)

// 从 sessionStorage 获取当前登录同学的 slug 以便进行排除
const mySlug = computed(() => {
  try {
    const studentStr = sessionStorage.getItem('classmate_account_student')
    if (studentStr) {
      const student = JSON.parse(studentStr)
      return student.slug || ''
    }
  } catch (e) {
    console.error('获取登录同学信息失败', e)
  }
  return ''
})

const selectedRecipient = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

onMounted(async () => {
  try {
    const list = await fetchRecipientDirectory(props.apiBase)
    classmates.value = list || []
  } catch (err) {
    console.error('加载同学名册失败', err)
  }
})

// 根据搜索关键词过滤同学目录（排除自己，且只保留匹配姓名或拼音 slug 的项）
const filteredClassmates = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const currentMySlug = mySlug.value
  
  return classmates.value.filter(classmate => {
    // 排除自己
    if (classmate.slug === currentMySlug) {
      return false
    }
    
    // 如果没有输入，展示除自己外的全部
    if (!query) return true
    
    const nameMatch = classmate.name.toLowerCase().includes(query)
    const slugMatch = classmate.slug.toLowerCase().includes(query)
    const nicknameMatch = classmate.nickname ? classmate.nickname.toLowerCase().includes(query) : false
    
    return nameMatch || slugMatch || nicknameMatch
  })
})

function getAvatarUrl(url: string | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${props.apiBase}${url}`
}

function selectRecipient(classmate: ClassmateEntry) {
  selectedRecipient.value = classmate
  searchQuery.value = ''
  isDropdownOpen.value = false
}

function clearSelection() {
  selectedRecipient.value = null
}

function handleBlur() {
  // 延迟关闭下拉列表，以确保点击项的 mousedown 事件优先于 blur 触发
  setTimeout(() => {
    isDropdownOpen.value = false
  }, 200)
}

function handleAvatarError(e: Event) {
  const target = e.target as HTMLImageElement
  if (target) {
    target.style.display = 'none'
  }
}
</script>

<style scoped>
.recipient-picker {
  position: relative;
  width: 100%;
}

.search-container {
  position: relative;
  width: 100%;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.picker-input {
  width: 100%;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  color: var(--color-paper-ink);
  padding: var(--spacing-sm) var(--spacing-md);
  padding-right: 40px;
  font: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.picker-input:focus {
  outline: none;
  border-color: var(--color-paper-brown);
  box-shadow: 0 0 0 2px rgba(139, 94, 60, 0.1);
}

.search-icon {
  position: absolute;
  right: var(--spacing-md);
  color: var(--color-paper-muted);
  pointer-events: none;
  display: flex;
  align-items: center;
}

.recipient-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  margin-top: 4px;
  max-height: 240px;
  overflow-y: auto;
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.05));
  list-style: none;
  padding: var(--spacing-xs) 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: var(--color-paper-border);
}

.dropdown-name {
  font-weight: 500;
  color: var(--color-paper-ink);
}

.empty-item {
  justify-content: center;
  color: var(--color-paper-muted);
  cursor: default;
}

.empty-item:hover {
  background: transparent;
}

/* 已选择卡片样式 */
.selected-recipient-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-paper-brown);
  border-radius: var(--rounded-md);
  background: rgba(139, 94, 60, 0.05);
}

.recipient-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--color-paper-border);
  border: 1px solid var(--color-paper-border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.recipient-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  font-size: 14px;
  font-weight: bold;
  color: var(--color-paper-brown);
}

.recipient-info {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.recipient-name {
  font-size: var(--type-body-md-size);
  font-weight: 600;
  color: var(--color-paper-ink);
}

.recipient-slug {
  font-size: var(--type-caption-size);
  color: var(--color-paper-muted);
}

.btn-clear {
  border: none;
  background: transparent;
  color: var(--color-paper-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.btn-clear:hover {
  background: var(--color-paper-border);
  color: var(--color-paper-stamp-red);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
