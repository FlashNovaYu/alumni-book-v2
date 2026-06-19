<template>
  <div v-if="loading" class="student-loading-container">
    <div class="skeleton-avatar"></div>
    <div class="skeleton-line" style="width: 120px; height: 24px; margin-top: 16px;"></div>
    <div class="skeleton-line" style="width: 180px; height: 16px; margin-top: 12px;"></div>
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
    <div v-else class="student-page">
      <!-- Student Hero Section -->
      <section class="student-hero">
        <div class="hero-bg" :style="bgStyle"></div>
        <div class="hero-content container">
          <div class="hero-avatar">
            <img v-if="avatarSrc && !avatarError" :src="avatarSrc" :alt="student.name" loading="eager" decoding="async" style="aspect-ratio: 1" @error="avatarError = true" />
            <span v-else class="avatar-char">{{ student.name.charAt(0) }}</span>
          </div>
          <h1 class="hero-name display-md">{{ student.name }}</h1>
          <p v-if="student.info?.nickname" class="hero-nickname">「 {{ student.info.nickname }} 」</p>
          <p v-if="student.info?.motto" class="hero-motto">「 {{ student.info.motto }} 」</p>
          <span v-if="student.isOwner" class="owner-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            专属页面
          </span>
        </div>
      </section>

      <!-- Student Body Content -->
      <div class="student-body container fade-in">
        <!-- 基础信息 -->
        <section v-if="hasFields(basicFields)" class="profile-section" data-info-section="基础信息">
          <h2 class="section-title display-sm">基础信息</h2>
          <div class="info-grid">
            <div v-for="f in basicFields" :key="f.key" v-show="f.value" class="info-item">
              <span class="info-label">{{ f.label }}</span>
              <span class="info-value">{{ f.value }}</span>
            </div>
          </div>
        </section>

        <!-- 联系方式 -->
        <section v-if="hasFields(contactFields)" class="profile-section" data-info-section="联系方式">
          <h2 class="section-title display-sm">联系方式</h2>
          <div class="info-grid">
            <div v-for="f in contactFields" :key="f.key" v-show="f.value" class="info-item">
              <span class="info-label">{{ f.label }}</span>
              <span class="info-value">{{ f.value }}</span>
            </div>
          </div>
        </section>

        <!-- 个性标签 -->
        <section v-if="hasFields(personalityFields)" class="profile-section" data-info-section="个性标签">
          <h2 class="section-title display-sm">个性标签</h2>
          <div class="info-grid">
            <div v-for="f in personalityFields" :key="f.key" v-show="f.value" class="info-item">
              <span class="info-label">{{ f.label }}</span>
              <span class="info-value">{{ f.value }}</span>
            </div>
          </div>
        </section>

        <!-- 兴趣爱好 -->
        <section v-if="hasFields(interestFields)" class="profile-section" data-info-section="兴趣爱好">
          <h2 class="section-title display-sm">兴趣爱好</h2>
          <div class="info-grid">
            <div v-for="f in interestFields" :key="f.key" v-show="f.value" class="info-item">
              <span class="info-label">{{ f.label }}</span>
              <span class="info-value">{{ f.value }}</span>
            </div>
          </div>
        </section>

        <!-- 校园回忆 -->
        <section v-if="hasFields(memoryFields)" class="profile-section" data-info-section="校园回忆">
          <h2 class="section-title display-sm">校园回忆</h2>
          <div class="memory-list">
            <div v-for="f in memoryFields" :key="f.key" v-show="f.value" class="info-item">
              <span class="info-label">{{ f.label }}</span>
              <span class="info-value">{{ f.value }}</span>
            </div>
          </div>
        </section>

        <!-- 未来规划 -->
        <section v-if="hasFields(futureFields)" class="profile-section" data-info-section="未来规划">
          <h2 class="section-title display-sm">未来规划</h2>
          <div class="info-grid">
            <div v-for="f in futureFields" :key="f.key" v-show="f.value" class="info-item">
              <span class="info-label">{{ f.label }}</span>
              <span class="info-value">{{ f.value }}</span>
            </div>
          </div>
        </section>

        <!-- 个人小传模块 -->
        <section v-if="student.info?.profileModules?.length" class="profile-section">
          <h2 class="section-title display-sm">个人小传</h2>
          <div class="profile-modules-list">
            <div v-for="(mod, idx) in student.info.profileModules" :key="idx" class="profile-module-item card mb-4 p-4">
              <h3 class="font-display text-lg mb-2">{{ mod.title }}</h3>
              <p class="whitespace-pre-wrap">{{ mod.content }}</p>
            </div>
          </div>
        </section>

        <!-- 照片墙 -->
        <section v-if="student.photos?.length" class="profile-section">
          <h2 class="section-title display-sm">照片墙</h2>
          <PhotoWall :photos="student.photos" :apiBase="apiBase" />
        </section>

        <!-- 留言板 -->
        <MessageWall :studentSlug="student.slug" :apiBase="apiBase" />

        <!-- 底部签章 -->
        <div class="seal-area fade-in">
          <span class="visits">浏览 <span>{{ student.visitCount || 0 }}</span> 次</span>
          <span class="seal">留念</span>
        </div>
      </div>

      <!-- 自助编辑入口 -->
      <SelfEditPanel :studentSlug="student.slug" :studentName="student.name" :apiBase="apiBase" />

      <!-- 分享按钮触发器 -->
      <div class="share-trigger-container">
        <button class="share-trigger-btn" @click="openShareModal">分享 TA</button>
      </div>

      <!-- 分享卡 Modal -->
      <div v-if="shareOpen" class="share-modal">
        <div class="share-modal-overlay" @click="closeShareModal"></div>
        <div class="share-card card">
          <button class="share-close-btn" @click="closeShareModal">✕</button>
          <div class="share-card-content">
            <div class="share-avatar-wrapper">
              <img v-if="avatarSrc" :src="avatarSrc" class="share-avatar" />
              <span v-else class="avatar-char share-avatar-placeholder">{{ student.name.charAt(0) }}</span>
            </div>
            <h3 class="share-name">{{ student.name }}</h3>
            <p class="share-motto">{{ student.info?.motto || '一句话故事' }}</p>
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
    </div>

    <!-- 背景音乐悬浮播放器 -->
    <div v-if="student.musicUrl" class="music-player-widget no-print">
      <button class="music-toggle-btn" :class="{ playing: musicPlaying }" @click="toggleMusic" :title="student.musicTitle || '背景音乐'">
        <span class="music-icon">🎵</span>
      </button>
      <transition name="fade">
        <span v-if="showMusicTip" class="music-tip">点击播放背景音乐</span>
      </transition>
      <audio ref="audioRef" :src="getPhotoUrl(student.musicUrl)" loop preload="auto" @play="onMusicPlay" @pause="onMusicPause"></audio>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import PhotoWall from './PhotoWall.vue'
import MessageWall from './MessageWall.vue'
import SelfEditPanel from './SelfEditPanel.vue'

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
}>()

const student = ref<Student | null>(props.initialStudent)
const loading = ref(!props.initialStudent)
const shareOpen = ref(false)
const copySuccess = ref(false)
const audioRef = ref<HTMLAudioElement | null>(null)
const musicPlaying = ref(false)
const showMusicTip = ref(false)
const avatarError = ref(false)

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

const qrCodeSrc = computed(() => {
  const pageUrl = encodeURIComponent(window.location.href)
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${pageUrl}`
})

function getPhotoUrl(r2Key: string) {
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
function printPage() { window.print() }

function toggleMusic() {
  if (!audioRef.value) return
  if (musicPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play().catch(err => {
      console.warn('Playback prevented:', err)
      showMusicTip.value = true
      setTimeout(() => { showMusicTip.value = false }, 5000)
    })
  }
}
function onMusicPlay() { musicPlaying.value = true; showMusicTip.value = false }
function onMusicPause() { musicPlaying.value = false }

function copyShareLink() {
  const url = window.location.href
  navigator.clipboard.writeText(url).then(() => {
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  }).catch(() => {
    alert('无法自动复制，请手动复制浏览器地址栏的链接。')
  })
}

const hasAnimated = ref(false)
let gsapCtx: any = null

function triggerGSAPAnimations() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) {
    nextTick(() => {
      import('gsap').then(({ default: gsap }) => {
        gsap.set('.student-body > .fade-in', { autoAlpha: 1, y: 0 })
      })
    })
    return
  }

  if (hasAnimated.value) return
  hasAnimated.value = true

  nextTick(() => {
    import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
      import('gsap').then(({ default: gsap }) => {
        gsap.registerPlugin(ScrollTrigger)
        if (gsapCtx) {
          gsapCtx.revert()
        }
        gsapCtx = gsap.context(() => {
          // Hero 背景视差
          gsap.to('.hero-bg', {
            y: 60, ease: 'none',
            scrollTrigger: { trigger: '.student-hero', start: 'top top', end: 'bottom top', scrub: true },
          })

          // Info section 依次滑入
          const sections = gsap.utils.toArray<HTMLElement>('.student-body > .fade-in')
          sections.forEach((el) => {
            gsap.from(el, {
              autoAlpha: 0, y: 24, duration: 0.5,
              scrollTrigger: { trigger: el, start: 'top 85%', once: true },
            })
          })
        })
      })
    })
  })
}

onMounted(async () => {
  if (!slugVal.value) {
    loading.value = false
    return
  }
  // 主站 SWR 水合获取数据
  try {
    const res = await fetch(`${props.apiBase}/api/students/${slugVal.value}?audience=public`)
    const data = await res.json()
    if (data.success && data.data) {
      student.value = data.data
      triggerGSAPAnimations()
    }
  } catch (e) {
    console.error('Failed to sync student detail via SWR:', e)
  } finally {
    loading.value = false
  }

  // 访问计数（同一会话内同一页面只计一次）
  const visitKey = `visited_${slugVal.value}`
  if (!sessionStorage.getItem(visitKey)) {
    sessionStorage.setItem(visitKey, '1')
    fetch(`${props.apiBase}/api/students/${slugVal.value}/visit`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.success && student.value) {
          student.value.visitCount = d.data.visitCount
        }
      })
      .catch(() => {})
  }

  // 若初始即有静态直出数据，先跑一次动画
  if (student.value) {
    triggerGSAPAnimations()
  }

  // 尝试自动播放背景音乐
  nextTick(() => {
    if (audioRef.value && student.value?.musicAutoplay) {
      audioRef.value.play().then(() => {
        musicPlaying.value = true
      }).catch(err => {
        console.log('Autoplay prevented by browser, showing play prompt:', err)
        showMusicTip.value = true
        setTimeout(() => { showMusicTip.value = false }, 6000)
      })
    }
  })
})

onUnmounted(() => {
  if (gsapCtx) {
    gsapCtx.revert()
  }
})
</script>

<style scoped>
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

.student-hero {
  position: relative;
  padding: var(--spacing-xxl) 0;
  text-align: center;
  background-color: var(--color-surface-soft);
  overflow: hidden;
}
.hero-bg { position: absolute; inset: 0; z-index: 0; opacity: 0.15; }
.hero-content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: var(--spacing-sm); }
.hero-avatar {
  width: 96px; height: 96px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-surface-card), var(--color-hairline));
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--color-hairline);
  margin-bottom: var(--spacing-sm);
}
.hero-avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-char { font-family: var(--font-display); font-size: 40px; font-weight: 500; color: var(--color-muted); }
.hero-nickname, .hero-motto { font-size: var(--type-body-md-size); color: var(--color-muted); font-style: italic; }
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
  padding-top: var(--spacing-section);
  padding-bottom: var(--spacing-section);
}

.profile-section { margin-bottom: var(--spacing-section); }
.section-title {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-hairline);
}
.info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md); }
.memory-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
.info-item { padding: var(--spacing-sm) 0; }
.info-label { display: block; font-size: var(--type-body-sm-size); font-weight: 500; color: var(--color-muted); margin-bottom: var(--spacing-xxs); }
.info-value { font-size: var(--type-body-md-size); color: var(--color-ink); }

.profile-module-item {
  background: var(--color-surface-card);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
}

.seal-area {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--spacing-xxl);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-hairline);
}
.visits { font-size: var(--type-body-sm-size); color: var(--color-muted); }
.seal {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--color-error);
  border: 2px solid var(--color-error);
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

.share-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.share-modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(2px);
}
.share-card {
  position: relative;
  z-index: 1;
  width: 90%;
  max-width: 320px;
  background: var(--color-surface-card);
  padding: var(--spacing-xl);
  border-radius: var(--rounded-lg);
  text-align: center;
}
.share-close-btn {
  position: absolute;
  right: var(--spacing-md);
  top: var(--spacing-md);
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: var(--color-muted);
}
.share-avatar-wrapper {
  width: 64px; height: 64px;
  border-radius: 50%;
  overflow: hidden;
  margin: 0 auto var(--spacing-md);
  border: 2px solid var(--color-hairline);
  background: var(--color-surface-soft);
  display: flex; align-items: center; justify-content: center;
}
.share-avatar { width: 100%; height: 100%; object-fit: cover; }
.share-avatar-placeholder { font-size: var(--type-display-sm-size); font-weight: bold; color: var(--color-muted); }
.share-name { font-size: 18px; margin-bottom: var(--spacing-xs); }
.share-motto { font-size: 13px; color: var(--color-muted); font-style: italic; margin-bottom: var(--spacing-lg); }
.share-qr-wrapper {
  background: #fbfbfa;
  padding: var(--spacing-md);
  border-radius: var(--rounded-md);
  border: 1px dashed var(--color-hairline);
  display: flex; flex-direction: column; align-items: center; gap: var(--spacing-xs);
}
.share-qr { width: 110px; height: 110px; }
.share-qr-tip { font-size: 11px; color: var(--color-muted); }

@media (max-width: 768px) {
  .info-grid { grid-template-columns: 1fr; }
}

.share-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}

/* 音乐悬浮控件 */
.music-player-widget {
  position: fixed;
  left: var(--spacing-lg);
  bottom: var(--spacing-lg);
  z-index: 99;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}
.music-toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--color-surface-card);
  box-shadow: var(--shadow-elevated, 0 4px 12px rgba(0,0,0,0.15));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  transition: transform var(--duration-fast), background var(--duration-fast);
}
.music-toggle-btn:hover {
  transform: scale(1.05);
}
.music-toggle-btn:active {
  transform: scale(0.95);
}
.music-toggle-btn.playing {
  animation: spin 3s linear infinite;
  background: var(--color-primary-soft, #fcf4f2);
  border: 1px solid var(--color-primary);
}
.music-icon {
  font-size: 16px;
}
.music-tip {
  font-size: 11px;
  background: rgba(0,0,0,0.75);
  color: #fff;
  padding: 6px 12px;
  border-radius: 14px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
