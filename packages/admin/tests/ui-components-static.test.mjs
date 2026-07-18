import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

function readComponent(name) {
  const path = new URL(`../src/components/ui/${name}.vue`, import.meta.url)
  assert.ok(existsSync(path), `${name}.vue 应归属 admin 包，不能跨包引用站点组件`)
  return readFileSync(path, 'utf8')
}

const skeleton = readComponent('UiSkeleton')
assert.match(skeleton, /variant\?: 'card'/)
assert.match(skeleton, /prefers-reduced-motion: reduce/)
assert.doesNotMatch(skeleton, /class="ui-skeleton"[^>]*aria-hidden="true"/)
assert.match(skeleton, /class="ui-skeleton__visual" aria-hidden="true"/)
assert.doesNotMatch(skeleton, /variant === 'text'|variant === 'avatar'|variant === 'image'/)

const emptyState = readComponent('UiEmptyState')
assert.match(emptyState, /title\?: string/)
assert.match(emptyState, /description\?: string/)
assert.match(emptyState, /compact\?: boolean/)
assert.match(emptyState, /<slot name="action"/)

const badge = readComponent('UiBadge')
assert.match(badge, /type BadgeVariant = 'accent'/)
assert.match(badge, /type BadgeSize = 'sm'/)
assert.match(badge, /ui-badge--\$\{props\.variant\}/)
assert.match(badge, /ui-badge--\$\{props\.size\}/)
assert.doesNotMatch(badge, /ui-badge--(?:default|success|warning|error|info|md)/)

const dashboard = readFileSync(new URL('../src/views/DashboardView.vue', import.meta.url), 'utf8')
for (const component of ['UiSkeleton', 'UiEmptyState', 'UiBadge']) {
  assert.match(dashboard, new RegExp(`@/components/ui/${component}\\.vue`))
}
assert.match(dashboard, /class="dashboard__skeleton"[^>]*role="status"[^>]*aria-live="polite"/)
assert.match(dashboard, /class="dashboard__skeleton"[^>]*aria-label="正在加载工作台"/)
assert.match(dashboard, /<UiSkeleton[^>]*variant="card"/)

console.log('后台 UI 组件静态检查通过')
