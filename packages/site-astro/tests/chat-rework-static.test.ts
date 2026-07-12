import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (relativePath: string) => readFileSync(resolve(src, relativePath), 'utf-8')

describe('班级空间会话客户端契约', () => {
  it('提供统一的同学会话请求和错误语义', () => {
    expect(existsSync(resolve(src, 'api/classmateRequest.ts'))).toBe(true)
    const source = read('api/classmateRequest.ts')

    expect(source).toContain('ApiRequestError')
    expect(source).toContain('getClassmateToken')
    expect(source).toContain('X-Classmate-Token')
    expect(source).toContain('joinApiUrl')
    expect(source).toContain('Retry-After')
  })

  it('按群聊、私聊和通知边界提供强类型客户端', () => {
    expect(existsSync(resolve(src, 'api/groupChat.ts'))).toBe(true)
    expect(existsSync(resolve(src, 'api/inbox.ts'))).toBe(true)

    const groupChat = read('api/groupChat.ts')
    const inbox = read('api/inbox.ts')

    for (const endpoint of ['/api/group-chat/messages', '/api/group-chat/sync', '/api/group-chat/mine']) {
      expect(groupChat).toContain(endpoint)
    }
    for (const endpoint of ['/api/direct-conversations', '/api/inbox/summary', '/api/inbox/sync', '/api/notifications']) {
      expect(inbox).toContain(endpoint)
    }
    expect(groupChat).toContain('requestClassmateApi')
    expect(inbox).toContain('requestClassmateApi')
  })

  it('在没有同学会话时拒绝班级空间概览请求', () => {
    const source = read('api/classSpace.ts')

    expect(source).toContain('requestClassmateApi')
    expect(source).not.toContain("fetch(joinApiUrl(apiBase, '/api/class-space/overview'))")
  })
})

describe('班级群聊历史浏览', () => {
  it('在记录区滚动到顶部时加载更早消息，并保留触控纵向滚动', () => {
    const stage = read('components/GroupChatStage.vue')

    expect(stage).toContain('if (element.scrollTop <= 16 && canLoadOlder.value && !loadingOlder.value)')
    expect(stage).toMatch(/\.chat-log\s*\{[^}]*overscroll-behavior-y:\s*auto;/)
    expect(stage).toMatch(/\.chat-log\s*\{[^}]*touch-action:\s*pan-y;/)
    expect(stage).not.toContain("addEventListener('wheel'")
    expect(stage).not.toContain("addEventListener('touchmove'")
    expect(stage).not.toContain('window.scrollBy')
  })
})

describe('可见性轮询生命周期契约', () => {
  it('使用一个可取消的递归计时器同步，并在页面生命周期中释放资源', () => {
    expect(existsSync(resolve(src, 'composables/useVisibilityPolling.ts'))).toBe(true)
    const source = read('composables/useVisibilityPolling.ts')

    expect(source).toContain('AbortController')
    expect(source).toContain('visibilitychange')
    expect(source).toContain("addEventListener('online'")
    expect(source).toContain('onScopeDispose')
    expect(source).toContain('clearTimeout')
    expect(source).toContain('setTimeout')
    expect(source).not.toContain('setInterval')
    expect(source).toContain('5_000')
    expect(source).toContain('10_000')
    expect(source).toContain('20_000')
    expect(source).toContain('30_000')
  })

  it('让信箱仅在可见在线时同步，并将本地未读变化通知导航栏', () => {
    const source = read('composables/useInbox.ts')

    expect(source).toContain("import { useVisibilityPolling } from './useVisibilityPolling'")
    expect(source).toContain('useVisibilityPolling({ run: syncNow, initialDelay: 5_000, baseDelay: 5_000, maxDelay: 30_000 })')
    expect(source).toContain('function updateUnread')
    expect(source).toContain("new CustomEvent('alumni:inbox-changed'")
  })
})

describe('纸质档案导航契约', () => {
  it('用目录条替换玻璃灯条，并保留稳定的活动纸签和信箱入口', () => {
    const nav = read('components/TopNav.astro')

    expect(nav).toContain('paper-bookmark-nav')
    expect(nav).toContain('nav-active-paper')
    expect(nav).toContain('nav-active-ink')
    expect(nav).toContain('mobile-page-title')
    expect(nav).toContain('nav-mailbox-button')
    expect(nav).not.toContain('backdrop-filter')
    expect(nav).not.toContain('width: 820px')
    expect(nav).not.toContain('inkLineFlow')
  })

  it('将跨页面导航行为收束到可销毁的单例运行时', () => {
    expect(existsSync(resolve(src, 'scripts/navRuntime.ts'))).toBe(true)
    const runtime = read('scripts/navRuntime.ts')
    const layout = read('layouts/MainLayout.astro')

    expect(runtime).toContain('astro:before-swap')
    expect(runtime).toContain('window.__alumniNavRuntime')
    expect(runtime).toContain('ResizeObserver')
    expect(runtime).toContain('setTimeout')
    expect(runtime).not.toContain('setInterval')
    expect(layout).toContain('initNavRuntime')
  })

  it('粘性目录条不再让纸张页面重复预留导航高度', () => {
    const globalCss = read('styles/global.css')

    expect(globalCss).not.toContain('padding-top: calc(var(--nav-height)')
  })

  it('从目录条左侧定位活动纸签，避免 flex 静态位置叠加偏移', () => {
    const nav = read('components/TopNav.astro')
    const activeLayer = nav.match(/\.nav-active-paper,\s*\.nav-active-ink\s*\{([\s\S]*?)\n  \}/)

    expect(activeLayer?.[1]).toContain('left: 0;')
  })

  it('以全局根节点状态驱动移动目录抽屉打开', () => {
    const nav = read('components/TopNav.astro')

    expect(nav).toContain(':global(html.nav-open) .mobile-drawer')
    expect(nav).toContain(':global(html.nav-open) .mobile-drawer-overlay')
  })
})
