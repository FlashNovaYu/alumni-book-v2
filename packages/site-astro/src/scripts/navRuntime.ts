// packages/site-astro/src/scripts/navRuntime.ts

export interface NavRuntime {
  destroy(): void
  onPageLoad(): void
  onBeforeSwap(): void
  onVisibilityChange(): void
  onInboxChanged(): void
}

class AlumniNavRuntime implements NavRuntime {
  private timerId: any = null
  private isFetching = false
  private resizeListener: (() => void) | null = null

  constructor() {
    this.init()
  }

  private init() {
    this.syncNavSession()
    this.updateInkLine(true) // 首次渲染时不加过渡，防止切页墨线从0飞入的闪烁
    this.startMailUnreadPolling()

    // 监听窗口大小变化以重新对齐墨线
    this.resizeListener = () => this.updateInkLine(false)
    window.addEventListener('resize', this.resizeListener)

    // 绑定具体的 DOM 事件（如抽屉开关，退出等）
    this.bindDomEvents()
  }

  public destroy() {
    this.cleanupTimer()
    this.unlockScroll()

    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener)
      this.resizeListener = null
    }

    // 清理可能处于打开状态的抽屉
    const drawer = document.querySelector('.mobile-drawer')
    const overlay = document.querySelector('.mobile-drawer-overlay')
    if (drawer) drawer.classList.remove('active')
    if (overlay) overlay.classList.remove('active')
  }

  public onPageLoad() {
    // 每次 Astro 切页加载后重新绑定 DOM 事件并对齐墨线
    this.syncNavSession()
    this.updateInkLine(true)
    this.bindDomEvents()
    this.syncMailUnreadImmediate()
  }

  public onBeforeSwap() {
    // 切页前移除滚动锁定，防止切页后无法滚动
    this.unlockScroll()
  }

  public onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.syncMailUnreadImmediate()
      this.startMailUnreadPolling()
    } else {
      this.cleanupTimer()
    }
  }

  public onInboxChanged() {
    this.syncMailUnreadImmediate()
  }

  private cleanupTimer() {
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  private lockScroll() {
    document.body.classList.add('body-scroll-locked')
  }

  private unlockScroll() {
    document.body.classList.remove('body-scroll-locked')
  }

  private syncNavSession() {
    try {
      const studentStr = sessionStorage.getItem('classmate_account_student')
      const token = sessionStorage.getItem('classmate_account_token')
      const nav = document.querySelector('.top-nav')
      
      const deskAccount = document.getElementById('classmate-nav-account-link')
      
      if (studentStr && token) {
        if (nav) nav.classList.add('has-session')
        if (deskAccount) deskAccount.style.display = 'inline-flex'
      } else {
        if (nav) nav.classList.remove('has-session')
        if (deskAccount) deskAccount.style.display = 'none'
      }
    } catch (e) {}
  }

  private bindDomEvents() {
    // 1. 移动端抽屉开关
    const trigger = document.getElementById('mobile-menu-trigger')
    const closeBtn = document.getElementById('mobile-menu-close')
    const overlay = document.querySelector('.mobile-drawer-overlay')
    const drawer = document.querySelector('.mobile-drawer')

    if (trigger && drawer && overlay) {
      trigger.onclick = () => {
        drawer.classList.add('active')
        overlay.classList.add('active')
        this.lockScroll()
      }
    }

    const closeDrawer = () => {
      if (drawer) drawer.classList.remove('active')
      if (overlay) overlay.classList.remove('active')
      this.unlockScroll()
    }

    if (closeBtn) closeBtn.onclick = closeDrawer
    if (overlay) (overlay as HTMLElement).onclick = closeDrawer

    // 2. 退出登录按钮
    const logoutBtns = document.querySelectorAll('.nav-logout-btn')
    logoutBtns.forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        sessionStorage.removeItem('classmate_account_token')
        sessionStorage.removeItem('classmate_account_student')
        
        // 移除滚动锁定，重定向回到首页
        this.unlockScroll()
        const base = import.meta.env.BASE_URL || '/'
        window.location.href = base
      }
    })
  }

  private updateInkLine(immediate = false) {
    const activeItem = document.querySelector('.nav-link.active') as HTMLElement
    const inkLine = document.querySelector('.nav-active-ink') as HTMLElement

    if (!activeItem || !inkLine) {
      if (inkLine) inkLine.style.opacity = '0'
      return
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (immediate || prefersReduced) {
      inkLine.style.setProperty('transition', 'none', 'important')
    } else {
      inkLine.style.removeProperty('transition')
    }

    inkLine.style.opacity = '1'
    inkLine.style.transform = `translateX(${activeItem.offsetLeft}px) scaleX(${activeItem.offsetWidth / 100})`
  }

  private startMailUnreadPolling() {
    this.cleanupTimer()
    
    const scheduleNext = () => {
      this.timerId = setTimeout(async () => {
        if (document.visibilityState === 'visible' && window.navigator.onLine !== false) {
          await this.fetchMailUnread()
        }
        scheduleNext()
      }, 60000)
    }
    
    scheduleNext()
  }

  private async syncMailUnreadImmediate() {
    if (window.navigator.onLine !== false) {
      await this.fetchMailUnread()
    }
  }

  private async fetchMailUnread() {
    if (this.isFetching) return
    this.isFetching = true

    try {
      const token = sessionStorage.getItem('classmate_account_token')
      const stamps = document.querySelectorAll('.mail-unread-stamp')
      
      if (!token) {
        stamps.forEach(stamp => { (stamp as HTMLElement).hidden = true })
        return
      }

      const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin
      const res = await fetch(`${apiBase}/api/inbox/summary`, {
        headers: { 'X-Classmate-Token': token }
      })

      if (!res.ok) return

      const data = await res.json()
      const count = data && data.data ? Number(data.data.totalUnread || 0) : 0
      
      stamps.forEach(stamp => {
        const s = stamp as HTMLElement
        s.hidden = count <= 0
        s.textContent = count > 99 ? '99+' : String(count)
      })
    } catch (e) {
      console.error('[Nav Polling] Failed to fetch unread count:', e)
    } finally {
      this.isFetching = false
    }
  }
}

export function initNavRuntime() {
  if (typeof window !== 'undefined') {
    if (window.__alumniNavRuntime) {
      try {
        window.__alumniNavRuntime.destroy()
      } catch (e) {
        console.error('Failed to destroy previous nav runtime:', e)
      }
    }

    const runtime = new AlumniNavRuntime()
    window.__alumniNavRuntime = runtime

    // 绑定全局事件代理（仅限首次）
    if (!window.__alumniNavEventsBound) {
      document.addEventListener('astro:page-load', () => {
        window.__alumniNavRuntime?.onPageLoad?.()
      })
      document.addEventListener('astro:before-swap', () => {
        window.__alumniNavRuntime?.onBeforeSwap?.()
      })
      document.addEventListener('visibilitychange', () => {
        window.__alumniNavRuntime?.onVisibilityChange?.()
      })
      window.addEventListener('alumni:inbox-changed', () => {
        window.__alumniNavRuntime?.onInboxChanged?.()
      })
      window.__alumniNavEventsBound = true
    }
  }
}

// 自动注入声明以使 TypeScript 开心
declare global {
  interface Window {
    __alumniNavRuntime?: NavRuntime
    __alumniNavEventsBound?: boolean
  }
}
