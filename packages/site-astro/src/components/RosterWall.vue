<template>
  <div ref="rootRef">
    <!-- 搜索区域 -->
    <div class="roster-search">
      <div class="roster-search__header">
        <p class="roster-search__kicker">人物长廊</p>
        <h2 class="roster-search__title">同学档案</h2>
        <button
          v-if="!gyroActivated"
          class="roster-gyro-btn mobile-only"
          @click="activateGyro"
          aria-label="开启 3D 光影"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
          开启 3D 光影
        </button>
      </div>
      <div class="roster-search__input-wrapper">
        <svg class="roster-search__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" />
          <path d="M14.5 14.5L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <input
          v-model="keyword"
          type="text"
          class="roster-search__input"
          aria-label="档案检索"
          placeholder="档案检索：姓名、昵称、学校、座右铭、MBTI"
          autocomplete="off"
        />
        <button
          v-if="keyword"
          class="roster-search__clear"
          aria-label="清除搜索"
          @click="keyword = ''"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <p class="roster-search__count">
        {{ searchCountText }}
      </p>
    </div>

    <!-- 骨架屏 -->
    <div v-if="loading" class="roster-grid">
      <UiSkeleton v-for="i in 6" :key="`skeleton-${i}`" variant="card" />
    </div>

    <!-- 同学列表网格 -->
    <TransitionGroup v-else-if="filteredClassmates.length > 0" :name="transitionName" tag="div" class="roster-grid">
      <ArchiveRosterCard
        v-for="(mate, index) in paginatedClassmates"
        :key="mate.slug"
        :card="toArchiveClassmateCard(mate, siteBase)"
        :api-base="apiBase"
        :base-transform="`rotateZ(${getStaticRotation((currentPage - 1) * PAGE_SIZE + index)}deg) translateY(${getStaticY((currentPage - 1) * PAGE_SIZE + index)}px)`"
        @identity-transition="rememberIdentityTransition"
      />
    </TransitionGroup>

    <!-- 空状态 -->
    <UiEmptyState
      v-else
      title="未找到匹配的同学"
      description="尝试使用不同的关键词搜索，或联系管理员补全资料。"
    />

    <!-- 分页 -->
    <UiPagination
      v-if="totalPages > 1"
      :model-value="currentPage"
      :total-pages="totalPages"
      aria-label="人物长廊分页"
      @update:model-value="goToPage"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { runWhenIdle, isDeepEqual, fetchJsonIfChanged } from '../utils/deferredFetch'
import ArchiveRosterCard from './ArchiveRosterCard.vue'
import UiSkeleton from './ui/UiSkeleton.vue'
import UiEmptyState from './ui/UiEmptyState.vue'
import UiPagination from './ui/UiPagination.vue'
import { toArchiveClassmateCard } from '../utils/museumViewModels'
import { initDeviceOrientation } from '../composables/useMouseTilt'

interface Classmate {
  name: string
  slug: string
  hasPage: boolean
  hasStandardProfile?: boolean
  avatarUrl: string | null
  motto: string
  nickname?: string
  school?: string
  className?: string
  mbti?: string
  completion?: number
  tags?: string[]
}

interface IdentityTransitionState {
  slug: string
  keyword: string
  page: number
  visibleSlugs: string[]
}

const studentIdentityTransitionKey = 'vt-student-identity-state'

function consumeIdentityTransitionState(): IdentityTransitionState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(studentIdentityTransitionKey)
    sessionStorage.removeItem(studentIdentityTransitionKey)
    if (!raw) return null
    const state = JSON.parse(raw) as Partial<IdentityTransitionState>
    if (
      typeof state.slug !== 'string' ||
      typeof state.keyword !== 'string' ||
      typeof state.page !== 'number' ||
      !Number.isInteger(state.page) ||
      state.page < 1 ||
      !Array.isArray(state.visibleSlugs) ||
      !state.visibleSlugs.every((slug) => typeof slug === 'string')
    ) return null
    return state as IdentityTransitionState
  } catch {
    return null
  }
}

const props = defineProps<{
  initialClassmates: Classmate[]
  apiBase: string
  siteBase: string
}>()

const classmates = ref<Classmate[]>([...props.initialClassmates].sort((a, b) => (b.completion || 0) - (a.completion || 0)))
const keyword = ref('')
const gyroActivated = ref(false)

const activateGyro = async () => {
  await initDeviceOrientation()
  gyroActivated.value = true
}

function getStaticRotation(index: number) {
  return (Math.sin(index * 1.5) * 1.5).toFixed(2);
}
function getStaticY(index: number) {
  return (Math.cos(index * 2.1) * 4).toFixed(2);
}
const currentPage = ref(1)
const transitionName = ref('roster-list-forward')
const isRestoringIdentityState = ref(false)
const loading = ref(false)
const PAGE_SIZE = 12

const rootRef = ref<HTMLElement | null>(null)

const filteredClassmates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  let result = classmates.value
  
  if (kw) {
    result = result.filter(c => {
      return (
        c.name.toLowerCase().includes(kw) ||
        (c.nickname && c.nickname.toLowerCase().includes(kw)) ||
        (c.school && c.school.toLowerCase().includes(kw)) ||
        (c.className && c.className.toLowerCase().includes(kw)) ||
        (c.motto && c.motto.toLowerCase().includes(kw)) ||
        (c.mbti && c.mbti.toLowerCase().includes(kw))
      )
    })
  }

  return result
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredClassmates.value.length / PAGE_SIZE)))

const paginatedClassmates = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredClassmates.value.slice(start, start + PAGE_SIZE)
})

const searchCountText = computed(() => {
  if (keyword.value.trim()) {
    return `找到 ${filteredClassmates.value.length} 位同学`
  }
  return '浏览所有同学档案（若 TA 的页面待完善，欢迎联系管理员补全资料）'
})

watch(keyword, () => {
  if (!isRestoringIdentityState.value) currentPage.value = 1
})

watch(totalPages, () => {
  currentPage.value = Math.min(currentPage.value, totalPages.value)
})

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return

  if (page > currentPage.value) {
    transitionName.value = 'roster-list-forward'
  } else {
    transitionName.value = 'roster-list-backward'
  }

  currentPage.value = page
}

function rememberIdentityTransition(slug: string) {
  try {
    sessionStorage.setItem(studentIdentityTransitionKey, JSON.stringify({
      slug,
      keyword: keyword.value,
      page: currentPage.value,
      visibleSlugs: paginatedClassmates.value.map((mate) => mate.slug),
    }))
  } catch {}
}

onMounted(async () => {
  const identityReturnState = consumeIdentityTransitionState()
  if (identityReturnState) {
    isRestoringIdentityState.value = true
    keyword.value = identityReturnState.keyword
    currentPage.value = identityReturnState.page
    await nextTick()
    isRestoringIdentityState.value = false
  }

  runWhenIdle(async () => {
    try {
      loading.value = true
      const { changed, data } = await fetchJsonIfChanged<{ success: boolean; data: Classmate[] }>(
        `${props.apiBase}/api/classmates?t=${Date.now()}`,
        `roster-classmates-cache`
      )
      if (changed && data?.success && Array.isArray(data.data)) {
        classmates.value = data.data.sort((a, b) => (b.completion || 0) - (a.completion || 0))
      }
    } catch (e) {
      console.error('Failed to sync classmates list via SWR:', e)
    } finally {
      loading.value = false
    }
  })
})
</script>

<style scoped>
/* Search section */
.roster-search {
  max-width: 760px;
  margin: 0 auto var(--space-7);
  padding: var(--space-6) var(--space-5);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.roster-search__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.roster-search__kicker {
  font-size: var(--type-caption-uppercase);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--accent);
  margin: 0;
}

.roster-search__title {
  font-family: var(--font-display);
  font-size: var(--type-display-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-tight);
  margin: 0;
}

.roster-gyro-btn {
  display: none;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) auto 0;
  padding: 6px 12px;
  font-size: var(--type-caption);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.roster-gyro-btn:hover {
  background: var(--bg-soft);
  color: var(--text-primary);
}

.roster-search__input-wrapper {
  position: relative;
  width: 100%;
  max-width: 560px;
}

.roster-search__icon {
  position: absolute;
  left: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.roster-search__input {
  width: 100%;
  height: 48px;
  padding: 0 var(--space-4) 0 calc(var(--space-4) + 24px);
  font-size: var(--type-body-md);
  font-weight: var(--weight-regular);
  color: var(--text-primary);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  outline: none;
  transition:
    border-color var(--duration-fast) var(--ease-out-expo),
    box-shadow var(--duration-fast) var(--ease-out-expo);
}

.roster-search__input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.roster-search__input::placeholder {
  color: var(--text-dim);
}

.roster-search__clear {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out-expo);
}

.roster-search__clear:hover {
  color: var(--text-primary);
}

.roster-search__count {
  font-size: var(--type-body-sm);
  color: var(--text-muted);
  margin: 0;
}

/* Grid & Animations */
.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: var(--space-5);
  perspective: 1200px;
}

.roster-list-forward-move,
.roster-list-forward-enter-active,
.roster-list-forward-leave-active,
.roster-list-backward-move,
.roster-list-backward-enter-active,
.roster-list-backward-leave-active {
  transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
}

.roster-list-forward-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}
.roster-list-forward-leave-to {
  opacity: 0;
  transform: translateX(-30px) scale(0.95);
}

.roster-list-backward-enter-from {
  opacity: 0;
  transform: translateX(-30px) scale(0.95);
}
.roster-list-backward-leave-to {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}

.roster-list-forward-leave-active,
.roster-list-backward-leave-active {
  position: absolute;
}

/* Pagination spacing */
:deep(.ui-pagination) {
  margin-top: var(--space-7);
}

@media (max-width: 768px) {
  .roster-search {
    padding: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .roster-search__input {
    font-size: 16px; /* 防止 iOS 自动放大缩放 */
  }

  .roster-search__title {
    font-size: var(--type-title-lg);
  }

  .roster-gyro-btn.mobile-only {
    display: inline-flex;
  }

  .roster-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}

@media (max-width: 400px) {
  .roster-grid {
    grid-template-columns: 1fr;
  }
}
</style>
