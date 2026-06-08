<template>
  <div class="search-box">
    <input v-model="keyword" type="text" class="text-input search-input" placeholder="搜索同学姓名…" autocomplete="off" />
    <p v-if="keyword" class="search-count">找到 {{ filteredCount }} 位同学</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Classmate {
  name: string
  slug: string
  hasPage: boolean
  avatarUrl: string | null
  motto: string
}

const props = defineProps<{
  classmates: Classmate[]
}>()

const keyword = ref('')
const filteredCount = ref(props.classmates.length)

watch(keyword, () => {
  const kw = keyword.value.trim().toLowerCase()
  const cards = document.querySelectorAll('.classmate-card')
  let count = 0
  cards.forEach(card => {
    const name = card.getAttribute('data-search-name')?.toLowerCase() || ''
    const nickname = card.getAttribute('data-search-nickname')?.toLowerCase() || ''
    const school = card.getAttribute('data-search-school')?.toLowerCase() || ''
    const className = card.getAttribute('data-search-class')?.toLowerCase() || ''
    const motto = card.getAttribute('data-search-motto')?.toLowerCase() || ''
    const mbti = card.getAttribute('data-search-mbti')?.toLowerCase() || ''
    
    const show = !kw || 
      name.includes(kw) || 
      nickname.includes(kw) || 
      school.includes(kw) || 
      className.includes(kw) || 
      motto.includes(kw) || 
      mbti.includes(kw)

    if (show) {
      ;(card as HTMLElement).classList.remove('card-hidden')
      ;(card as HTMLElement).style.display = ''
      count++
    } else {
      ;(card as HTMLElement).classList.add('card-hidden')
      setTimeout(() => {
        if ((card as HTMLElement).classList.contains('card-hidden')) {
          ;(card as HTMLElement).style.display = 'none'
        }
      }, 200)
    }
  })
  filteredCount.value = count
})
</script>

<style scoped>
.search-box { max-width: 480px; margin: 0 auto var(--spacing-xl); text-align: center; }
.search-input { text-align: center; }
.search-count { margin-top: var(--spacing-xs); font-size: var(--type-body-sm-size); color: var(--color-muted); }
</style>
