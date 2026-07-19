export type AlumniTheme = 'paper' | 'night'

const themeStorageKey = 'alumni_theme'

declare global {
  interface Window {
    __alumniThemeRuntime?: { destroy(): void }
  }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readTheme(): AlumniTheme {
  const stored = window.localStorage.getItem(themeStorageKey)
  if (stored === 'paper' || stored === 'night') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper'
}

function applyTheme(theme: AlumniTheme, persist = true) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#20252d' : '#f4eddf')
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(theme === 'night'))
    button.setAttribute('aria-label', theme === 'night' ? '切换为纸页模式' : '切换为夜读模式')
  })
  if (persist) window.localStorage.setItem(themeStorageKey, theme)
}

function switchFrom(button: HTMLButtonElement) {
  const next: AlumniTheme = readTheme() === 'night' ? 'paper' : 'night'
  if (prefersReducedMotion() || !document.startViewTransition) {
    applyTheme(next)
    return
  }

  const { left, top, width, height } = button.getBoundingClientRect()
  const x = left + width / 2
  const y = top + height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document.documentElement.classList.add('theme-transition')
  const transition = document.startViewTransition(() => applyTheme(next))
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  })
  void transition.finished.finally(() => document.documentElement.classList.remove('theme-transition'))
}

function syncTheme() {
  const current = readTheme()
  if (document.documentElement.dataset.theme !== current) {
    applyTheme(current, false)
  }
}

export function initThemeRuntime() {
  window.__alumniThemeRuntime?.destroy()
  applyTheme(readTheme(), false)

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]'))
  const onClick = (event: Event) => switchFrom(event.currentTarget as HTMLButtonElement)
  buttons.forEach((button) => button.addEventListener('click', onClick))

  const onStorage = (e: StorageEvent) => {
    if (e.key === themeStorageKey) syncTheme()
  }
  window.addEventListener('storage', onStorage)

  const onPrerenderingChange = () => {
    if (!document.prerendering) syncTheme()
  }
  document.addEventListener('prerenderingchange', onPrerenderingChange)

  const onVisibilityChange = () => {
    if (!document.hidden) syncTheme()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  window.__alumniThemeRuntime = {
    destroy() {
      buttons.forEach((button) => button.removeEventListener('click', onClick))
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('prerenderingchange', onPrerenderingChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}
