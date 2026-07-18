import { clearClassmateSession, getClassmateStudent, getClassmateToken } from '@alumni/shared'
import { fetchInboxSummary } from '../api/inbox'
import { fetchClassmateAdminEntry } from '../api/classmateAuth'

interface NavRuntime {
  destroy(): void
  refresh(): void
}

declare global {
  interface Window {
    __alumniNavRuntime?: NavRuntime
    __alumniNavLifecycleBound?: boolean
    __alumniNavActiveMarker?: { left: number; paperWidth: number; inkLeft: number; inkWidth: number }
  }
}

const apiBase = import.meta.env.VITE_API_BASE_URL || ''
const navMarkerStorageKey = 'alumni_nav_active_marker'
const adminEntryCacheKey = 'alumni_nav_admin_entry'
const navOrder = ['/', '/preface/', '/roster/', '/class-space/', '/yearbook/', '/more/']

type NavMarker = { left: number; paperWidth: number; inkLeft: number; inkWidth: number }

function consumeNavMarker(): NavMarker | null {
  try {
    const raw = window.sessionStorage.getItem(navMarkerStorageKey)
    window.sessionStorage.removeItem(navMarkerStorageKey)
    if (!raw) return null
    const marker = JSON.parse(raw) as Partial<NavMarker>
    if (typeof marker.left !== 'number' || typeof marker.paperWidth !== 'number' || typeof marker.inkLeft !== 'number' || typeof marker.inkWidth !== 'number') return null
    return marker as NavMarker
  } catch {
    return null
  }
}

function updateUnreadStamps(count: number) {
  document.querySelectorAll<HTMLElement>('[data-nav-unread]').forEach((stamp) => {
    stamp.hidden = count <= 0
    stamp.textContent = count > 99 ? '99+' : String(count)
  })
}

function updateAdminEntry(available: boolean) {
  document.documentElement.classList.toggle('has-admin-entry', available)
}

function readCachedAdminEntry(studentSlug?: string): boolean | null {
  if (!studentSlug) return null
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(adminEntryCacheKey) || 'null') as { studentSlug?: string; available?: boolean } | null
    return cached?.studentSlug === studentSlug && typeof cached.available === 'boolean' ? cached.available : null
  } catch {
    return null
  }
}

function cacheAdminEntry(studentSlug: string, available: boolean) {
  try {
    window.sessionStorage.setItem(adminEntryCacheKey, JSON.stringify({ studentSlug, available }))
  } catch {}
}

function clearAdminEntryCache() {
  try {
    window.sessionStorage.removeItem(adminEntryCacheKey)
  } catch {}
}

function inferNavigationDirection(): 'back' | 'forward' {
  try {
    const normalize = (path: string) => {
      const clean = path.replace(/\/index\.html$/, '/')
      return clean.endsWith('/') ? clean : `${clean}/`
    }
    const current = normalize(window.location.pathname)
    const previous = document.referrer ? normalize(new URL(document.referrer, window.location.href).pathname) : ''
    const currentIndex = navOrder.indexOf(current)
    const previousIndex = navOrder.indexOf(previous)
    return currentIndex >= 0 && previousIndex >= 0 && currentIndex < previousIndex ? 'back' : 'forward'
  } catch {
    return 'forward'
  }
}

function bindGlobalLifecycle() {
  if (window.__alumniNavLifecycleBound) return
  window.__alumniNavLifecycleBound = true

  window.addEventListener('pagehide', (event) => {
    if ((event as PageTransitionEvent).persisted) return
    window.__alumniNavRuntime?.destroy()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) window.__alumniNavRuntime?.refresh()
  })
  window.addEventListener('alumni:inbox-changed', () => {
    window.__alumniNavRuntime?.refresh()
  })
}

export function initNavRuntime(): void {
  bindGlobalLifecycle()
  window.__alumniNavRuntime?.destroy()

  const nav = document.querySelector<HTMLElement>('.top-nav')
  const directory = nav?.querySelector<HTMLElement>('[data-nav-directory]')
  const drawer = document.querySelector<HTMLElement>('[data-nav-drawer]')
  const openButton = document.querySelector<HTMLElement>('[data-nav-open]')
  const closeButton = document.querySelector<HTMLElement>('[data-nav-close]')
  const overlay = document.querySelector<HTMLElement>('[data-nav-overlay]')
  const logoutButton = document.querySelector<HTMLElement>('[data-nav-logout]')
  const cleanup: Array<() => void> = []
  let unreadTimer: ReturnType<typeof setTimeout> | null = null
  let unreadController: AbortController | null = null
  let adminEntryController: AbortController | null = null
  let resizeObserver: ResizeObserver | null = null
  let activeInkFrame: number | null = null
  consumeNavMarker()
  let currentMarker: NavMarker | null = null
  let destroyed = false

  const closeDrawer = () => {
    const wasOpen = document.documentElement.classList.contains('nav-open')
    document.documentElement.classList.remove('nav-open')
    drawer?.setAttribute('aria-hidden', 'true')
    if (drawer) drawer.inert = true
    if (wasOpen) openButton?.focus()
  }
  const openDrawer = () => {
    document.documentElement.classList.add('nav-open')
    drawer?.setAttribute('aria-hidden', 'false')
    if (drawer) drawer.inert = false
    closeButton?.focus()
  }
  const listen = (target: EventTarget | null, event: string, listener: EventListenerOrEventListenerObject) => {
    if (!target) return
    target.addEventListener(event, listener)
    cleanup.push(() => target.removeEventListener(event, listener))
  }

  function updateActiveInk() {
    if (!directory) return
    const active = directory.querySelector<HTMLElement>('[data-nav-item][aria-current="page"]')
    const paper = directory.querySelector<HTMLElement>('.nav-active-paper')
    const ink = directory.querySelector<HTMLElement>('.nav-active-ink')
    if (!active || !paper || !ink) return

    // 活跃背景和下划线由 CSS 伪元素绘制，运行时不读取布局几何，避免强制回流。
    paper.style.opacity = '0'
    ink.style.opacity = '0'
    const direction = window.sessionStorage.getItem('vt-nav-dir') || document.documentElement.dataset.navDir || inferNavigationDirection()
    directory.dataset.navDirection = direction === 'back' ? 'backward' : 'forward'
    directory.dataset.navReady = 'true'
    directory.dataset.navRevealing = 'false'
    currentMarker = { left: 0, paperWidth: 0, inkLeft: 0, inkWidth: 0 }
    window.__alumniNavActiveMarker = currentMarker
  }

  function syncSession() {
    const token = getClassmateToken()
    const student = getClassmateStudent<{ name?: string; slug?: string }>()
    const signedIn = Boolean(token && student)
    nav?.classList.toggle('has-session', signedIn)
    document.querySelectorAll<HTMLElement>('[data-nav-session-only]').forEach((element) => {
      element.hidden = !signedIn
    })
    document.querySelectorAll<HTMLElement>('[data-nav-student-name]').forEach((element) => {
      element.textContent = student?.name || '同学'
    })
    if (!signedIn) {
      updateUnreadStamps(0)
      clearAdminEntryCache()
      updateAdminEntry(false)
    } else {
      updateAdminEntry(readCachedAdminEntry(student?.slug) ?? false)
    }
    return signedIn
  }

  async function refreshAdminEntry() {
    adminEntryController?.abort()
    const student = getClassmateStudent<{ slug?: string }>()
    if (destroyed || !getClassmateToken() || !student?.slug) {
      updateAdminEntry(false)
      return
    }
    const controller = new AbortController()
    adminEntryController = controller
    try {
      const entry = await fetchClassmateAdminEntry(apiBase)
      if (!controller.signal.aborted) {
        cacheAdminEntry(student.slug, entry.available)
        updateAdminEntry(entry.available)
      }
    } catch {
      if (!controller.signal.aborted) updateAdminEntry(readCachedAdminEntry(student.slug) ?? false)
    } finally {
      if (adminEntryController === controller) adminEntryController = null
    }
  }

  function clearUnreadTimer() {
    if (unreadTimer !== null) clearTimeout(unreadTimer)
    unreadTimer = null
  }

  function scheduleUnread() {
    clearUnreadTimer()
    if (destroyed || document.hidden || !getClassmateToken()) return
    unreadTimer = setTimeout(() => {
      unreadTimer = null
      void refreshUnread()
    }, 60_000)
  }

  async function refreshUnread() {
    unreadController?.abort()
    if (destroyed || document.hidden || !getClassmateToken()) {
      updateUnreadStamps(0)
      return
    }

    const controller = new AbortController()
    unreadController = controller
    try {
      const summary = await fetchInboxSummary(apiBase, { signal: controller.signal })
      if (!controller.signal.aborted) updateUnreadStamps(summary.totalUnread)
    } catch {
      if (!controller.signal.aborted) updateUnreadStamps(0)
    } finally {
      if (unreadController === controller) unreadController = null
      if (!controller.signal.aborted) scheduleUnread()
    }
  }

  const runtime: NavRuntime = {
    destroy() {
      if (destroyed) return
      destroyed = true
      clearUnreadTimer()
      unreadController?.abort()
      unreadController = null
      adminEntryController?.abort()
      adminEntryController = null
      resizeObserver?.disconnect()
      if (activeInkFrame !== null) window.cancelAnimationFrame(activeInkFrame)
      cleanup.splice(0).forEach((dispose) => dispose())
      closeDrawer()
    },
    refresh() {
      if (destroyed) return
      const signedIn = syncSession()
      updateActiveInk()
      if (signedIn) {
        void refreshUnread()
        void refreshAdminEntry()
      }
    },
  }

  listen(openButton, 'click', openDrawer)
  listen(closeButton, 'click', closeDrawer)
  listen(overlay, 'click', closeDrawer)
  listen(document, 'keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (!document.documentElement.classList.contains('nav-open')) return
    if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault()
      closeDrawer()
      return
    }
    if (keyboardEvent.key !== 'Tab' || !drawer) return
    const focusableElements = Array.from(drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0)
    if (!focusableElements.length) return
    const first = focusableElements[0]
    const last = focusableElements[focusableElements.length - 1]
    if (keyboardEvent.shiftKey && document.activeElement === first) {
      keyboardEvent.preventDefault()
      last.focus()
    } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
      keyboardEvent.preventDefault()
      first.focus()
    }
  })
  document.querySelectorAll<HTMLElement>('.mobile-drawer a').forEach((link) => listen(link, 'click', closeDrawer))
  const prefetchedDocuments = new Set<string>()
  const prefetchDocument = (event: Event) => {
    const anchor = event.currentTarget as HTMLAnchorElement
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin || url.pathname === window.location.pathname || prefetchedDocuments.has(url.href)) return
    prefetchedDocuments.add(url.href)
    if (typeof HTMLScriptElement.supports === 'function' && HTMLScriptElement.supports('speculationrules')) {
      const rules = document.createElement('script')
      rules.type = 'speculationrules'
      rules.textContent = JSON.stringify({ prerender: [{ source: 'list', urls: [url.href], eagerness: 'immediate' }] })
      document.head.appendChild(rules)
    }
    const hint = document.createElement('link')
    hint.rel = 'prefetch'
    hint.href = url.href
    document.head.appendChild(hint)
  }
  document.querySelectorAll<HTMLAnchorElement>('[data-nav-item], .drawer-link').forEach((link) => {
    listen(link, 'pointerenter', prefetchDocument)
    listen(link, 'focus', prefetchDocument)
  })
  document.querySelectorAll<HTMLElement>('[data-nav-item], .drawer-link').forEach((link) => listen(link, 'click', () => {
    if (!currentMarker) return
    try {
      window.sessionStorage.setItem(navMarkerStorageKey, JSON.stringify(currentMarker))
    } catch {
      // sessionStorage 不可用时退化为无方向动画。
    }
  }))
  listen(logoutButton, 'click', () => {
    clearClassmateSession()
    clearAdminEntryCache()
    updateAdminEntry(false)
    closeDrawer()
    const home = document.querySelector<HTMLAnchorElement>('[data-nav-home]')?.href || '/'
    window.location.assign(home)
  })

  if (directory && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(updateActiveInk)
    resizeObserver.observe(directory)
  }

  window.__alumniNavRuntime = runtime
  runtime.refresh()
}
