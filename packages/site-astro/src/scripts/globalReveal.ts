import { prefersReducedMotion } from '../utils/motion'

let initialized = false
let activeObserver: IntersectionObserver | null = null

export function initGlobalReveal(force = false) {
  if (force) {
    initialized = false
    if (activeObserver) {
      activeObserver.disconnect()
      activeObserver = null
    }
  }
  if (initialized) return
  initialized = true

  const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-motion="global-reveal"]'))
  if (!revealEls.length) return

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => {
      el.dataset.motionState = 'done'
      el.style.opacity = '1'
      el.style.visibility = 'visible'
      el.style.transform = 'none'
    })
    return
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      const el = entry.target as HTMLElement
      el.dataset.motionState = 'done'
      el.classList.add('motion-visible')
      observer.unobserve(el)
    })
  }, { rootMargin: '0px 0px -10% 0px' })

  activeObserver = observer
  revealEls.forEach((el) => activeObserver?.observe(el))
}
