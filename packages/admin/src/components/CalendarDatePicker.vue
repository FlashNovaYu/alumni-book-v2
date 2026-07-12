<template>
  <div class="calendar-date-picker" ref="containerRef">
    <div class="input-wrapper" @click="togglePopover">
      <input
        type="text"
        class="text-input date-input"
        :value="tempInput"
        placeholder="YYYY-MM-DD"
        readonly
      />
      <span class="calendar-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
          <line x1="16" x2="16" y1="2" y2="6"/>
          <line x1="8" x2="8" y1="2" y2="6"/>
          <line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
      </span>
    </div>

    <!-- 日历弹窗 -->
    <Transition name="fade">
      <div v-if="isOpen" class="calendar-popover">
        <!-- 1. 日期视图 -->
        <div v-if="viewMode === 'days'" class="view-days">
          <div class="popover-header">
            <button class="nav-btn" @click="prevMonth" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div class="header-title">
              <span class="clickable-title" @click="viewMode = 'months'">{{ monthNames[panelMonth] }}</span>
              <span class="clickable-title" @click="viewMode = 'years'">{{ panelYear }}</span>
            </div>
            <button class="nav-btn" @click="nextMonth" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>

          <div class="weekdays-grid">
            <span v-for="day in weekdayNames" :key="day" class="weekday-cell">{{ day }}</span>
          </div>

          <div class="days-grid">
            <button
              v-for="(cell, idx) in dayCells"
              :key="idx"
              type="button"
              class="day-cell"
              :class="{
                'is-prev-next': !cell.isCurrentMonth,
                'is-selected': cell.isSelected,
                'is-today': cell.isToday
              }"
              @click="selectDay(cell)"
            >
              <span class="day-text">{{ cell.day }}</span>
            </button>
          </div>
        </div>

        <!-- 2. 月份选择视图 -->
        <div v-else-if="viewMode === 'months'" class="view-months">
          <div class="popover-header">
            <button class="nav-btn" @click="viewMode = 'days'" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div class="header-title">选择月份</div>
            <div style="width: 28px;"></div>
          </div>
          <div class="months-grid">
            <button
              v-for="(mName, idx) in monthNamesShort"
              :key="idx"
              type="button"
              class="grid-item-btn"
              :class="{ 'is-active': panelMonth === idx }"
              @click="selectMonth(idx)"
            >
              {{ mName }}
            </button>
          </div>
        </div>

        <!-- 3. 年份选择视图 -->
        <div v-else-if="viewMode === 'years'" class="view-years">
          <div class="popover-header">
            <button class="nav-btn" @click="prevYearRange" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div class="header-title">{{ yearRangeStart }} - {{ yearRangeStart + 19 }}</div>
            <button class="nav-btn" @click="nextYearRange" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
          <div class="years-grid">
            <button
              v-for="yr in yearRange"
              :key="yr"
              type="button"
              class="grid-item-btn"
              :class="{ 'is-active': panelYear === yr }"
              @click="selectYear(yr)"
            >
              {{ yr }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isOpen = ref(false)
const viewMode = ref<'days' | 'months' | 'years'>('days')
const containerRef = ref<HTMLElement | null>(null)

// 临时输入框的值，与 modelValue 同步，但在编辑时可修改
const tempInput = ref('')

// 面板显示的年月状态
const panelYear = ref(new Date().getFullYear())
const panelMonth = ref(new Date().getMonth())

// 年份视图中的当前范围起始年
const yearRangeStart = ref(Math.floor(new Date().getFullYear() / 20) * 20)

// 常量定义
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const monthNamesShort = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]
const weekdayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// 计算年份选择网格的20个年份
const yearRange = computed(() => {
  const years = []
  for (let i = 0; i < 20; i++) {
    years.push(yearRangeStart.value + i)
  }
  return years
})

// 解析选中的日期
const parsedSelectedDate = computed(() => {
  if (!props.modelValue) return null
  const parts = props.modelValue.split('-')
  if (parts.length !== 3) return null
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1 // 0-indexed
  const d = parseInt(parts[2], 10)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  return { year: y, month: m, day: d }
})

// 同步初始值
watch(
  () => props.modelValue,
  (val) => {
    tempInput.value = val || ''
    const parsed = parsedSelectedDate.value
    if (parsed) {
      panelYear.value = parsed.year
      panelMonth.value = parsed.month
    }
  },
  { immediate: true }
)

// 当面板年份改变时，同步更新年份视图的起始范围
watch(panelYear, (val) => {
  yearRangeStart.value = Math.floor(val / 20) * 20
})

// 日期单元格定义接口
interface DayCell {
  day: number
  month: number
  year: number
  isCurrentMonth: boolean
  isSelected: boolean
  isToday: boolean
}

// 计算 42 个格子数据
const dayCells = computed<DayCell[]>(() => {
  const cells: DayCell[] = []
  const today = new Date()

  // 1. 获取当前面板年月的第一天是周几，以及总天数
  const firstDayVal = new Date(panelYear.value, panelMonth.value, 1).getDay()
  const daysInMonthVal = new Date(panelYear.value, panelMonth.value + 1, 0).getDate()

  // 2. 获取上个月的总天数
  const daysInPrevMonthVal = new Date(panelYear.value, panelMonth.value, 0).getDate()

  // 3. 填充上个月最后几天
  const prevMonthYear = panelMonth.value === 0 ? panelYear.value - 1 : panelYear.value
  const prevMonthIdx = panelMonth.value === 0 ? 11 : panelMonth.value - 1
  for (let i = firstDayVal - 1; i >= 0; i--) {
    const day = daysInPrevMonthVal - i
    cells.push({
      day,
      month: prevMonthIdx,
      year: prevMonthYear,
      isCurrentMonth: false,
      isSelected: isCellSelected(prevMonthYear, prevMonthIdx, day),
      isToday: isCellToday(prevMonthYear, prevMonthIdx, day, today)
    })
  }

  // 4. 填充本月天数
  for (let d = 1; d <= daysInMonthVal; d++) {
    cells.push({
      day: d,
      month: panelMonth.value,
      year: panelYear.value,
      isCurrentMonth: true,
      isSelected: isCellSelected(panelYear.value, panelMonth.value, d),
      isToday: isCellToday(panelYear.value, panelMonth.value, d, today)
    })
  }

  // 5. 填充下个月前几天，直到满 42 格
  const nextMonthYear = panelMonth.value === 11 ? panelYear.value + 1 : panelYear.value
  const nextMonthIdx = panelMonth.value === 11 ? 0 : panelMonth.value + 1
  let nextMonthDay = 1
  while (cells.length < 42) {
    cells.push({
      day: nextMonthDay,
      month: nextMonthIdx,
      year: nextMonthYear,
      isCurrentMonth: false,
      isSelected: isCellSelected(nextMonthYear, nextMonthIdx, nextMonthDay),
      isToday: isCellToday(nextMonthYear, nextMonthIdx, nextMonthDay, today)
    })
    nextMonthDay++
  }

  return cells
})

function isCellSelected(y: number, m: number, d: number): boolean {
  const parsed = parsedSelectedDate.value
  if (!parsed) return false
  return parsed.year === y && parsed.month === m && parsed.day === d
}

function isCellToday(y: number, m: number, d: number, today: Date): boolean {
  return today.getFullYear() === y && today.getMonth() === m && today.getDate() === d
}

// 交互操作
function togglePopover(e: Event) {
  const target = e.target as HTMLElement
  if (target.classList.contains('date-input')) {
    isOpen.value = true
  } else {
    isOpen.value = !isOpen.value
  }
  if (isOpen.value) {
    viewMode.value = 'days'
    const parsed = parsedSelectedDate.value
    if (parsed) {
      panelYear.value = parsed.year
      panelMonth.value = parsed.month
    }
  }
}

// 阻止事件冒泡和默认操作
function prevMonth() {
  if (panelMonth.value === 0) {
    panelMonth.value = 11
    panelYear.value--
  } else {
    panelMonth.value--
  }
}

function nextMonth() {
  if (panelMonth.value === 11) {
    panelMonth.value = 0
    panelYear.value++
  } else {
    panelMonth.value++
  }
}

function selectDay(cell: DayCell) {
  const formattedMonth = String(cell.month + 1).padStart(2, '0')
  const formattedDay = String(cell.day).padStart(2, '0')
  const dateStr = `${cell.year}-${formattedMonth}-${formattedDay}`
  emit('update:modelValue', dateStr)
  tempInput.value = dateStr
  isOpen.value = false
}

function selectMonth(mIdx: number) {
  panelMonth.value = mIdx
  viewMode.value = 'days'
}

function selectYear(yr: number) {
  panelYear.value = yr
  viewMode.value = 'days'
}

function prevYearRange() {
  yearRangeStart.value -= 20
}

function nextYearRange() {
  yearRangeStart.value += 20
}

// 点击外部关闭弹层
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  // 如果 target 已经不在文档里了，说明是被 Vue 动态替换掉的内部元素，忽略它以防闪退
  if (target && !document.body.contains(target)) {
    return
  }
  if (containerRef.value && !containerRef.value.contains(target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.calendar-date-picker {
  position: relative;
  display: inline-block;
  width: 100%;
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, sans-serif);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.date-input {
  width: 100%;
  padding-right: 32px;
  cursor: text;
}

.calendar-icon {
  position: absolute;
  right: 12px;
  display: flex;
  align-items: center;
  color: var(--color-muted-soft, #8e8b82);
  pointer-events: none;
}

.calendar-popover {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  margin-top: 6px;
  width: 300px;
  background-color: var(--color-surface-cream, #faf9f5);
  border: 1px solid var(--color-hairline, #e6dfd8);
  border-radius: var(--rounded-lg, 12px);
  padding: 16px 12px;
  box-shadow: var(--shadow-paper-card, 0 10px 30px rgba(0, 0, 0, 0.15));
  user-select: none;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--rounded-sm, 6px);
  border: 1px solid var(--color-hairline, #e6dfd8);
  background-color: transparent;
  color: var(--color-ink, #141413);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn:hover {
  background-color: var(--color-surface-cream-strong, #e8e0d2);
  border-color: var(--color-muted-soft, #8e8b82);
}

.header-title {
  display: flex;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink, #141413);
}

.clickable-title {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--rounded-xs, 4px);
  transition: background-color 0.2s ease;
}

.clickable-title:hover {
  background-color: var(--color-surface-cream-strong, #e8e0d2);
}

/* 星期头部样式 */
.weekdays-grid {
  display: grid;
  grid-template-columns: repeat(7, 36px);
  column-gap: 4px;
  justify-content: center;
  margin-bottom: 8px;
}

.weekday-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-muted-soft, #8e8b82);
  text-transform: uppercase;
}

/* 日期网格样式 */
.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 36px);
  row-gap: 4px;
  column-gap: 4px;
  justify-content: center;
}

.day-cell {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: none;
  background-color: transparent;
  cursor: pointer;
  border-radius: var(--rounded-md, 8px);
  font-size: 13px;
  color: var(--color-ink, #141413);
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
}

.day-text {
  z-index: 1;
}

.day-cell:hover:not(.is-selected) {
  background-color: var(--color-surface-soft, rgba(0, 0, 0, 0.05));
  color: var(--color-ink, #141413);
}

.day-cell.is-prev-next {
  color: var(--color-muted-soft, #8e8b82);
  opacity: 0.3;
}

.day-cell.is-selected {
  background-color: var(--color-primary, #cc785c);
  color: var(--color-on-primary, #ffffff);
  font-weight: 600;
}

/* 今天的伪元素小圆点样式 */
.day-cell.is-today::after {
  content: "";
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--color-primary, #cc785c);
  pointer-events: none;
  z-index: 2;
  transition: background-color 0.15s ease;
}

.day-cell.is-today.is-selected::after {
  background-color: var(--color-on-primary, #ffffff);
}

/* 月份/年份网格通用样式 */
.months-grid, .years-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 8px 0;
}

.years-grid {
  grid-template-columns: repeat(5, 1fr);
}

.grid-item-btn {
  padding: 8px 4px;
  border: 1px solid var(--color-hairline, #e6dfd8);
  border-radius: var(--rounded-md, 8px);
  background-color: transparent;
  color: var(--color-ink, #141413);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.grid-item-btn:hover {
  background-color: var(--color-surface-cream-strong, #e8e0d2);
  border-color: var(--color-muted-soft, #8e8b82);
}

.grid-item-btn.is-active {
  background-color: var(--color-primary, #cc785c);
  color: var(--color-on-primary, #ffffff);
  border-color: var(--color-primary, #cc785c);
}

/* 动效 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
