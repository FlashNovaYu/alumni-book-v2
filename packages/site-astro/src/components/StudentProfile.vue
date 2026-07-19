<template>
  <div ref="rootRef">
    <!-- Loading -->
    <div v-if="loading" class="student-loading-container">
      <UiSkeleton variant="avatar" :avatar-size="96" />
      <UiSkeleton variant="text" :lines="3" />
    </div>

    <!-- Error -->
    <div v-else-if="!student" class="student-error-container">
      <UiEmptyState
        title="未能加载学生资料"
        description="请稍后重试，或联系管理员。"
      />
    </div>

    <div v-else>
      <!-- 专属页面 iframe 渲染 -->
      <div v-if="student.isOwner && student.customHtml" class="owner-page">
        <iframe
          :srcdoc="processedHtml"
          class="owner-iframe"
          frameborder="0"
          sandbox="allow-scripts"
        ></iframe>
      </div>

      <!-- 标准个人页模板 -->
      <div v-else class="student-page page-shell">
        <!-- Hero Section -->
        <section class="student-hero" :style="heroBgStyle">
          <div class="student-hero__overlay" />
          <div class="student-hero__content container">
            <div class="student-hero__avatar" :style="avatarTransitionStyle">
              <img
                v-if="avatarSrc && !avatarError"
                :src="avatarSrc"
                :alt="student.name"
                loading="eager"
                decoding="async"
                @error="avatarError = true"
              />
              <span v-else class="student-hero__avatar-fallback">{{ student.name.charAt(0) }}</span>
              <div v-if="student.isOwner" class="student-hero__owner-badge" title="专属页面">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
            </div>

            <div class="hero-support detail-content-enter">
              <h1 class="student-hero__name" :style="nameTransitionStyle">{{ student.name }}</h1>
              <p v-if="student.info?.nickname" class="student-hero__nickname">{{ student.info.nickname }}</p>
              <p v-if="student.info?.motto" class="student-hero__motto">「 {{ student.info.motto }} 」</p>

              <div v-if="museumSummary.tags.length" class="student-hero__tags">
                <span v-for="tag in museumSummary.tags" :key="tag" class="student-hero__tag">{{ tag }}</span>
              </div>

              <div class="student-hero__actions">
                <a
                  class="student-hero__action"
                  :href="siteUrl('mailbox/?to=' + encodeURIComponent(studentSlug))"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  给 TA 写信
                </a>
                <a v-if="isCurrentOwner" class="student-hero__action student-hero__action--secondary" :href="siteUrl('mailbox/')">
                  查看我的邮箱
                </a>
                <button class="student-hero__action student-hero__action--secondary" @click="openShareModal">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  分享
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Body Content -->
        <div class="student-body container detail-content-enter">
          <!-- 身份档案 -->
          <section v-if="hasFields(basicFields)" class="profile-section profile-section--identity" data-info-section="身份档案">
            <div class="profile-section__header">
              <div class="profile-section__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h2 class="profile-section__title">身份档案</h2>
            </div>
            <div class="info-grid">
              <div v-for="f in basicFields" :key="f.key" v-show="f.value" class="info-item">
                <span class="info-item__label">{{ f.label }}</span>
                <span class="info-item__value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 联系方式 -->
          <section v-if="hasFields(contactFields)" class="profile-section profile-section--contact" data-info-section="联系方式">
            <div class="profile-section__header">
              <div class="profile-section__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h2 class="profile-section__title">联系方式</h2>
            </div>
            <div class="info-grid info-grid--cards">
              <div v-for="f in contactFields" :key="f.key" v-show="f.value" class="info-card">
                <span class="info-card__label">{{ f.label }}</span>
                <span class="info-card__value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 个性标签 -->
          <section v-if="hasFields(personalityFields)" class="profile-section profile-section--personality" data-info-section="个性标签">
            <div class="profile-section__header">
              <div class="profile-section__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h2 class="profile-section__title">个性标签</h2>
            </div>
            <div class="tag-cloud">
              <div v-for="f in personalityFields" :key="f.key" v-show="f.value" class="tag-cloud__item">
                <span class="tag-cloud__label">{{ f.label }}</span>
                <span class="tag-cloud__value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 兴趣馆藏 -->
          <section v-if="hasFields(interestFields)" class="profile-section profile-section--interests" data-info-section="兴趣馆藏">
            <div class="profile-section__header">
              <div class="profile-section__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <h2 class="profile-section__title">兴趣馆藏</h2>
            </div>
            <div class="interest-chips">
              <div v-for="f in interestFields" :key="f.key" v-show="f.value" class="interest-chip">
                <span class="interest-chip__label">{{ f.label }}</span>
                <span class="interest-chip__value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 校园回忆 -->
          <section v-if="hasFields(memoryFields)" class="profile-section profile-section--memories" data-info-section="校园回忆">
            <div class="profile-section__header">
              <div class="profile-section__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <h2 class="profile-section__title">校园回忆</h2>
            </div>
            <div class="memory-list">
              <div v-for="f in memoryFields" :key="f.key" v-show="f.value" class="memory-quote">
                <div class="memory-quote__accent" />
                <div class="memory-quote__content">
                  <p class="memory-quote__label">{{ f.label }}</p>
                  <p class="memory-quote__value">{{ f.value }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- 时间胶囊 -->
          <section v-if="hasFields(futureFields)" class="profile-section profile-section--future" data-info-section="时间胶囊">
            <div class="profile-section__header">
              <div class="profile-section__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h2 class="profile-section__title">时间胶囊</h2>
            </div>
            <div class="timeline-list">
              <div v-for="f in futureFields" :key="f.key" v-show="f.value" class="timeline-item">
                <div class="timeline-item__dot" />
                <div class="timeline-item__content">
                  <span class="timeline-item__label">{{ f.label }}</span>
                  <span class="timeline-item__value">{{ f.value }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 个人小传 -->
          <section v-if="student.info?.profileModules?.length" class="profile-section">
            <div class="profile-section__header">
              <div class="profile-section__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <h2 class="profile-section__title">个人小传</h2>
            </div>
            <div class="profile-modules">
              <div v-for="(mod, idx) in student.info.profileModules" :key="idx" class="profile-module">
                <h3 class="profile-module__title">{{ mod.title }}</h3>
                <p class="profile-module__content">{{ mod.content }}</p>
              </div>
            </div>
          </section>

          <!-- 照片墙 -->
          <div ref="photoWallAnchor" id="photo-wall-anchor" class="lazy-anchor">
            <section v-if="student.photos?.length && photoWallVisible" class="profile-section">
              <div class="profile-section__header">
                <div class="profile-section__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <h2 class="profile-section__title">照片墙</h2>
              </div>
              <PhotoWall :photos="student.photos" :api-base="apiBase" />
            </section>
          </div>

          <!-- 留言板 -->
          <div ref="messageWallAnchor" id="message-wall-anchor" class="lazy-anchor">
            <MessageWall v-if="messageWallVisible" :student-slug="student.slug" :api-base="apiBase" />
          </div>

          <!-- 亮点入口 -->
          <div v-if="anyHighlightEnabled">
            <div id="highlights-anchor" :class="{ 'lazy-anchor': !highlightsVisible }" ref="highlightsAnchor" />
            <div v-if="highlightsVisible" class="profile-highlights paper-highlight-grid">
              <ClassGraphPreview v-if="classGraphEnabled" :api-base="apiBase" :sample-names="['张三', '李四', '王五']" />
              <SeatMapPreview v-if="seatMapEnabled" :api-base="apiBase" />
            </div>
          </div>

          <!-- 底部签章 -->
          <div class="seal-area">
            <span class="visits">浏览 <span>{{ student.visitCount || 0 }}</span> 次</span>
            <span class="seal">留念</span>
          </div>
        </div>

        <!-- 自助编辑 -->
        <SelfEditPanel :student-slug="student.slug" :student-name="student.name" :api-base="apiBase" />
      </div>

      <!-- 分享卡 -->
      <StudentShareCard
        v-if="shareOpen"
        :student-name="student.name"
        :avatar-src="avatarSrc"
        :motto="student.info?.motto"
        @close="closeShareModal"
      />

      <!-- 背景音乐 -->
      <StudentMusicPlayer
        v-if="student.musicUrl"
        :music-url="student.musicUrl"
        :music-title="student.musicTitle"
        :music-autoplay="student.musicAutoplay"
        :api-base="apiBase"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent, watch } from 'vue'
import SelfEditPanel from './SelfEditPanel.vue'
import StudentMusicPlayer from './StudentMusicPlayer.vue'
import ProfileCompleteness from './ProfileCompleteness.vue'
import UiSkeleton from './ui/UiSkeleton.vue'
import UiEmptyState from './ui/UiEmptyState.vue'
import { toStudentMuseumSummary } from '../utils/museumViewModels'
import { runWhenIdle, isDeepEqual, fetchJsonIfChanged } from '../utils/deferredFetch'
import { joinApiUrl } from '../utils/apiBase'
import { getClassmateToken, getClassmateStudent } from '@alumni/shared'

const PhotoWall = defineAsyncComponent(() => import('./PhotoWall.vue'))
const MessageWall = defineAsyncComponent(() => import('./MessageWall.vue'))
const StudentShareCard = defineAsyncComponent(() => import('./StudentShareCard.vue'))
const ClassGraphPreview = defineAsyncComponent(() => import('./ClassGraphPreview.vue'))
const SeatMapPreview = defineAsyncComponent(() => import('./SeatMapPreview.vue'))

interface Student {
  id: string
  name: string
  slug: string
  isOwner: boolean
  avatarUrl: string | null
  musicUrl: string | null
  musicTitle: string | null
  musicAutoplay: boolean
  backgroundUrl: string | null
  backgroundColor: string | null
  customHtml: string | null
  info: any
  photos: any[]
  visitCount: number
}

const props = defineProps<{
  initialStudent: Student | null
  studentSlug: string
  apiBase: string
  museum?: {
    enabled?: boolean
    enableClassGraph?: boolean
    enableSeatMap?: boolean
  }
}>()

const siteBase = import.meta.env.BASE_URL || '/'
const siteUrl = (path: string) => `${siteBase}${path.replace(/^\/+/, '')}`
const student = ref<Student | null>(props.initialStudent)
const loading = ref(!props.initialStudent)
const shareOpen = ref(false)
const avatarError = ref(false)

const rootRef = ref<HTMLElement | null>(null)
let disposed = false

const photoWallAnchor = ref<HTMLElement | null>(null)
const photoWallVisible = ref(false)
const messageWallAnchor = ref<HTMLElement | null>(null)
const messageWallVisible = ref(false)
const highlightsAnchor = ref<HTMLElement | null>(null)
const highlightsVisible = ref(false)

const museumHighlightsEnabled = computed(() => props.museum?.enabled !== false)
const classGraphEnabled = computed(() => museumHighlightsEnabled.value && props.museum?.enableClassGraph === true)
const seatMapEnabled = computed(() => museumHighlightsEnabled.value && props.museum?.enableSeatMap === true)
const anyHighlightEnabled = computed(() => classGraphEnabled.value || seatMapEnabled.value)

let pObserver: IntersectionObserver | null = null
let mObserver: IntersectionObserver | null = null
let hObserver: IntersectionObserver | null = null

const slugVal = computed(() => {
  if (props.studentSlug) return props.studentSlug
  if (typeof window !== 'undefined') {
    const segments = window.location.pathname.split('/').filter(Boolean)
    const studentIdx = segments.indexOf('student')
    if (studentIdx !== -1 && segments[studentIdx + 1]) {
      return segments[studentIdx + 1]
    }
  }
  return ''
})

const museumSummary = computed(() => {
  if (!student.value) return { completion: 0, missingFields: [], tags: [] }
  return toStudentMuseumSummary(student.value)
})

const isCurrentOwner = ref(false)

const avatarSrc = computed(() => {
  if (!student.value?.avatarUrl) return null
  if (student.value.avatarUrl.startsWith('http')) return student.value.avatarUrl
  return `${props.apiBase}${student.value.avatarUrl}`
})

const avatarTransitionStyle = computed(() => {
  if (!student.value) return undefined
  return {
    viewTransitionName: 'student-avatar-' + student.value.slug,
    viewTransitionClass: 'student-avatar',
  }
})

const nameTransitionStyle = computed(() => {
  if (!student.value) return undefined
  return {
    viewTransitionName: 'student-name-' + student.value.slug,
    viewTransitionClass: 'student-name',
  }
})

const heroBgStyle = computed(() => {
  if (!student.value) return {}
  const bgUrl = student.value.backgroundUrl
    ? (student.value.backgroundUrl.startsWith('http') ? student.value.backgroundUrl : `${props.apiBase}${student.value.backgroundUrl}`)
    : null
  return {
    backgroundImage: bgUrl
      ? `linear-gradient(180deg, rgba(28,25,23,0.3) 0%, rgba(28,25,23,0.7) 100%), url(${bgUrl})`
      : 'linear-gradient(180deg, #292524 0%, #1c1917 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

watch(() => student.value?.avatarUrl, () => { avatarError.value = false })

const processedHtml = computed(() => {
  if (!student.value?.customHtml) return ''
  return student.value.customHtml
    .replace(/\{\{\s*student\.name\s*\}\}/g, student.value.name)
    .replace(/\{\{\s*student\.avatarUrl\s*\}\}/g, avatarSrc.value || '')
    .replace(/\{\{\s*student\.musicUrl\s*\}\}/g, student.value.musicUrl ? resolveFileUrl(student.value.musicUrl) : '')
    .replace(/\{\{\s*student\.backgroundUrl\s*\}\}/g, student.value.backgroundUrl ? resolveFileUrl(student.value.backgroundUrl) : '')
    .replace(/\{\{\s*student\.info\.nickname\s*\}\}/g, student.value.info?.nickname || '')
    .replace(/\{\{\s*student\.info\.motto\s*\}\}/g, student.value.info?.motto || '')
})

function resolveFileUrl(value: string) {
  if (!value) return ''
  if (/^https?:\/\//.test(value)) return value
  if (value.startsWith('/api/files/')) return joinApiUrl(props.apiBase, value)
  return joinApiUrl(props.apiBase, `/api/files/${value.replace(/^\/+/, '')}`)
}

function hasFields(fields: any[]) {
  return fields.some(f => f.value && String(f.value).trim())
}

function getFields(info: any, keys: [string, string][]) {
  return keys.map(([k, label]) => ({ key: k, label, value: info?.[k] || '' }))
}

const basicFields = computed(() => getFields(student.value?.info, [
  ['name','姓名'],['nickname','昵称'],['gender','性别'],
  ['birthday','出生日期'],['school','学校'],['class','班级'],
  ['graduationYear','毕业年份'],
]))

const contactFields = computed(() => getFields(student.value?.info, [
  ['qq','QQ'],['wechat','微信'],['weibo','微博'],
  ['phone','手机'],['email','邮箱'],['address','常住地'],
]))

const personalityFields = computed(() => getFields(student.value?.info, [
  ['mbti','MBTI'],['bloodType','血型'],['astro','星座'],
  ['strengths','擅长的事'],['weaknesses','不擅长的事'],
  ['bestSubject','最喜欢科目'],['worstSubject','最讨厌科目'],
]))

const interestFields = computed(() => getFields(student.value?.info, [
  ['favoriteIdol','喜欢明星'],['favoriteAnime','喜欢动漫'],
  ['favoriteMovie','喜欢电影'],['favoriteSong','喜欢歌曲'],
  ['favoriteGame','喜欢游戏'],['favoriteFood','喜欢食物'],
  ['favoriteColor','喜欢颜色'],['favoriteSport','喜欢运动'],
]))

const memoryFields = computed(() => getFields(student.value?.info, [
  ['bestMemory','最难忘的一件事'],['bestLesson','最难忘的一节课'],
  ['deskmateFun','同桌趣事'],['classMeme','班级经典梗'],
  ['embarrassingMoment','最社死瞬间'],['proudestAchievement','学生时代最骄傲的事'],
]))

const futureFields = computed(() => getFields(student.value?.info, [
  ['targetUniversity','目标大学'],['targetMajor','目标专业'],
  ['futureCareer','未来职业'],['futureCity','未来城市'],
  ['futureSelf','十年后的自己'],['letterToFuture','给未来自己的话'],
]))

function openShareModal() { shareOpen.value = true }
function closeShareModal() { shareOpen.value = false }

onMounted(() => {
  disposed = false
  const current = getClassmateStudent<{ slug: string }>()
  isCurrentOwner.value = current?.slug === props.studentSlug

  if (!slugVal.value) {
    loading.value = false
    return
  }

  // Visit count
  const visitKey = `visited_${slugVal.value}`
  if (!sessionStorage.getItem(visitKey)) {
    sessionStorage.setItem(visitKey, '1')
    runWhenIdle(() => {
      const token = getClassmateToken()
      const headers: Record<string, string> = {}
      if (token) headers['X-Classmate-Token'] = token

      fetch(`${props.apiBase}/api/students/${slugVal.value}/visit`, { 
        method: 'POST',
        headers
      })
        .then(r => r.json())
        .then(d => {
          if (d.success && student.value) {
            student.value.visitCount = d.data.visitCount
          }
        })
        .catch(() => {})
    }, 1200)
  }

  // SWR sync
  runWhenIdle(async () => {
    try {
      const classmateToken = getClassmateToken()
      const customHeaders: Record<string, string> = {}
      if (classmateToken) {
        customHeaders['X-Classmate-Token'] = classmateToken
      }
      const fetchUrl = classmateToken
        ? `${props.apiBase}/api/students/${slugVal.value}`
        : `${props.apiBase}/api/students/${slugVal.value}?audience=public`

      let data: any
      if (classmateToken) {
        const response = await fetch(fetchUrl, { headers: customHeaders, cache: 'no-cache' })
        data = await response.json()
      } else {
        const publicCacheKey = `student_${slugVal.value}_public`
        const result = await fetchJsonIfChanged(fetchUrl, publicCacheKey)
        data = result.data
      }
      if (data?.success && data.data && !isDeepEqual(data.data, student.value)) {
        student.value = data.data
      }
    } catch (e) {
      console.error('Failed to sync student detail via SWR:', e)
    } finally {
      loading.value = false
    }
  })

  // Intersection observers
  if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    if (photoWallAnchor.value) {
      pObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          photoWallVisible.value = true
          pObserver?.disconnect()
        }
      }, { rootMargin: '150px' })
      pObserver.observe(photoWallAnchor.value)
    }

    if (messageWallAnchor.value) {
      mObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          messageWallVisible.value = true
          mObserver?.disconnect()
        }
      }, { rootMargin: '150px' })
      mObserver.observe(messageWallAnchor.value)
    }

    if (highlightsAnchor.value) {
      hObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          highlightsVisible.value = true
          hObserver?.disconnect()
        }
      }, { rootMargin: '150px' })
      hObserver.observe(highlightsAnchor.value)
    }
  } else {
    photoWallVisible.value = true
    messageWallVisible.value = true
    highlightsVisible.value = true
  }
})

onUnmounted(() => {
  disposed = true
  pObserver?.disconnect()
  mObserver?.disconnect()
  hObserver?.disconnect()
  pObserver = null
  mObserver = null
  hObserver = null
})
</script>

<style scoped>
/* ── Loading & Error ── */
.student-loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-9) var(--space-5);
}

.student-error-container {
  padding: var(--space-9) var(--space-5);
}

/* ── Owner Page ── */
.owner-page {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100vh;
}

.owner-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* ── Hero Section ── */
.student-hero {
  position: relative;
  min-height: 50vh;
  display: flex;
  align-items: flex-end;
  padding: calc(var(--nav-height) + var(--space-7)) 0 var(--space-7);
  overflow: hidden;
}

.student-hero__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(28, 25, 23, 0.8) 100%);
  z-index: 1;
}

.student-hero__content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  width: 100%;
}

.student-hero__avatar {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 4px solid var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.student-hero__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.student-hero__avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--bg-soft), var(--bg-raised));
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
}

.student-hero__owner-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--gold), #a07830);
  border-radius: 50%;
  color: var(--bg-raised);
  box-shadow: var(--shadow-sm);
}

.hero-support {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  color: var(--text-inverse);
}

.student-hero__name {
  font-family: var(--font-display);
  font-size: var(--type-display-md);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  color: var(--bg-raised);
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.student-hero__nickname {
  font-size: var(--type-body-lg);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
  margin: 0;
}

.student-hero__motto {
  font-size: var(--type-body-md);
  font-style: italic;
  color: var(--text-secondary);
  margin: 0;
  max-width: 480px;
}

.student-hero__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.student-hero__tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: var(--glass-panel);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(12px);
  color: var(--text-primary);
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  backdrop-filter: blur(4px);
}

.student-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.student-hero__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--glass-panel);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--bg-raised);
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo);
  backdrop-filter: blur(4px);
}

.student-hero__action:hover {
  background: var(--bg-soft);
  border-color: var(--glass-border);
}

.student-hero__action--secondary {
  background: transparent;
}

/* ── Body ── */
.student-body {
  padding-top: var(--space-7);
  padding-bottom: var(--space-9);
}

/* ── Profile Sections ── */
.profile-section {
  margin-bottom: var(--space-7);
  padding: var(--space-6);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--duration-normal) var(--ease-out-expo),
    border-color var(--duration-normal) var(--ease-out-expo);
}

.profile-section:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

.profile-section__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.profile-section__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.profile-section__title {
  font-size: var(--type-title-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
  margin: 0;
}

/* ── Identity (clean grid) ── */
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--bg-soft);
  border-radius: var(--radius-md);
  transition: background-color var(--duration-fast) var(--ease-out-expo);
}

.info-item:hover {
  background: var(--accent-soft);
}

.info-item__label {
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.info-item__value {
  font-size: var(--type-body-md);
  color: var(--text-primary);
  font-weight: var(--weight-medium);
}

/* ── Contact (cards) ── */
.info-grid--cards {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.info-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
  background: var(--bg-soft);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--accent);
  transition: transform var(--duration-fast) var(--ease-out-expo);
}

.info-card:hover {
  transform: translateY(-2px);
}

.info-card__label {
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.info-card__value {
  font-size: var(--type-body-md);
  color: var(--text-primary);
  font-weight: var(--weight-medium);
}

/* ── Personality (tag cloud) ── */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.tag-cloud__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-soft);
  border-radius: var(--radius-lg);
  flex: 1;
  min-width: 160px;
  max-width: 280px;
}

.tag-cloud__label {
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.tag-cloud__value {
  font-size: var(--type-body-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

/* ── Interests (chips) ── */
.interest-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.interest-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--bg-soft);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  transition: border-color var(--duration-fast) var(--ease-out-expo);
}

.interest-chip:hover {
  border-color: var(--accent);
}

.interest-chip__label {
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
}

.interest-chip__value {
  font-size: var(--type-body-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
}

/* ── Memories (quotes) ── */
.memory-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.memory-quote {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--bg-soft);
  border-radius: var(--radius-md);
}

.memory-quote__accent {
  width: 3px;
  background: linear-gradient(180deg, var(--accent), var(--gold));
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}

.memory-quote__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
}

.memory-quote__label {
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.memory-quote__value {
  font-size: var(--type-body-md);
  color: var(--text-primary);
  line-height: var(--leading-relaxed);
  font-style: italic;
}

/* ── Future (timeline) ── */
.timeline-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-left: var(--space-4);
  border-left: 2px solid var(--border);
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  position: relative;
  padding-left: var(--space-3);
}

.timeline-item__dot {
  position: absolute;
  left: calc(var(--space-4) * -1 - 5px);
  top: 6px;
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid var(--bg-surface);
}

.timeline-item__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.timeline-item__label {
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.timeline-item__value {
  font-size: var(--type-body-md);
  color: var(--text-primary);
  font-weight: var(--weight-medium);
}

/* ── Profile Modules ── */
.profile-modules {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profile-module {
  padding: var(--space-5);
  background: var(--bg-soft);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--gold);
}

.profile-module__title {
  font-size: var(--type-title-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--space-3) 0;
}

.profile-module__content {
  font-size: var(--type-body-md);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  white-space: pre-wrap;
  margin: 0;
}

/* ── Seal Area ── */
.seal-area {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-8);
  padding-top: var(--space-5);
  border-top: 1px solid var(--border);
}

.visits {
  font-size: var(--type-body-sm);
  color: var(--text-muted);
}

.visits span {
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.seal {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: var(--weight-semibold);
  color: var(--error);
  border: 2px solid var(--error);
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  transform: rotate(-12deg);
  opacity: 0.75;
}

/* ── Lazy Anchor ── */
.lazy-anchor {
  min-height: 200px;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .student-hero {
    min-height: auto;
    padding: calc(var(--nav-height) + var(--space-5)) 0 var(--space-5);
  }

  .student-hero__content {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .student-hero__avatar {
    width: 96px;
    height: 96px;
  }

  .student-hero__name {
    font-size: var(--type-title-lg);
  }

  .student-hero__actions {
    justify-content: center;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .info-grid--cards {
    grid-template-columns: 1fr;
  }

  .tag-cloud__item {
    min-width: auto;
    max-width: none;
  }

  .profile-section {
    padding: var(--space-5);
  }

  .seal-area {
    flex-direction: column;
    gap: var(--space-3);
    align-items: center;
  }
}

@media (min-width: 960px) {
  .student-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
