import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { prefersReducedMotion } from '../utils/motion'

gsap.registerPlugin(ScrollTrigger)

let initialized = false

export function initAnimations() {
  // 如果是减少动效模式，即使已初始化也直接重设以确保可见，常规模式则跳过重复初始化
  if (prefersReducedMotion()) {
    gsap.set('.fade-in, [data-motion="global-reveal"]', { autoAlpha: 1, y: 0 })
    return
  }

  if (initialized) return
  initialized = true

  // 仅在非减少动效模式下注册滚动动画，仅对明确标记为全局 reveal 的元素生效
  const revealEls = gsap.utils.toArray<HTMLElement>('[data-motion="global-reveal"]')
  if (revealEls.length) {
    ScrollTrigger.batch(revealEls, {
      onEnter: (batch) =>
        gsap.fromTo(
          batch,
          { autoAlpha: 0, y: 24 },
          { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.55, ease: 'power2.out', overwrite: 'auto' }
        ),
      start: 'top 85%',
      once: true,
    })
  }
}

