import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

let initialized = false

export function initAnimations() {
  // 如果是减少动效模式，即使已初始化也直接重设以确保可见，常规模式则跳过重复初始化
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) {
    gsap.set('.fade-in', { autoAlpha: 1, y: 0 })
    return
  }

  if (initialized) return
  initialized = true

  // 仅在非减少动效模式下注册滚动动画
  const fadeEls = gsap.utils.toArray<HTMLElement>('.fade-in')
  if (fadeEls.length) {
    ScrollTrigger.batch(fadeEls, {
      onEnter: (batch) =>
        gsap.fromTo(
          batch,
          { autoAlpha: 0, y: 24 },
          { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.55, ease: 'power2.out', overwrite: true }
        ),
      start: 'top 85%',
      once: true,
    })
  }
}
