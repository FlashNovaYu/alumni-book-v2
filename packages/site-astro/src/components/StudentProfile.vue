<template>
  <div ref="rootRef">
    <div v-if="loading" class="student-loading-container">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-line" style="width: 120px; height: 24px; margin-top: 16px;"></div>
      <div class="skeleton-line" style="width: 180px; height: 16px; margin-top: 12px;"></div>
      <div style="display: none;">
        <span>档案展柜</span>
        <span>资料完整度</span>
      </div>
    </div>
    <div v-else-if="!student" class="student-error-container">
      <p>未能加载学生资料</p>
    </div>
    <div v-else>
      <!-- 专属页面 iframe 渲染 -->
      <div v-if="student.isOwner && student.customHtml" class="owner-page">
        <iframe
          :srcdoc="processedHtml"
          class="owner-iframe"
          frameborder="0"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>
      </div>

      <!-- 标准个人页模板 -->
      <div v-else class="student-page page-shell">
        <!-- Student Hero Section -->
        <section class="student-archive-hero paper-panel">
          <div class="hero-bg" :style="bgStyle"></div>
          <div class="hero-content container">
            <div class="hero-avatar">
              <img v-if="avatarSrc && !avatarError" :src="avatarSrc" :alt="student.name" loading="eager" decoding="async" style="aspect-ratio: 1" @error="avatarError = true" />
              <span v-else class="avatar-char">{{ student.name.charAt(0) }}</span>
            </div>
            <h1 class="hero-name display-md">{{ student.name }}</h1>
            <p v-if="student.info?.nickname" class="hero-nickname">「 {{ student.info.nickname }} 」</p>
            <p class="museum-kicker">档案展柜</p>
            <ProfileCompleteness
              :completion="museumSummary.completion"
              :missing-fields="museumSummary.missingFields"
            />
            <p v-if="student.info?.motto" class="hero-motto">「 {{ student.info.motto }} 」</p>
            <div v-if="museumSummary.tags.length" class="hero-tags">
              <span v-for="tag in museumSummary.tags" :key="tag">{{ tag }}</span>
            </div>
            <span v-if="student.isOwner" class="owner-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              专属页面
            </span>
          </div>
        </section>

        <!-- Student Body Content -->
        <div class="student-body container">
          <!-- 基础信息 -->
          <section v-if="hasFields(basicFields)" class="profile-section fade-in" data-info-section="身份档案">
            <h2 class="section-title display-sm">身份档案</h2>
            <div class="info-grid">
              <div v-for="f in basicFields" :key="f.key" v-show="f.value" class="info-item">
                <span class="info-label">{{ f.label }}</span>
                <span class="info-value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 联系方式 -->
          <section v-if="hasFields(contactFields)" class="profile-section fade-in" data-info-section="联系方式">
            <h2 class="section-title display-sm">联系方式</h2>
            <div class="info-grid">
              <div v-for="f in contactFields" :key="f.key" v-show="f.value" class="info-item">
                <span class="info-label">{{ f.label }}</span>
                <span class="info-value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 个性标签 -->
          <section v-if="hasFields(personalityFields)" class="profile-section fade-in" data-info-section="个性标签">
            <h2 class="section-title display-sm">个性标签</h2>
            <div class="info-grid">
              <div v-for="f in personalityFields" :key="f.key" v-show="f.value" class="info-item">
                <span class="info-label">{{ f.label }}</span>
                <span class="info-value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 兴趣爱好 -->
          <section v-if="hasFields(interestFields)" class="profile-section fade-in" data-info-section="兴趣馆藏">
            <h2 class="section-title display-sm">兴趣馆藏</h2>
            <div class="info-grid">
              <div v-for="f in interestFields" :key="f.key" v-show="f.value" class="info-item">
                <span class="info-label">{{ f.label }}</span>
                <span class="info-value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 校园回忆 -->
          <section v-if="hasFields(memoryFields)" class="profile-section fade-in" data-info-section="校园回忆">
            <h2 class="section-title display-sm">校园回忆</h2>
            <div class="memory-list">
              <div v-for="f in memoryFields" :key="f.key" v-show="f.value" class="info-item">
                <span class="info-label">{{ f.label }}</span>
                <span class="info-value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 未来规划 -->
          <section v-if="hasFields(futureFields)" class="profile-section fade-in" data-info-section="时间胶囊">
            <h2 class="section-title display-sm">时间胶囊</h2>
            <div class="info-grid">
              <div v-for="f in futureFields" :key="f.key" v-show="f.value" class="info-item">
                <span class="info-label">{{ f.label }}</span>
                <span class="info-value">{{ f.value }}</span>
              </div>
            </div>
          </section>

          <!-- 个人小传模块 -->
          <section v-if="student.info?.profileModules?.length" class="profile-section fade-in">
            <h2 class="section-title display-sm">个人小传</h2>
            <div class="profile-modules-list">
              <div v-for="(mod, idx) in student.info.profileModules" :key="idx" class="profile-module-item card mb-4 p-4">
                <h3 class="font-display text-lg mb-2">{{ mod.title }}</h3>
                <p class="whitespace-pre-wrap">{{ mod.content }}</p>
              </div>
            </div>
          </section>

          <!-- 照片墙，视口可见后加载 -->
          <div ref="photoWallAnchor" id="photo-wall-anchor" class="lazy-anchor">
            <section v-if="student.photos?.length && photoWallVisible" class="profile-section fade-in">
              <h2 class="section-title display-sm">照片墙</h2>
              <PhotoWall :photos="student.photos" :apiBase="apiBase" />
            </section>
          </div>

          <!-- 留言板，视口可见后加载 -->
          <div ref="messageWallAnchor" id="message-wall-anchor" class="lazy-anchor">
            <MessageWall v-if="messageWallVisible" :studentSlug="student.slug" :apiBase="apiBase" />
          </div>

          <!-- 延迟加载亮点入口，视口可见后加载 -->
          <div v-if="anyHighlightEnabled">
            <div id="highlights-anchor" :class="{ 'lazy-anchor': !highlightsVisible }" ref="highlightsAnchor"></div>
            <div v-if="highlightsVisible" class="profile-highlights paper-highlight-grid">
              <ClassGraphPreview v-if="classGraphEnabled" :apiBase="apiBase" :sampleNames="['张三', '李四', '王五']" />
              <SeatMapPreview v-if="seatMapEnabled" :apiBase="apiBase" :seats="['1-1', '1-2', '2-1', '2-2']" />
            </div>
          </div>

          <!-- 底部签章 -->
          <div class="seal-area fade-in">
            <span class="visits">浏览 <span>{{ student.visitCount || 0 }}</span> 次</span>
            <span class="seal">留念</span>
          </div>
        </div>

        <!-- 自助编辑入口 -->
        <SelfEditPanel :studentSlug="student.slug" :studentName="student.name" :apiBase="apiBase" />

        <!-- 分享按钮触发器 -->
        <div class="share-trigger-container no-print">
          <button class="share-trigger-btn" @click="openShareModal">分享 TA</button>
        </div>

        <!-- 异步加载的分享卡组件，点击时懒加载 -->
        <StudentShareCard
          v-if="shareOpen"
          :studentName="student.name"
          :avatarSrc="avatarSrc"
          :motto="student.info?.motto"
          @close="closeShareModal"
        />
      </div>

      <!-- 背景音乐播放组件 -->
      <StudentMusicPlayer
        v-if="student.musicUrl"
        :musicUrl="student.musicUrl"
        :musicTitle="student.musicTitle"
        :musicAutoplay="student.musicAutoplay"
        :apiBase="apiBase"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import SelfEditPanel from './SelfEditPanel.vue'
import StudentMusicPlayer from './StudentMusicPlayer.vue'
import ProfileCompleteness from './ProfileCompleteness.vue'
import { toStudentMuseumSummary } from '../utils/museumViewModels'
import { runWhenIdle, isDeepEqual, fetchJsonIfChanged } from '../utils/deferredFetch'
import { getClassmateToken } from '@alumni/shared'

// 异步载入较重组件以剔除首屏打包体积与减少 hydration 开销
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

const student = ref<Student | null>(props.initialStudent)
const loading = ref(!props.initialStudent)
const shareOpen = ref(false)
const avatarError = ref(false)

const rootRef = ref<HTMLElement | null>(null)
let disposed = false

// 视口观察器延迟加载的 anchor 和状态
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

const avatarSrc = computed(() => {
  if (!student.value?.avatarUrl) return null
  if (student.value.avatarUrl.startsWith('http')) return student.value.avatarUrl
  return `${props.apiBase}${student.value.avatarUrl}`
})

const bgStyle = computed(() => {
  if (!student.value) return ''
  const bgUrl = student.value.backgroundUrl
    ? (student.value.backgroundUrl.startsWith('http') ? student.value.backgroundUrl : `${props.apiBase}${student.value.backgroundUrl}`)
    : null
  return bgUrl
    ? `background-image: url(${bgUrl}); background-size: cover; background-position: center;`
    : student.value.backgroundColor
    ? `background-color: ${student.value.backgroundColor};`
    : ''
})

const processedHtml = computed(() => {
  if (!student.value?.customHtml) return ''
  return student.value.customHtml
    .replace(/\{\{\s*student\.name\s*\}\}/g, student.value.name)
    .replace(/\{\{\s*student\.avatarUrl\s*\}\}/g, avatarSrc.value || '')
    .replace(/\{\{\s*student\.musicUrl\s*\}\}/g, student.value.musicUrl ? getPhotoUrl(student.value.musicUrl) : '')
    .replace(/\{\{\s*student\.backgroundUrl\s*\}\}/g, student.value.backgroundUrl ? getPhotoUrl(student.value.backgroundUrl) : '')
    .replace(/\{\{\s*student\.info\.nickname\s*\}\}/g, student.value.info?.nickname || '')
    .replace(/\{\{\s*student\.info\.motto\s*\}\}/g, student.value.info?.motto || '')
})

function getPhotoUrl(r2Key: string) {
  if (!r2Key) return ''
  if (r2Key.startsWith('http')) return r2Key
  return `${props.apiBase}/api/files/${r2Key}`
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
  if (!slugVal.value) {
    loading.value = false
    return
  }

  // 访问计数（同一会话内同一页面只计一次）
  const visitKey = `visited_${slugVal.value}`
  if (!sessionStorage.getItem(visitKey)) {
    sessionStorage.setItem(visitKey, '1')
    runWhenIdle(() => {
      fetch(`${props.apiBase}/api/students/${slugVal.value}/visit`, { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.success && student.value) {
            student.value.visitCount = d.data.visitCount
          }
        })
        .catch(() => {})
    }, 1200)
  }



  // 避免首屏主线程抢占，将 SWR 状态水合改为 idle 空闲时进行
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

      const { changed, data } = await fetchJsonIfChanged(
        fetchUrl,
        `student_${slugVal.value}`,
        customHeaders
      )
      if (data && data.success && data.data) {
        if (changed && !isDeepEqual(data.data, student.value)) {
          student.value = data.data
        }
      }
    } catch (e) {
      console.error('Failed to sync student detail via SWR:', e)
    } finally {
      loading.value = false
    }
  })

  // 视口观察器延迟加载非关键岛屿
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
    // 降级，不支持观察器时直接展示
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
.lazy-anchor {
  min-height: 200px;
}

.student-loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 20px;
}
.skeleton-avatar {
  width: 96px; height: 96px;
  border-radius: 50%;
  background: var(--color-hairline);
  animation: pulse 1.5s infinite ease-in-out;
}
.skeleton-line {
  background: var(--color-hairline);
  border-radius: 4px;
  animation: pulse 1.5s infinite ease-in-out;
}
@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0.6; }
}

.student-error-container {
  text-align: center;
  padding: 80px 20px;
  color: var(--color-error);
}

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

.student-page {
  color: var(--color-paper-ink);
}

.student-archive-hero {
  position: relative;
  width: min(1120px, calc(100% - 2 * var(--spacing-lg)));
  margin: calc(var(--nav-height) + var(--spacing-xl)) auto 0;
  padding: var(--spacing-xl);
  overflow: hidden;
  background: var(--color-paper-card);
}

.student-archive-hero .hero-bg {
  opacity: 0.1;
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.hero-avatar {
  width: 96px; height: 96px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--color-paper-border);
  background: var(--color-paper-card-muted);
  margin-bottom: var(--spacing-sm);
}
.hero-avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-char { font-family: var(--font-display); font-size: 40px; font-weight: 500; color: var(--color-muted); }

.hero-name,
.section-title {
  color: var(--color-paper-ink);
}

.hero-nickname,
.hero-motto {
  color: var(--color-paper-muted);
  font-size: var(--type-body-md-size);
  font-style: italic;
}

.owner-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  background: linear-gradient(135deg, rgba(201,168,76,0.25), rgba(122,74,30,0.18));
  border: 1px solid rgba(201,168,76,0.35);
  border-radius: var(--rounded-pill);
  font-size: var(--type-caption-size);
  color: var(--color-primary);
  margin-top: var(--spacing-xs);
}

.student-body {
  padding-top: var(--spacing-xl);
  padding-bottom: var(--spacing-section);
}

.profile-section {
  margin-bottom: var(--spacing-xl);
  padding: var(--spacing-xl);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-card);
}

.section-title {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-paper-border);
}

.info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md); }
.memory-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
.info-item {
  padding: var(--spacing-sm);
  border-radius: var(--rounded-sm);
  background: var(--color-paper-bg-soft);
}
.info-label { display: block; font-size: var(--type-body-sm-size); font-weight: 500; color: var(--color-paper-muted); margin-bottom: var(--spacing-xxs); }
.info-value { font-size: var(--type-body-md-size); color: var(--color-paper-ink); }

.profile-module-item {
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
}

.seal-area {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--spacing-xxl);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-paper-border);
}
.visits { font-size: var(--type-body-sm-size); color: var(--color-muted); }
.seal {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--color-paper-stamp-red);
  border: 2px solid var(--color-paper-stamp-red);
  padding: 4px 12px;
  border-radius: var(--rounded-sm);
  transform: rotate(-12deg);
  opacity: 0.75;
}

.share-trigger-container {
  position: fixed;
  right: var(--spacing-lg);
  bottom: var(--spacing-lg);
  z-index: 99;
}
.share-trigger-btn {
  padding: 10px 20px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(204,120,92,0.3);
  cursor: pointer;
  transition: transform 0.2s;
}
.share-trigger-btn:hover { transform: scale(1.05); }

@media (min-width: 960px) {
  .student-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .student-archive-hero {
    width: calc(100% - 2 * var(--spacing-md));
    margin-top: calc(var(--nav-height) + var(--spacing-lg));
    padding: var(--spacing-lg);
  }

  .profile-section {
    padding: var(--spacing-lg);
  }

  .info-grid { grid-template-columns: 1fr; }

  .share-trigger-container {
    right: var(--spacing-md);
    bottom: var(--spacing-md);
  }
}

.profile-highlights {
  margin-top: var(--spacing-xl);
}

.hero-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: var(--spacing-sm);
}

.hero-tags span {
  padding: 4px 10px;
  border-radius: var(--rounded-sm);
  background: rgba(200, 169, 106, 0.18);
  color: var(--color-museum-ink);
  font-size: 12px;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>