<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">站点设置</h1>
      <button class="btn-primary" @click="handleSave" :disabled="saving">
        {{ saving ? '保存中...' : '保存设置' }}
      </button>
    </div>

    <div class="settings-grid">
      <div class="card">
        <h2 class="title-md section-heading">站点基本资料</h2>
        <div class="form-group">
          <label class="form-label" for="identity-site-name">站点名称</label>
          <input id="identity-site-name" v-model="config.identity.siteName" type="text" class="text-input" maxlength="60" />
        </div>
        <div class="form-group">
          <label class="form-label" for="identity-class-name">班级名称</label>
          <input id="identity-class-name" v-model="config.identity.className" type="text" class="text-input" maxlength="80" />
        </div>
        <div class="form-group">
          <label class="form-label" for="identity-class-year">届别</label>
          <input id="identity-class-year" v-model="config.identity.classYear" type="text" class="text-input" maxlength="40" />
        </div>
        <div class="form-group">
          <label class="form-label" for="identity-share-description">分享摘要</label>
          <textarea id="identity-share-description" v-model="config.identity.shareDescription" class="textarea" rows="3" maxlength="160"></textarea>
        </div>
      </div>

      <!-- 前言设置 -->
      <div class="card">
        <h2 class="title-md section-heading">前言</h2>
        <div class="form-group">
          <label class="form-label" for="preface-title">标题</label>
          <input id="preface-title" v-model="config.preface.title" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="preface-subtitle">副标题</label>
          <input id="preface-subtitle" v-model="config.preface.subtitle" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="preface-content">正文</label>
          <textarea id="preface-content" v-model="config.preface.content" class="textarea" rows="6"></textarea>
        </div>
      </div>

      <!-- 底部信息 -->
      <div class="card">
        <h2 class="title-md section-heading">底部信息</h2>
        <div class="form-group">
          <label class="form-label" for="footer-copyright">版权文字</label>
          <input id="footer-copyright" v-model="config.footer.copyright" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="footer-beian">备案号</label>
          <input id="footer-beian" v-model="config.footer.beian" type="text" class="text-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="footer-beian-url">备案链接</label>
          <input id="footer-beian-url" v-model="config.footer.beianUrl" type="text" class="text-input" />
        </div>
      </div>

      <!-- 字体设置 -->
      <div class="card">
        <h2 class="title-md section-heading">字体</h2>
        <div class="form-group">
          <label class="form-label" for="typography-font-family">字体族</label>
          <select id="typography-font-family" v-model="config.typography.fontFamily" class="text-input">
            <option value="default">默认</option>
            <option value="Cormorant Garamond">Cormorant Garamond (衬线)</option>
            <option value="Inter">Inter (无衬线)</option>
            <option value="Noto Serif SC">Noto Serif SC (中文衬线)</option>
            <option value="Noto Sans SC">Noto Sans SC (中文无衬线)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="typography-font-size">字号</label>
          <input id="typography-font-size" v-model.number="config.typography.fontSize" type="number" class="text-input" min="12" max="20" />
        </div>
      </div>

      <!-- 纪念馆主题设置 -->
      <div class="card" v-if="config.museum">
        <h2 class="title-md section-heading">纪念馆主题设置</h2>
        <div class="form-group checkbox-group">
          <label class="checkbox-label" for="museum-enabled">
            <input id="museum-enabled" v-model="config.museum.enabled" type="checkbox" />
            启用纪念馆主题
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" for="museum-hero-eyebrow">Hero 眉标 (Hero Eyebrow)</label>
          <input id="museum-hero-eyebrow" v-model="config.museum.heroEyebrow" type="text" class="text-input" :disabled="!config.museum.enabled" />
        </div>
        <div class="form-group">
          <label class="form-label" for="museum-hero-title">Hero 标题 (Hero Title)</label>
          <input id="museum-hero-title" v-model="config.museum.heroTitle" type="text" class="text-input" :disabled="!config.museum.enabled" />
        </div>
        <div class="form-group">
          <label class="form-label" for="museum-hero-subtitle">Hero 副标题 (Hero Subtitle)</label>
          <input id="museum-hero-subtitle" v-model="config.museum.heroSubtitle" type="text" class="text-input" :disabled="!config.museum.enabled" />
        </div>
        <div class="form-group">
          <label class="form-label" for="museum-particle-level">粒子浓度 (Particle Level)</label>
          <select id="museum-particle-level" v-model="config.museum.particleLevel" class="text-input" :disabled="!config.museum.enabled">
            <option value="off">关闭 (off)</option>
            <option value="low">低 (low)</option>
            <option value="medium">中 (medium)</option>
          </select>
        </div>
        <div class="form-group checkbox-group">
          <label class="checkbox-label" for="museum-enable-class-graph">
            <input id="museum-enable-class-graph" v-model="config.museum.enableClassGraph" type="checkbox" :disabled="!config.museum.enabled" />
            <span>在公开页展示班级图谱入口</span>
          </label>
          <p class="form-hint" style="margin-left: 20px; font-size: 12px; color: var(--color-muted); margin-top: 4px;">关闭后公开页不会渲染对应入口，也不会下载对应的懒加载组件。</p>
        </div>
        <div class="form-group checkbox-group">
          <label class="checkbox-label" for="museum-enable-seat-map">
            <input id="museum-enable-seat-map" v-model="config.museum.enableSeatMap" type="checkbox" :disabled="!config.museum.enabled" />
            <span>在公开页展示座位记忆入口</span>
          </label>
          <p class="form-hint" style="margin-left: 20px; font-size: 12px; color: var(--color-muted); margin-top: 4px;">关闭后公开页不会渲染对应入口，也不会下载对应的懒加载组件。</p>
        </div>
      </div>

      <!-- 致谢 -->
      <div class="card">
        <h2 class="title-md section-heading">特别致谢</h2>
        <div v-for="(ack, i) in config.acknowledgments" :key="i" class="ack-row">
          <input v-model="ack.name" type="text" class="text-input" placeholder="姓名" :aria-label="`第 ${i + 1} 位致谢姓名`" />
          <input v-model="ack.role" type="text" class="text-input" placeholder="角色" :aria-label="`第 ${i + 1} 位致谢角色`" />
          <button class="btn-danger btn-sm" :aria-label="`删除第 ${i + 1} 位致谢`" @click="removeAck(i)">删除</button>
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
const defaultIdentity = { siteName: '同学录', className: '', classYear: '', shareDescription: '' }

const config = ref<SiteConfig>({
  particles: {},
  footer: { copyright: '', beian: '', beianUrl: '' },
  preface: { title: '', subtitle: '', content: '' },
  acknowledgments: [],
  typography: { fontFamily: 'default', fontSize: 15 },
  identity: { ...defaultIdentity },
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
        identity: { ...defaultIdentity, ...res.data.identity },
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
</style>
