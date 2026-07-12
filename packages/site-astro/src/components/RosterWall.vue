<template>
  <div ref="rootRef">
    <div class="archive-search paper-panel">
      <p class="museum-kicker">人物长廊</p>
      <input v-model="keyword" type="text" class="text-input search-input" aria-label="档案检索" placeholder="档案检索：姓名、昵称、学校、座右铭、MBTI" autocomplete="off" />
      <p class="search-count">{{ keyword.trim() ? `找到 ${filteredClassmates.length} 位同学` : '浏览所有同学档案（若 TA 的页面待完善，欢迎联系管理员补全资料）' }}</p>
    </div>

    <!-- 同学列表网格 -->
    <div class="archive-grid">
      <ArchiveRosterCard
        v-for="mate in classmates"
        :key="mate.slug"
        v-show="isCardVisible(mate)"
        :card="toArchiveClassmateCard(mate, siteBase)"
        :api-base="apiBase"
        @identity-transition="rememberIdentityTransition"
      />
    </div>

    <nav v-if="totalPages > 1" class="roster-pagination" aria-label="人物长廊分页">
      <!-- 上一页 -->
      <button type="button" class="page-btn page-btn--arrow" :disabled="currentPage === 1" aria-label="上一页" @click="goToPage(currentPage - 1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg>
      </button>

      <!-- 第一页 -->
      <template v-if="showLeftEllipsis">
        <button
          type="button"
          class="page-btn"
          :class="{ 'is-active': currentPage === 1 }"
          aria-label="第 1 页"
          :aria-current="currentPage === 1 ? 'page' : undefined"
          @click="goToPage(1)"
        >
          1
        </button>
        <span class="page-ellipsis" aria-hidden="true">…</span>
      </template>

      <!-- 中间页码 -->
      <button
        v-for="page in pages"
        :key="page"
        type="button"
        class="page-btn"
        :class="{ 'is-active': currentPage === page }"
        :aria-label="`第 ${page} 页`"
        :aria-current="currentPage === page ? 'page' : undefined"
        @click="goToPage(page)"
      >
        {{ page }}
      </button>

      <!-- 最后一页 -->
      <template v-if="showRightEllipsis">
        <span class="page-ellipsis" aria-hidden="true">…</span>
        <button
          type="button"
          class="page-btn"
          :class="{ 'is-active': currentPage === totalPages }"
          :aria-label="`第 ${totalPages} 页`"
          :aria-current="currentPage === totalPages ? 'page' : undefined"
          @click="goToPage(totalPages)"
        >
          {{ totalPages }}
        </button>
      </template>

      <!-- 下一页 -->
      <button type="button" class="page-btn page-btn--arrow" :disabled="currentPage === totalPages" aria-label="下一页" @click="goToPage(currentPage + 1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg>
      </button>
    </nav>

    <!-- 空状态 -->
    <div v-if="filteredClassmates.length === 0" class="empty-state">
      <p>未找到匹配的同学</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { runWhenIdle, isDeepEqual, fetchJsonIfChanged } from '../utils/deferredFetch'
import ArchiveRosterCard from './ArchiveRosterCard.vue'
import { toArchiveClassmateCard } from '../utils/museumViewModels'

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

const classmates = ref<Classmate[]>([...props.initialClassmates])
const keyword = ref('')
const currentPage = ref(1)
const isRestoringIdentityState = ref(false)
const PAGE_SIZE = 9

const rootRef = ref<HTMLElement | null>(null)

const filteredClassmates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return classmates.value
  return classmates.value.filter(c => {
    return (
      c.name.toLowerCase().includes(kw) ||
      (c.nickname && c.nickname.toLowerCase().includes(kw)) ||
      (c.school && c.school.toLowerCase().includes(kw)) ||
      (c.className && c.className.toLowerCase().includes(kw)) ||
      (c.motto && c.motto.toLowerCase().includes(kw)) ||
      (c.mbti && c.mbti.toLowerCase().includes(kw))
    )
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredClassmates.value.length / PAGE_SIZE)))

const paginatedClassmates = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredClassmates.value.slice(start, start + PAGE_SIZE)
})

const visibleClassmateSlugs = computed(() => new Set(paginatedClassmates.value.map((mate) => mate.slug)))

function isCardVisible(mate: Classmate) {
  return visibleClassmateSlugs.value.has(mate.slug)
}

const paginationItemsToDisplay = 5

const showLeftEllipsis = computed(() => totalPages.value > paginationItemsToDisplay && currentPage.value - 1 > paginationItemsToDisplay / 2)
const showRightEllipsis = computed(() => totalPages.value > paginationItemsToDisplay && totalPages.value - currentPage.value + 1 > paginationItemsToDisplay / 2)

const pages = computed<number[]>(() => {
  const total = totalPages.value
  const current = currentPage.value
  const displayCount = paginationItemsToDisplay

  if (total <= displayCount) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const halfDisplay = Math.floor(displayCount / 2)
  const startVal = current - halfDisplay
  const endVal = current + halfDisplay

  const adjustedStart = Math.max(1, startVal)
  const adjustedEnd = Math.min(total, endVal)

  let start = adjustedStart
  let end = adjustedEnd

  if (adjustedStart === 1) {
    end = displayCount
  }
  if (adjustedEnd === total) {
    start = total - displayCount + 1
  }

  if (showLeftEllipsis.value) start++
  if (showRightEllipsis.value) end--

  return Array.from(
    { length: end - start + 1 },
    (_, i) => start + i
  )
})

watch(keyword, () => {
  if (!isRestoringIdentityState.value) currentPage.value = 1
})

watch(totalPages, () => {
  currentPage.value = Math.min(currentPage.value, totalPages.value)
})

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  currentPage.value = page
  rootRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  // 避免首屏高并发阻塞，改为 idle 空闲时静默刷新 SWR 数据
  runWhenIdle(async () => {
    try {
      const { data } = await fetchJsonIfChanged(
        `${props.apiBase}/api/classmates`,
        'classmates'
      )
      if (data && data.success && data.data && !isDeepEqual(data.data, classmates.value)) {
        classmates.value = data.data
      }
    } catch (e) {
      console.error('Failed to sync classmates list via SWR:', e)
    }
  })
})
</script>

<style scoped>
.archive-search {
  max-width: 760px;
  margin: 0 auto var(--spacing-xl);
  padding: var(--spacing-lg) var(--spacing-xl);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
}

.search-input {
  width: 100%;
  text-align: center;
  font-size: 15px;
  min-height: 44px;
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  color: var(--color-paper-ink);
}

.search-input:focus {
  border-color: var(--color-paper-brown);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-paper-brown) 16%, transparent);
}

.search-count {
  font-size: var(--type-body-sm-size);
  color: var(--color-paper-muted);
}

.archive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: var(--spacing-lg);
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xxl);
  color: var(--color-muted);
}

.roster-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: var(--spacing-xl);
}

.page-btn {
  display: inline-grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0;
  color: var(--color-paper-muted);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: color var(--duration-fast) ease, background-color var(--duration-fast) ease, border-color var(--duration-fast) ease;
}

.page-btn:hover:not(:disabled),
.page-btn:focus-visible {
  color: var(--color-paper-ink);
  border-color: var(--color-paper-brown);
  outline: none;
}

.page-btn.is-active {
  color: #fffaf2;
  background: var(--color-paper-brown);
  border-color: var(--color-paper-brown);
}

.page-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.page-btn--arrow svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.page-ellipsis { width: 20px; color: var(--color-paper-muted); font-size: 16px; line-height: 1; text-align: center; }

@media (max-width: 768px) {
  .archive-search {
    padding: var(--spacing-lg);
  }

  .archive-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }
}
</style>
