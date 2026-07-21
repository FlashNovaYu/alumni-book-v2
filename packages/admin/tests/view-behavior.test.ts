// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, nextTick } from 'vue'
import AdminLayout from '../src/views/AdminLayout.vue'
import AuditLogView from '../src/views/AuditLogView.vue'
import MessagesView from '../src/views/MessagesView.vue'
import StudentsView from '../src/views/StudentsView.vue'
import TimelineEventsView from '../src/views/TimelineEventsView.vue'

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function urlOf(input: RequestInfo | URL): URL {
  return new URL(String(input), 'http://localhost')
}

function student(index: number, prefix = '学生') {
  return { id: `student-${index}`, name: `${prefix}${index}`, slug: `student-${index}`, avatarUrl: null, accountStatus: 'active' }
}

function profileMessage(index: number, approved = false) {
  return {
    id: `profile-${approved ? 'approved' : 'pending'}-${index}`,
    studentSlug: `student-${index}`,
    authorName: `留言者${index}`,
    content: `${approved ? '已通过' : '待审核'}留言${index}`,
    isApproved: approved,
    isHidden: false,
    createdAt: '2026-07-19',
    pinned: false,
  }
}

function groupMessage(index: number) {
  return {
    id: `group-${index}`,
    author: { slug: `student-${index}`, name: `群聊同学${index}` },
    content: `群聊内容${index}`,
    status: 'visible',
    moderationReason: null,
    recalledAt: null,
    recalledByType: null,
    createdAt: '2026-07-19',
    updatedAt: '2026-07-19',
  }
}

async function messagesRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/messages', component: defineComponent({ template: '<div />' }) }],
  })
  await router.push('/messages')
  await router.isReady()
  return router
}

beforeEach(() => {
  sessionStorage.clear()
  sessionStorage.setItem('admin_token', 'view-test-token')
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0))
  vi.spyOn(window, 'alert').mockImplementation(() => undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('高密度列表真实 DOM 分页', () => {
  it('1000 名学生首批 DOM 不超过 60，第二页使用 page=2 并追加', async () => {
    const students = Array.from({ length: 1_000 }, (_, index) => student(index))
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input)
      requests.push(url)
      const page = Number(url.searchParams.get('page') || 1)
      const limit = Number(url.searchParams.get('limit') || 50)
      return jsonResponse(students.slice((page - 1) * limit, page * limit))
    }))

    const wrapper = mount(StudentsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } },
    })
    await vi.waitFor(() => expect(wrapper.findAll('.student-row')).toHaveLength(50))
    expect(wrapper.findAll('.student-row').length).toBeLessThanOrEqual(60)
    expect(Number(requests[0].searchParams.get('limit'))).toBeLessThanOrEqual(50)

    await wrapper.get('.load-more').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.student-row')).toHaveLength(100))
    expect(requests[1].searchParams.get('page')).toBe('2')
    expect(wrapper.text()).toContain('学生99')
    wrapper.unmount()
  })

  it('10000 条个人留言和群聊均按 50 条挂载并真正追加第二页', async () => {
    const profiles = Array.from({ length: 10_000 }, (_, index) => profileMessage(index))
    const groups = Array.from({ length: 10_000 }, (_, index) => groupMessage(index))
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input)
      requests.push(url)
      const page = Number(url.searchParams.get('page') || 1)
      const limit = Number(url.searchParams.get('limit') || 50)
      const source = url.pathname.includes('group-chat') ? groups : profiles
      return jsonResponse(source.slice((page - 1) * limit, page * limit))
    }))
    const router = await messagesRouter()
    const wrapper = mount(MessagesView, { global: { plugins: [router] } })

    await vi.waitFor(() => expect(wrapper.findAll('.msg-card')).toHaveLength(50))
    expect(wrapper.findAll('.msg-card').length).toBeLessThanOrEqual(60)
    await wrapper.get('.load-more').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.msg-card')).toHaveLength(100))
    expect(requests.find((url) => url.pathname === '/api/admin/messages' && url.searchParams.get('page') === '2')).toBeTruthy()

    const groupTab = wrapper.findAll('.tab-group-main .tab-btn').find((button) => button.text() === '公共群聊')!
    await groupTab.trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.msg-card')).toHaveLength(50))
    await wrapper.get('.load-more').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.msg-card')).toHaveLength(100))
    const groupSecondPage = requests.find((url) => url.pathname.includes('group-chat/messages') && url.searchParams.get('page') === '2')
    expect(groupSecondPage).toBeTruthy()
    expect(wrapper.text()).toContain('群聊内容99')
    wrapper.unmount()
  })
})

describe('视图请求所有权', () => {
  it('MessagesView 筛选会 abort 旧请求，旧响应不覆盖且不显示错误 toast', async () => {
    let resolveOld!: (response: Response) => void
    let firstSignal: AbortSignal | null = null
    let calls = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input)
      if (url.pathname !== '/api/admin/messages') return Promise.resolve(jsonResponse([]))
      calls += 1
      if (calls === 1) {
        firstSignal = init?.signal as AbortSignal
        return new Promise<Response>((resolve) => { resolveOld = resolve })
      }
      return Promise.resolve(jsonResponse([profileMessage(1, true)]))
    }))
    const router = await messagesRouter()
    const wrapper = mount(MessagesView, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(calls).toBe(1))

    const approvedTab = wrapper.findAll('.tab-group-sub .tab-btn').find((button) => button.text() === '已通过')!
    await approvedTab.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('已通过留言1'))
    expect(firstSignal?.aborted).toBe(true)
    resolveOld(jsonResponse([profileMessage(9, false)]))
    await flushPromises()
    await nextTick()
    expect(wrapper.text()).not.toContain('待审核留言9')
    expect(wrapper.find('.toast-error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('StudentsView 搜索会 abort 旧请求，陈旧响应不覆盖且不弹错误', async () => {
    let resolveOld!: (response: Response) => void
    let firstSignal: AbortSignal | null = null
    let calls = 0
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1
      if (calls === 1) {
        firstSignal = init?.signal as AbortSignal
        return new Promise<Response>((resolve) => { resolveOld = resolve })
      }
      return Promise.resolve(jsonResponse([{ ...student(1, '新结果'), name: '新结果' }]))
    }))
    const wrapper = mount(StudentsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } },
    })
    await vi.waitFor(() => expect(calls).toBe(1))
    await wrapper.get('input[aria-label="搜索学生"]').setValue('新结果')
    await vi.waitFor(() => expect(wrapper.text()).toContain('新结果'))
    expect(firstSignal?.aborted).toBe(true)
    resolveOld(jsonResponse([{ ...student(2, '旧结果'), name: '旧结果' }]))
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧结果')
    expect(window.alert).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('管理筛选与路由加载态', () => {
  it('审计筛选与时光轴编辑器打开内置日期面板', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])))

    const audit = mount(AuditLogView)
    await flushPromises()
    expect(audit.findAll('.calendar-date-picker')).toHaveLength(2)
    await audit.find('.date-input').trigger('click')
    expect(audit.find('.calendar-popover').exists()).toBe(true)
    audit.unmount()

    const timeline = mount(TimelineEventsView)
    await flushPromises()
    const createButton = timeline.findAll('button').find((button) => button.text() === '添加事件')!
    await createButton.trigger('click')
    expect(timeline.findAll('.calendar-date-picker')).toHaveLength(1)
    await timeline.find('.date-input').trigger('click')
    expect(timeline.find('.calendar-popover').exists()).toBe(true)
    timeline.unmount()
  })

  it('AuditLogView 遍历全部管理员分页，超过 50 个仍可筛选', async () => {
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input)
      requests.push(url)
      if (url.pathname.includes('/admin/accounts')) {
        const page = Number(url.searchParams.get('page') || 1)
        const count = page === 1 ? 50 : 5
        return jsonResponse(Array.from({ length: count }, (_, index) => ({
          id: `admin-${page}-${index}`, displayName: `管理员${page}-${index}`, permissions: [], permissionOverrides: [],
        })))
      }
      return jsonResponse([])
    }))
    const wrapper = mount(AuditLogView)
    await vi.waitFor(() => expect(wrapper.findAll('.filters select option')).toHaveLength(56))
    expect(requests.some((url) => url.pathname.includes('/admin/accounts') && url.searchParams.get('page') === '2')).toBe(true)
    wrapper.unmount()
  })

  it('延迟异步路由导航期间显示骨架，完成后显示目标视图', async () => {
    let resolveTarget!: (component: ReturnType<typeof defineComponent>) => void
    const Target = () => new Promise<ReturnType<typeof defineComponent>>((resolve) => { resolveTarget = resolve })
    const First = defineComponent({ template: '<div data-testid="first">初始视图</div>' })
    const Host = defineComponent({ template: '<router-view />' })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/', component: AdminLayout, children: [
          { path: 'first', component: First },
          { path: 'target', component: Target },
        ],
      }],
    })
    await router.push('/first')
    await router.isReady()
    const wrapper = mount(Host, { global: { plugins: [router] } })
    await flushPromises()

    const navigation = router.push('/target')
    await vi.waitFor(() => expect(wrapper.find('.route-loading').exists()).toBe(true))
    resolveTarget(defineComponent({ template: '<div data-testid="target">目标视图</div>' }))
    await navigation
    await vi.waitFor(() => expect(wrapper.find('[data-testid="target"]').exists()).toBe(true))
    expect(wrapper.find('.route-loading').exists()).toBe(false)
    wrapper.unmount()
  })
})
