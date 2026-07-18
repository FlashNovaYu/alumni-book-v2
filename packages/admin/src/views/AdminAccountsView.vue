<template>
  <section class="governance-page">
    <header class="page-header governance-header">
      <div>
        <p class="eyebrow">主管理员专属</p>
        <h1 class="page-title">账号与权限</h1>
        <p class="intro">为每位管理员分配最小必要权限；变更会在下一次请求即时生效。</p>
      </div>
      <button class="btn-primary" @click="openCreate">新建管理员</button>
    </header>

    <form v-if="showForm" class="card account-form" @submit.prevent="submit">
      <div class="form-heading">
        <div>
          <p class="eyebrow">{{ editingId ? '编辑次级管理员' : '新增次级管理员' }}</p>
          <h2>{{ editingId ? '调整角色与权限' : '创建管理员账号' }}</h2>
        </div>
        <button type="button" class="close-button" aria-label="关闭表单" @click="closeForm">×</button>
      </div>

      <div class="form-grid">
        <label v-if="!editingId" class="form-group">账号类型
          <select v-model="form.accountType" class="text-input">
            <option value="standalone">独立管理员账号</option>
            <option value="classmate_linked">绑定已有同学账号</option>
          </select>
        </label>
        <label class="form-group">显示名<input v-model.trim="form.displayName" class="text-input" required /></label>
        <label v-if="!editingId && form.accountType === 'standalone'" class="form-group">用户名<input v-model.trim="form.username" class="text-input" minlength="3" required /></label>
        <label v-if="!editingId && form.accountType === 'standalone'" class="form-group">初始密码<input v-model="form.initialPassword" type="password" class="text-input" minlength="8" required /></label>
        <label v-if="!editingId && form.accountType === 'classmate_linked'" class="form-group">绑定同学
          <select v-model="form.studentSlug" class="text-input" required @change="syncCandidateName">
            <option value="">请选择同学</option>
            <option v-for="candidate in candidates" :key="candidate.slug" :value="candidate.slug">{{ candidate.name }}</option>
          </select>
        </label>
        <label class="form-group">预设角色
          <select v-model="form.roleId" class="text-input">
            <option value="content_admin">内容管理员</option>
            <option value="moderator">内容审核员</option>
            <option value="operator">运营管理员</option>
          </select>
        </label>
      </div>

      <section class="permission-editor" aria-labelledby="override-title">
        <div class="permission-heading"><div><h3 id="override-title">权限覆盖</h3><p>默认继承角色。仅在需要例外时单独允许或拒绝。</p></div></div>
        <div class="permission-grid">
          <label v-for="permission in permissions" :key="permission" class="permission-row">
            <span>{{ permissionLabel(permission) }}</span>
            <select class="text-input" :value="overrideEffect(permission)" @change="setOverride(permission, $event)">
              <option value="">继承角色</option>
              <option value="allow">额外允许</option>
              <option value="deny">明确拒绝</option>
            </select>
          </label>
        </div>
      </section>

      <section class="effective-permissions" aria-labelledby="effective-title">
        <h3 id="effective-title">最终权限</h3>
        <p>{{ effectivePermissions.length ? effectivePermissions.map(permissionLabel).join('、') : '当前配置不会授予业务权限' }}</p>
      </section>

      <p v-if="!editingId && form.accountType === 'standalone'" class="form-hint">独立账号首次登录必须修改密码；绑定同学账号使用同学登录会话进入后台。</p>
      <p v-if="error" class="login-error">{{ error }}</p>
      <div class="form-actions"><button type="button" class="btn-secondary" @click="closeForm">取消</button><button class="btn-primary" :disabled="saving">{{ saving ? '保存中...' : editingId ? '保存调整' : '创建管理员' }}</button></div>
    </form>

    <div class="card table-card">
      <p v-if="loading">正在加载账号…</p>
      <div v-else-if="!accounts.length" class="empty">尚未创建次级管理员。</div>
      <table v-else>
        <thead><tr><th>管理员</th><th>登录方式</th><th>角色与权限</th><th>状态</th><th>最近活动</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="account in accounts" :key="account.id">
            <td><strong>{{ account.displayName }}</strong><small>{{ account.username || account.studentSlug || '主管理员' }}</small></td>
            <td>{{ account.accountType === 'standalone' ? '独立账号' : '同学账号' }}</td>
            <td><strong>{{ roleLabel(account.roleId) }}</strong><details><summary>最终权限（{{ account.permissions.length }}）</summary><p>{{ account.permissions.map(permissionLabel).join('、') || '无' }}</p></details></td>
            <td><span :class="['status', account.status]">{{ account.status === 'active' ? '启用中' : '已停用' }}</span><small v-if="account.mustChangePassword">下次登录需改密</small></td>
            <td>{{ account.lastLoginAt || '尚未登录' }}</td>
            <td class="action-cell">
              <button v-if="!account.isOwner" class="btn-secondary btn-sm" @click="edit(account)">编辑</button>
              <button v-if="account.accountType === 'standalone' && !account.isOwner && account.status === 'active'" class="btn-secondary btn-sm" @click="resetPassword(account)">重置密码</button>
              <button v-if="account.status === 'active'" class="btn-secondary btn-sm" @click="revokeSessions(account)">撤销会话</button>
              <button v-if="account.canDisable && account.status === 'active'" class="btn-danger btn-sm" @click="disable(account)">停用</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="nextCursor" class="btn-secondary load-more" :disabled="loadingMore" @click="load(false)">
      {{ loadingMore ? '加载中…' : `加载更多（已显示 ${accounts.length}/${total}）` }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ADMIN_PERMISSIONS, type AdminAccountSummary, type AdminPermission } from '@alumni/shared'
import {
  createAdminAccount, disableAdminAccount, listAccountCandidates, listAdminAccounts,
  resetAdminPassword, revokeAdminSessions, type CreateAdminAccountPayload, updateAdminAccount,
} from '@/api/adminAccounts'
import { isAbortError } from '@/api/network'

const permissions = ADMIN_PERMISSIONS
const accounts = ref<AdminAccountSummary[]>([])
const candidates = ref<Array<{ name: string; slug: string }>>([])
const loading = ref(true)
const saving = ref(false)
const showForm = ref(false)
const editingId = ref<string | null>(null)
const error = ref('')
const nextCursor = ref<string | null>(null)
const total = ref(0)
const loadingMore = ref(false)
let loadController: AbortController | null = null

const roleDefaults: Record<'content_admin' | 'moderator' | 'operator', AdminPermission[]> = {
  content_admin: ['dashboard.view', 'moderation.view', 'moderation.manage', 'content.manage', 'notifications.view', 'notifications.publish'],
  moderator: ['dashboard.view', 'moderation.view', 'moderation.manage'],
  operator: ['dashboard.view', 'content.manage', 'notifications.view', 'notifications.publish'],
}
const permissionNames: Record<AdminPermission, string> = {
  'dashboard.view': '查看工作台', 'moderation.view': '查看审核内容', 'moderation.manage': '处理审核内容',
  'content.manage': '管理相册与时光轴', 'notifications.view': '查看通知中心', 'notifications.publish': '发布通知',
  'students.manage': '管理学生档案', 'site.settings.manage': '管理站点设置', 'admins.manage': '管理管理员账号', 'audit.view': '查看操作日志',
}
const form = reactive<CreateAdminAccountPayload>({
  accountType: 'standalone', displayName: '', username: '', initialPassword: '', studentSlug: '', roleId: 'moderator', permissionOverrides: [],
})

const effectivePermissions = computed(() => {
  const enabled = new Set(roleDefaults[form.roleId])
  for (const override of form.permissionOverrides) {
    if (override.effect === 'allow') enabled.add(override.permission)
    else enabled.delete(override.permission)
  }
  return permissions.filter(permission => enabled.has(permission))
})

function permissionLabel(permission: AdminPermission) { return permissionNames[permission] }
function roleLabel(role: string) { return ({ owner: '主管理员', content_admin: '内容管理员', moderator: '内容审核员', operator: '运营管理员' } as Record<string, string>)[role] || role }
function overrideEffect(permission: AdminPermission) { return form.permissionOverrides.find(item => item.permission === permission)?.effect || '' }
function setOverride(permission: AdminPermission, event: Event) {
  const effect = (event.target as HTMLSelectElement).value as 'allow' | 'deny' | ''
  form.permissionOverrides = form.permissionOverrides.filter(item => item.permission !== permission)
  if (effect) form.permissionOverrides.push({ permission, effect })
}
function resetForm() {
  Object.assign(form, { accountType: 'standalone', displayName: '', username: '', initialPassword: '', studentSlug: '', roleId: 'moderator', permissionOverrides: [] })
  editingId.value = null
  error.value = ''
}
function openCreate() { resetForm(); showForm.value = true }
function closeForm() { showForm.value = false; resetForm() }
function syncCandidateName() { const candidate = candidates.value.find(item => item.slug === form.studentSlug); if (candidate) form.displayName = candidate.name }
function edit(account: AdminAccountSummary) {
  editingId.value = account.id
  Object.assign(form, { accountType: account.accountType, displayName: account.displayName, username: account.username || '', initialPassword: '', studentSlug: account.studentSlug || '', roleId: account.roleId as CreateAdminAccountPayload['roleId'], permissionOverrides: [...account.permissionOverrides] })
  error.value = ''
  showForm.value = true
}
async function load(reset = true) {
  if (reset) {
    loadController?.abort()
    accounts.value = []
    nextCursor.value = null
  }
  const controller = new AbortController()
  loadController = controller
  loading.value = true
  loadingMore.value = !reset
  try {
    const [page, nextCandidates] = await Promise.all([
      listAdminAccounts(reset ? null : nextCursor.value, controller.signal),
      reset ? listAccountCandidates(controller.signal) : Promise.resolve(candidates.value),
    ])
    if (controller.signal.aborted) return
    accounts.value = reset ? page.items : [...accounts.value, ...page.items]
    candidates.value = nextCandidates
    nextCursor.value = page.nextCursor
    total.value = page.total
  } catch (err) {
    if (!isAbortError(err)) error.value = err instanceof Error ? err.message : '账号加载失败'
  } finally {
    if (loadController === controller) { loading.value = false; loadingMore.value = false }
  }
}
async function submit() {
  saving.value = true; error.value = ''
  try {
    if (editingId.value) {
      await updateAdminAccount(editingId.value, { displayName: form.displayName, roleId: form.roleId, permissionOverrides: form.permissionOverrides })
    } else {
      await createAdminAccount({ ...form, permissionOverrides: [...form.permissionOverrides] })
    }
    closeForm(); await load(true)
  } catch (err: unknown) { error.value = err instanceof Error ? err.message : '保存失败' }
  finally { saving.value = false }
}
async function resetPassword(account: AdminAccountSummary) {
  const password = prompt(`请为“${account.displayName}”设置不少于 8 位的新初始密码：`)
  if (password === null) return
  if (password.length < 8) { window.alert('初始密码至少 8 位'); return }
  const reason = prompt('请填写重置密码的原因：')
  if (reason === null) return
  if (!reason.trim()) { window.alert('请填写重置密码的原因'); return }
  await resetAdminPassword(account.id, password, reason.trim()); await load(true)
}
async function revokeSessions(account: AdminAccountSummary) {
  if (!confirm(`确定撤销“${account.displayName}”的全部管理会话吗？`)) return
  const reason = prompt('请填写撤销会话的原因：')
  if (reason === null) return
  if (!reason.trim()) { window.alert('请填写撤销会话的原因'); return }
  await revokeAdminSessions(account.id, reason.trim()); await load(true)
}
async function disable(account: AdminAccountSummary) {
  if (!confirm(`确定停用“${account.displayName}”吗？其所有管理会话将立即失效。`)) return
  const reason = prompt('请填写停用管理员的原因：')
  if (reason === null) return
  if (!reason.trim()) { window.alert('请填写停用管理员的原因'); return }
  await disableAdminAccount(account.id, reason.trim()); await load(true)
}

onMounted(() => { void load(true) })
onBeforeUnmount(() => { loadController?.abort() })
</script>

<style scoped>
.governance-page{max-width:1180px}.governance-header{align-items:flex-start}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--color-primary);margin:0 0 4px}.intro{margin:8px 0 0;color:var(--color-muted);font-size:14px}.account-form{margin-bottom:var(--spacing-lg)}.form-heading{display:flex;justify-content:space-between;gap:var(--spacing-md);margin-bottom:var(--spacing-lg)}.form-heading h2{margin:0;font-size:20px}.close-button{font-size:26px;line-height:1;padding:0 6px;color:var(--color-muted)}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--spacing-md)}.form-group{display:grid;gap:6px;font-size:13px;font-weight:600}.permission-editor{margin-top:var(--spacing-lg);padding-top:var(--spacing-lg);border-top:1px solid var(--color-hairline)}.permission-heading h3,.effective-permissions h3{margin:0;font-size:16px}.permission-heading p,.effective-permissions p,.form-hint{margin:5px 0 0;color:var(--color-muted);font-size:13px;line-height:1.6}.permission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:var(--spacing-md)}.permission-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--color-hairline-soft);border-radius:var(--rounded-sm);font-size:13px}.permission-row select{max-width:116px;padding:6px 7px}.effective-permissions{margin-top:var(--spacing-md);padding:12px;background:var(--color-surface-cream);border-radius:var(--rounded-sm)}.form-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:var(--spacing-lg)}.table-card{overflow:auto}table{width:100%;min-width:920px;border-collapse:collapse}th,td{padding:13px 10px;border-bottom:1px solid var(--color-hairline);text-align:left;vertical-align:top;font-size:13px}th{color:var(--color-muted);font-weight:600}small{display:block;color:var(--color-muted);margin-top:3px}.status{font-weight:700}.status.active{color:var(--color-success)}.status.disabled{color:var(--color-error)}details{margin-top:6px;color:var(--color-muted)}summary{cursor:pointer;font-size:12px}details p{max-width:230px;margin:6px 0 0;font-size:12px;line-height:1.5}.action-cell{display:flex;flex-wrap:wrap;gap:6px;min-width:208px}.empty{padding:var(--spacing-xl);color:var(--color-muted)}.load-more{display:block;margin:var(--spacing-lg) auto 0}@media(max-width:768px){.governance-header{gap:var(--spacing-md)}.form-grid,.permission-grid{grid-template-columns:1fr}.permission-row{align-items:flex-start;flex-direction:column}.permission-row select{width:100%;max-width:none}.table-card{padding:var(--spacing-sm)}.action-cell{min-width:260px}}
</style>
