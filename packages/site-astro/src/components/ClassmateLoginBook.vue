<template>
  <div class="login-book-container fade-in">
    <div class="login-book">
      <!-- 纪念册左页：温馨回忆与回忆寄语 -->
      <div class="book-page page-left">
        <div class="page-content">
          <div class="ink-title">同学录</div>
          <div class="ink-subtitle">Class Memory Book</div>
          <div class="decorative-line"></div>
          <p class="ink-text">
            “那些被风吹散的夏天，<br/>
            被妥帖地珍藏在这本纪念册里。<br/>
            翻开它，让时光倒流，<br/>
            让我们在文字与照片的温度里重逢。”
          </p>
          <div class="doodle-plane">✈</div>
        </div>
      </div>

      <!-- 书脊阴影分界线 -->
      <div class="book-spine"></div>

      <!-- 纪念册右页：入馆凭证/登录表单 -->
      <div class="book-page page-right">
        <div class="page-content">
          <div class="form-title">验证身份</div>
          <p class="form-subtitle">请输入你的入馆凭证</p>

          <div class="login-form">
            <!-- 账号选择 (带拼音与中文搜索的自定义下拉框) -->
            <div class="form-group">
              <label class="form-label" for="student-select">选择同学账号</label>
              <div class="custom-select-wrapper" ref="selectWrapper">
                <div class="select-trigger" @click="toggleDropdown" :class="{ 'is-active': dropdownOpen }">
                  <span v-if="selectedStudent">{{ selectedStudent.name }}</span>
                  <span v-else class="placeholder">请选择你的名字</span>
                  <span class="select-arrow">▼</span>
                </div>
                
                <div v-show="dropdownOpen" class="select-dropdown">
                  <div class="dropdown-search">
                    <input
                      v-model="searchQuery"
                      type="text"
                      placeholder="输入姓名或拼音检索..."
                      class="search-input"
                      @click.stop
                    />
                  </div>
                  <ul class="dropdown-list">
                    <li
                      v-for="item in filteredClassmates"
                      :key="item.slug"
                      @click="selectClassmate(item)"
                      :class="{ 'is-selected': selectedSlug === item.slug }"
                    >
                      {{ item.name }} <span class="slug-hint">({{ item.slug }})</span>
                    </li>
                    <li v-if="filteredClassmates.length === 0" class="no-results">
                      没有找到匹配的同学
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- 密码输入框 -->
            <div class="form-group">
              <label class="form-label" for="password-input">入馆密码</label>
              <input
                id="password-input"
                v-model="password"
                type="password"
                class="text-input password-input"
                placeholder="请输入密码 (初始密码或自定义密码)"
                @keydown.enter="handleLogin"
              />
            </div>

            <div v-if="error" class="error-msg">{{ error }}</div>

            <button class="btn-primary login-btn" @click="handleLogin" :disabled="loading">
              {{ loading ? '翻阅中...' : '进入同学录' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 首次登录强制改密弹窗 -->
    <FirstLoginPasswordGuide
      v-if="showChangePasswordModal"
      :api-base="apiBase"
      :slug="selectedSlug"
      :old-password="password"
      @completed="handlePasswordChanged"
      @cancel="handlePasswordCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { classmateLogin } from '../api/classmateAuth'
import { setClassmateSession, clearClassmateSession } from '@alumni/shared'
import FirstLoginPasswordGuide from './FirstLoginPasswordGuide.vue'

interface Classmate {
  name: string
  slug: string
  avatarUrl: string | null
}

const props = defineProps<{
  apiBase: string
}>()

const classmates = ref<Classmate[]>([])
const selectedSlug = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

// 下拉搜索组件状态
const dropdownOpen = ref(false)
const searchQuery = ref('')
const selectWrapper = ref<HTMLElement | null>(null)

const selectedStudent = computed(() => {
  return classmates.value.find(item => item.slug === selectedSlug.value) || null
})

const filteredClassmates = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return classmates.value
  return classmates.value.filter(item => {
    return (
      item.name.toLowerCase().includes(query) ||
      item.slug.toLowerCase().includes(query)
    )
  })
})

const showChangePasswordModal = ref(false)

async function loadClassmates() {
  try {
    const res = await fetch(`${props.apiBase.replace(/\/$/, '')}/api/classmates`)
    const data = await res.json()
    if (data.success && Array.isArray(data.data)) {
      classmates.value = data.data
    }
  } catch (err) {
    error.value = '加载同学名单失败，请检查网络后重试'
  }
}

onMounted(() => {
  loadClassmates()
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})

function handleOutsideClick(e: MouseEvent) {
  if (selectWrapper.value && !selectWrapper.value.contains(e.target as Node)) {
    dropdownOpen.value = false
  }
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
  if (dropdownOpen.value) {
    searchQuery.value = ''
  }
}

function selectClassmate(item: Classmate) {
  selectedSlug.value = item.slug
  dropdownOpen.value = false
  error.value = ''
}

async function handleLogin() {
  error.value = ''
  if (!selectedSlug.value) {
    error.value = '请选择你的名字'
    return
  }
  if (!password.value) {
    error.value = '请输入入馆密码'
    return
  }

  loading.value = true
  try {
    const data = await classmateLogin(props.apiBase, selectedSlug.value, password.value)
    
    // 保存会话信息
    setClassmateSession(data.token, data.student)

    if (data.mustChangePassword) {
      // 首次登录，需要改密
      showChangePasswordModal.value = true
    } else {
      // 正常登录成功，跳转到前序页面
      const baseUrl = import.meta.env.BASE_URL || '/'
      const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
      window.location.href = `${prefix}preface`
    }
  } catch (err: any) {
    error.value = err.message || '登录失败，密码错误或账号尚未启用'
  } finally {
    loading.value = false
  }
}

function handlePasswordChanged() {
  showChangePasswordModal.value = false
  const baseUrl = import.meta.env.BASE_URL || '/'
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  window.location.href = `${prefix}preface`
}

function handlePasswordCancel() {
  // 清理临时会话状态并留在首页
  clearClassmateSession()
  showChangePasswordModal.value = false
  password.value = ''
}
</script>

<style scoped>
.login-book-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 900px;
  margin: 2rem auto;
  perspective: 1000px;
}

.login-book {
  display: flex;
  background-color: #faf9f5;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.15), 
              0 1px 3px rgba(0,0,0,0.05),
              inset 0 0 40px rgba(230,225,205,0.3);
  border: 1px solid #e3dec9;
  width: 100%;
  min-height: 480px;
  position: relative;
  overflow: hidden;
}

.book-page {
  flex: 1;
  padding: 3rem 2.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* 纸张及书本内页设计 */
.page-left {
  background: linear-gradient(to right, #faf9f5 95%, #e8e3d0 100%);
  border-right: 1px solid rgba(0,0,0,0.05);
}

.page-right {
  background: linear-gradient(to left, #faf9f5 95%, #e8e3d0 100%);
}

.book-spine {
  width: 16px;
  background: linear-gradient(to right, 
    rgba(0,0,0,0.03) 0%, 
    rgba(0,0,0,0.1) 40%, 
    rgba(0,0,0,0.15) 50%, 
    rgba(0,0,0,0.1) 60%, 
    rgba(0,0,0,0.03) 100%);
  box-shadow: inset 0 0 10px rgba(0,0,0,0.08);
  border-left: 1px solid rgba(0,0,0,0.08);
  border-right: 1px solid rgba(0,0,0,0.08);
  position: relative;
  z-index: 10;
}

.page-content {
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
  position: relative;
}

/* 左侧温馨排版 */
.ink-title {
  font-family: var(--font-display), "Noto Serif SC", serif;
  font-size: 2.5rem;
  font-weight: 700;
  color: #3e3223;
  margin-bottom: 0.5rem;
  letter-spacing: 0.2em;
}

.ink-subtitle {
  font-size: 0.9rem;
  color: #8c7f6e;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.decorative-line {
  width: 60px;
  height: 2px;
  background-color: #cc785c;
  margin: 1.5rem 0;
}

.ink-text {
  font-size: var(--type-body-md-size);
  line-height: 1.8;
  color: #5c4e3c;
  font-style: italic;
  font-family: "Noto Serif SC", serif;
}

.doodle-plane {
  font-size: 2rem;
  color: #cc785c;
  opacity: 0.2;
  position: absolute;
  bottom: -30px;
  right: 10px;
  transform: rotate(-15deg);
}

/* 右侧表单 */
.form-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #3e3223;
  margin-bottom: 0.25rem;
  letter-spacing: 0.05em;
}

.form-subtitle {
  font-size: var(--type-body-sm-size);
  color: #8c7f6e;
  margin-bottom: 2rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #5c4e3c;
}

/* 自定义下拉框 */
.custom-select-wrapper {
  position: relative;
  width: 100%;
}

.select-trigger {
  width: 100%;
  height: 44px;
  padding: 0 1rem;
  background-color: #fcfbfa;
  border: 1px solid #d4cdb8;
  border-radius: 6px;
  font-size: 14px;
  color: #3e3223;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.select-trigger:hover {
  border-color: #b5aa90;
}

.select-trigger.is-active {
  border-color: #cc785c;
  box-shadow: 0 0 0 3px rgba(204, 120, 92, 0.15);
}

.select-trigger .placeholder {
  color: #b5aa90;
}

.select-arrow {
  font-size: 10px;
  color: #8c7f6e;
  transition: transform 0.2s ease;
}

.select-trigger.is-active .select-arrow {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background-color: #faf9f5;
  border: 1px solid #d4cdb8;
  border-radius: 6px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.08);
  z-index: 50;
  max-height: 250px;
  display: flex;
  flex-direction: column;
}

.dropdown-search {
  padding: 6px;
  border-bottom: 1px solid #e6e1d0;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  font-size: 13px;
  background-color: #fcfbfa;
  border: 1px solid #d4cdb8;
  border-radius: 4px;
  outline: none;
}

.search-input:focus {
  border-color: #cc785c;
}

.dropdown-list {
  list-style: none;
  overflow-y: auto;
  padding: 4px 0;
  margin: 0;
}

.dropdown-list li {
  padding: 8px 12px;
  font-size: 14px;
  color: #3e3223;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dropdown-list li:hover {
  background-color: #f0ebd9;
}

.dropdown-list li.is-selected {
  background-color: #cc785c;
  color: #ffffff;
}

.dropdown-list li.is-selected .slug-hint {
  color: rgba(255, 255, 255, 0.7);
}

.slug-hint {
  font-size: 11px;
  color: #8c7f6e;
}

.no-results {
  padding: 12px;
  font-size: 13px;
  color: #8c7f6e;
  text-align: center;
}

.password-input {
  background-color: #fcfbfa;
  border-color: #d4cdb8;
}

.password-input:focus {
  border-color: #cc785c;
}

.error-msg {
  font-size: 13px;
  color: var(--color-error);
  margin-top: 4px;
}

.login-btn {
  margin-top: 1rem;
  background-color: #cc785c;
  color: #fff;
  border-radius: 6px;
  font-weight: 500;
  letter-spacing: 0.1em;
}

.login-btn:hover {
  background-color: #b36349;
}

/* 适配移动端 */
@media (max-width: 768px) {
  .login-book {
    flex-direction: column;
    min-height: auto;
  }
  .page-left {
    display: none; /* 移动端隐藏左侧装饰页，避免过多堆叠 */
  }
  .book-spine {
    display: none;
  }
  .book-page {
    padding: 2.5rem 1.5rem;
  }
}
</style>
