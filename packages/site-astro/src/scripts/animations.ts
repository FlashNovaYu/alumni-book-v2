import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function initAnimations() {
  // 减少动效模式 — 所有动画即时完成
  ScrollTrigger.matchMedia({
    '(prefers-reduced-motion: no-preference)': function () {
      // 通用滚动渐显 — 替代 ScrollReveal.astro 的 IntersectionObserver
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

      // 错位容器 — 子元素已在 .fade-in-stagger 渲染时带 delay，仅触发根元素
      // ScrollTrigger 统一处理，清除 CSS 延迟后一致体验
    },

    '(prefers-reduced-motion: reduce)': function () {
      // 所有 .fade-in 元素即时设为可见
      gsap.set('.fade-in', { autoAlpha: 1, y: 0 })
    },
  })
}
