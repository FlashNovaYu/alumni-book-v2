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

function bindGlobalLifecycle() {
  if (window.__alumniNavLifecycleBound) return
  window.__alumniNavLifecycleBound = true

  document.addEventListener('astro:before-swap', () => {
    window.__alumniNavRuntime?.destroy()
  })
  document.addEventListener('astro:page-load', () => {
    initNavRuntime()
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
  let activeInkInitialized = false
  const storedMarker = consumeNavMarker()
  const incomingMarker = window.__alumniNavActiveMarker || storedMarker
  let currentMarker: NavMarker | null = null
  let previousActiveLeft = incomingMarker?.left ?? null
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
    if (!active || !paper || !ink) {
      if (paper) paper.style.opacity = '0'
      if (ink) ink.style.opacity = '0'
      return
    }

    const marker = {
      left: active.offsetLeft,
      paperWidth: active.offsetWidth,
      inkLeft: active.offsetLeft + 11,
      inkWidth: Math.max(22, active.offsetWidth - 22),
    }
    const applyMarker = (next: typeof marker) => {
      paper.style.width = `${next.paperWidth}px`
      paper.style.transform = `translateX(${next.left}px)`
      paper.style.opacity = '1'
      ink.style.width = `${next.inkWidth}px`
      ink.style.transform = `translateX(${next.inkLeft}px)`
      ink.style.opacity = '1'
    }
    const previousMarker = activeInkInitialized ? null : incomingMarker

    if (!activeInkInitialized || marker.left !== previousActiveLeft) {
      directory.dataset.navDirection = previousActiveLeft !== null && marker.left < previousActiveLeft
        ? 'backward'
        : 'forward'
    }

    if (!activeInkInitialized) {
      directory.dataset.navReady = 'false'
      if (previousMarker) {
        directory.dataset.navRevealing = 'true'
        applyMarker(previousMarker)
        directory.getBoundingClientRect()
        directory.dataset.navReady = 'true'
        activeInkFrame = window.requestAnimationFrame(() => {
          activeInkFrame = null
          if (!destroyed) {
            applyMarker(marker)
            directory.dataset.navRevealing = 'false'
          }
        })
      } else {
        directory.dataset.navRevealing = 'false'
        applyMarker(marker)
        activeInkFrame = window.requestAnimationFrame(() => {
          activeInkFrame = null
          if (!destroyed) directory.dataset.navReady = 'true'
        })
      }
      activeInkInitialized = true
    } else {
      applyMarker(marker)
    }

    previousActiveLeft = marker.left
    currentMarker = marker
    window.__alumniNavActiveMarker = marker
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
