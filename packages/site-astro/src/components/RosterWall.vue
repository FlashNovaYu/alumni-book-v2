<template>
  <div ref="rootRef">
    <!-- 搜索栏 -->
    <div class="search-box mb-4">
      <input
        v-model="keyword"
        type="text"
        class="text-input search-input"
        placeholder="搜索同学姓名、昵称、学校、座右铭…"
        autocomplete="off"
      />
      <p v-if="keyword.trim()" class="search-count">找到 {{ filteredClassmates.length }} 位同学</p>
    </div>

    <!-- 同学列表网格 -->
    <div class="classmate-grid">
      <a
        v-for="mate in filteredClassmates"
        :key="mate.slug"
        :href="mate.hasPage ? href(`/student/${mate.slug}`) : '#'"
        class="classmate-card"
        :class="{ 'no-page': !mate.hasPage }"
      >
        <div class="card-avatar">
          <img
            v-if="mate.avatarUrl && !avatarErrors[mate.slug]"
            :src="getAvatarUrl(mate.avatarUrl)"
            :alt="mate.name"
            loading="lazy"
            decoding="async"
            style="aspect-ratio: 1"
            @error="avatarErrors[mate.slug] = true"
          />
          <span v-else class="avatar-char">{{ mate.name.charAt(0) }}</span>
        </div>
        <div class="card-name title-sm">{{ mate.name }}</div>
        <div class="card-motto">{{ mate.hasPage ? (mate.motto || '点击查看 TA 的故事') : '页面待建' }}</div>
      </a>
    </div>

    <!-- 空状态 -->
    <div v-if="filteredClassmates.length === 0" class="empty-state">
      <p>未找到匹配的同学</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { prefersReducedMotion } from '../utils/motion'
import { runWhenIdle, isDeepEqual } from '../utils/deferredFetch'

interface Classmate {
  name: string
  slug: string
  hasPage: boolean
  avatarUrl: string | null
  motto: string
  nickname?: string
  school?: string
  className?: string
  mbti?: string
}

const props = defineProps<{
  initialClassmates: Classmate[]
  apiBase: string
  siteBase: string
}>()

const classmates = ref<Classmate[]>([...props.initialClassmates])
const keyword = ref('')
const hasAnimated = ref(false)
const avatarErrors = ref<Record<string, boolean>>({})

const rootRef = ref<HTMLElement | null>(null)
let gsapCtx: any = null

const href = (path: string) => `${props.siteBase}${path.replace(/^\/+/, '')}`

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

function getAvatarUrl(url: string) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  // 相册/卡片图 使用 160px 的较小头像以节省首屏图片资源
  if (url.includes('avatars/')) {
    // 假设后端支持缩略图格式后缀 (例如 _160x160)，这里如果后端目前不支持，就降级回原图
    // 为了防止破图，我们还是用原图，稍后可以在 image 优化任务中统一加后缀逻辑
  }
  return `${props.apiBase}${url}`
}

function triggerAnimations(force = false) {
  if (prefersReducedMotion()) {
    nextTick(() => {
      import('gsap').then(({ default: gsap }) => {
        if (!rootRef.value) return
        const cards = rootRef.value.querySelectorAll('.classmate-card')
        gsap.set(cards, { autoAlpha: 1, y: 0 })
      })
    })
    return
  }

  if (hasAnimated.value && !force) return
  hasAnimated.value = true

  nextTick(() => {
    import('gsap/ScrollTrigger').then(() => {
      import('gsap').then(({ default: gsap }) => {
        if (!rootRef.value) return
        if (gsapCtx) gsapCtx.revert()

        gsapCtx = gsap.context((self) => {
          const cards = self.selector('.classmate-card')
          if (cards.length) {
            gsap.set(cards, { autoAlpha: 0, y: 24 })
            gsap.to(cards, {
              autoAlpha: 1,
              y: 0,
              duration: 0.45,
              stagger: 0.02,
              ease: 'power2.out',
              overwrite: 'auto'
            })
          }
        }, rootRef.value)
      })
    })
  })
}

onMounted(() => {
  // 首次装载触发入场动画
  triggerAnimations()

  // 避免首屏高并发阻塞，改为 idle 空闲时静默刷新 SWR 数据
  runWhenIdle(async () => {
    try {
      const res = await fetch(`${props.apiBase}/api/classmates`)
      const data = await res.json()
      if (data.success && data.data) {
        // 使用深度对比。如果数据没变，绝对不重新赋值引起 DOM 闪动或重绘
        if (!isDeepEqual(data.data, classmates.value)) {
          classmates.value = data.data
          // 数据发生变化，我们对新增元素以 force 形式重新播放入场（或者轻量渐入）
          triggerAnimations(true)
        }
      }
    } catch (e) {
      console.error('Failed to sync classmates list via SWR:', e)
    }
  })
})

onUnmounted(() => {
  if (gsapCtx) {
    gsapCtx.revert()
  }
})

// 监听关键词变化时不强行重播大面积飞入动画，防止输入时卡顿和闪烁
watch(keyword, () => {
  // 仅在必要时允许轻量更新，此处不需要重设透明度，跳过 triggerAnimations
})
</script>

<style scoped>
.search-box {
  max-width: 500px;
  margin: 0 auto var(--spacing-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
}
.search-input {
  width: 100%;
  text-align: center;
  font-size: 15px;
  height: 44px;
}
.search-count {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
}
.classmate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-lg);
}
.classmate-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-lg) var(--spacing-md);
  background-color: var(--color-surface-card);
  border-radius: var(--rounded-lg);
  text-decoration: none;
  color: inherit;
  transition: transform var(--duration-normal) var(--ease-out-quart),
              box-shadow var(--duration-normal) var(--ease-out-quart);
}
.classmate-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card-hover);
}
.classmate-card.no-page {
  opacity: 0.55;
  pointer-events: none;
}
.card-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-surface-cream-strong), var(--color-hairline));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-sm);
  border: 2px solid var(--color-hairline);
}
.card-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-char {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  color: var(--color-muted);
}
.card-name {
  margin-bottom: var(--spacing-xxs);
  text-align: center;
}
.card-motto {
  font-size: var(--type-body-sm-size);
  color: var(--color-muted);
  text-align: center;
  font-style: italic;
}
.empty-state {
  text-align: center;
  padding: var(--spacing-xxl);
  color: var(--color-muted);
}
@media (max-width: 768px) {
  .classmate-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-md);
  }
  .card-avatar {
    width: 58px;
    height: 58px;
  }
}
</style>
