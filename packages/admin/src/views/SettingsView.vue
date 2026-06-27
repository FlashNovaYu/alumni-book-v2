<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">站点设置</h1>
      <button class="btn-primary" @click="handleSave" :disabled="saving">
        {{ saving ? '保存中...' : '保存设置' }}
      </button>
    </div>

    <div class="settings-grid">
      <!-- 前言设置 -->
      <div class="card">
        <h2 class="title-md section-heading">前言</h2>
        <div class="form-group">
          <label class="form-label">标题</label>
          <input v-model="config.preface.title" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label">副标题</label>
          <input v-model="config.preface.subtitle" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label">正文</label>
          <textarea v-model="config.preface.content" class="textarea" rows="6"></textarea>
        </div>
      </div>

      <!-- 底部信息 -->
      <div class="card">
        <h2 class="title-md section-heading">底部信息</h2>
        <div class="form-group">
          <label class="form-label">版权文字</label>
          <input v-model="config.footer.copyright" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label">备案号</label>
          <input v-model="config.footer.beian" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label">备案链接</label>
          <input v-model="config.footer.beianUrl" type="text" class="text-input" />
        </div>
      </div>

      <!-- 字体设置 -->
      <div class="card">
        <h2 class="title-md section-heading">字体</h2>
        <div class="form-group">
          <label class="form-label">字体族</label>
          <select v-model="config.typography.fontFamily" class="text-input">
            <option value="default">默认</option>
            <option value="Cormorant Garamond">Cormorant Garamond (衬线)</option>
            <option value="Inter">Inter (无衬线)</option>
            <option value="Noto Serif SC">Noto Serif SC (中文衬线)</option>
            <option value="Noto Sans SC">Noto Sans SC (中文无衬线)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">字号</label>
          <input v-model.number="config.typography.fontSize" type="number" class="text-input" min="12" max="20" />
        </div>
      </div>

      <!-- 纪念馆主题设置 -->
      <div class="card" v-if="config.museum">
        <h2 class="title-md section-heading">纪念馆主题设置</h2>
        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input v-model="config.museum.enabled" type="checkbox" />
            启用纪念馆主题
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">Hero 眉标 (Hero Eyebrow)</label>
          <input v-model="config.museum.heroEyebrow" type="text" class="text-input" :disabled="!config.museum.enabled" />
        </div>
        <div class="form-group">
          <label class="form-label">Hero 标题 (Hero Title)</label>
          <input v-model="config.museum.heroTitle" type="text" class="text-input" :disabled="!config.museum.enabled" />
        </div>
        <div class="form-group">
          <label class="form-label">Hero 副标题 (Hero Subtitle)</label>
          <input v-model="config.museum.heroSubtitle" type="text" class="text-input" :disabled="!config.museum.enabled" />
        </div>
        <div class="form-group">
          <label class="form-label">粒子浓度 (Particle Level)</label>
          <select v-model="config.museum.particleLevel" class="text-input" :disabled="!config.museum.enabled">
            <option value="off">关闭 (off)</option>
            <option value="low">低 (low)</option>
            <option value="medium">中 (medium)</option>
          </select>
        </div>
        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input v-model="config.museum.enableClassGraph" type="checkbox" :disabled="!config.museum.enabled" />
            启用班级关系图谱
          </label>
        </div>
        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input v-model="config.museum.enableSeatMap" type="checkbox" :disabled="!config.museum.enabled" />
            启用座位表
          </label>
        </div>
      </div>

      <!-- 致谢 -->
      <div class="card">
        <h2 class="title-md section-heading">特别致谢</h2>
        <div v-for="(ack, i) in config.acknowledgments" :key="i" class="ack-row">
          <input v-model="ack.name" type="text" class="text-input" placeholder="姓名" />
          <input v-model="ack.role" type="text" class="text-input" placeholder="角色" />
          <button class="btn-danger btn-sm" @click="removeAck(i)">删除</button>
        </div>
        <button class="btn-secondary" @click="addAck">+ 添加致谢</button>
      </div>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="toast" :class="'toast-' + toast.type">{{ toast.message }}</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminFetch } from '@/api/client'
import type { SiteConfig, ApiResponse } from '@alumni/shared'

const saving = ref(false)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const defaultMuseumConfig = {
  enabled: true,
  heroEyebrow: 'CLASS MEMORY MUSEUM',
  heroTitle: '青春纪念馆',
  heroSubtitle: '翻开这本会呼吸的同学录，重新走过我们的青春长廊。',
  particleLevel: 'low' as const,
  enableClassGraph: false,
  enableSeatMap: false,
}

const config = ref<SiteConfig>({
  particles: {},
  footer: { copyright: '', beian: '', beianUrl: '' },
  preface: { title: '', subtitle: '', content: '' },
  acknowledgments: [],
  typography: { fontFamily: 'default', fontSize: 15 },
  museum: { ...defaultMuseumConfig },
})

function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  setTimeout(() => { toast.value = null }, 3000)
}

function addAck() {
  config.value.acknowledgments.push({ name: '', role: '', tip: '', avatarUrl: '' })
}

function removeAck(index: number) {
  config.value.acknowledgments.splice(index, 1)
}

async function handleSave() {
  saving.value = true
  try {
    await adminFetch('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config.value),
    })
    showToast('success', '设置已保存')
  } catch (e: any) {
    showToast('error', e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const res = await adminFetch<ApiResponse<SiteConfig>>('/api/config')
    if (res.data) {
      config.value = {
        ...res.data,
        museum: { ...defaultMuseumConfig, ...res.data.museum },
      }
    }
  } catch {
    // 使用默认值
  }
})
</script>

<style scoped>
.settings-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.section-heading {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-hairline);
}

.ack-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.checkbox-group {
  margin-bottom: var(--spacing-md);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  cursor: pointer;
  user-select: none;
}

.btn-sm {
  height: 40px;
  padding: 0 12px;
  font-size: 13px;
}
</style>
