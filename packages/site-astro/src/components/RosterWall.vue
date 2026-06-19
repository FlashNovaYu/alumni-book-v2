<template>
  <div>
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
            v-if="mate.avatarUrl"
            :src="getAvatarUrl(mate.avatarUrl)"
            :alt="mate.name"
            loading="lazy"
            decoding="async"
            style="aspect-ratio: 1"
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
import { ref, computed, onMounted, nextTick, watch } from 'vue'

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
  return `${props.apiBase}${url}`
}

function triggerAnimations() {
  nextTick(() => {
    import('gsap/ScrollTrigger').then(() => {
      import('gsap').then(({ default: gsap }) => {
        const cards = gsap.utils.toArray<HTMLElement>('.classmate-card')
        if (cards.length) {
          gsap.set(cards, { autoAlpha: 0, y: 30 })
          gsap.to(cards, {
            autoAlpha: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.03,
            ease: 'back.out(1.5)',
            overwrite: 'auto'
          })
        }
      })
    })
  })
}

onMounted(async () => {
  // 首次装载触发入场动画
  triggerAnimations()

  try {
    const res = await fetch(`${props.apiBase}/api/classmates`)
    const data = await res.json()
    if (data.success && data.data) {
      classmates.value = data.data
      // 数据更新后再次平滑同步动画
      triggerAnimations()
    }
  } catch (e) {
    console.error('Failed to sync classmates list via SWR:', e)
  }
})

// 监听关键词变化以在搜索结果变化后平滑重跑入场动画
watch(keyword, () => {
  triggerAnimations()
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
