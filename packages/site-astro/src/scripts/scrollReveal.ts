/**
 * 极简的滚动揭露动画辅助脚本
 */
export function initScrollReveal() {
  if (typeof window === 'undefined') return;

  // 尊重系统减少动效偏好
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const elements = document.querySelectorAll('.reveal, .reveal-spring');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        // 动画仅播放一次，播放后取消观察
        obs.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.05
  });

  elements.forEach(el => {
    observer.observe(el);
  });
}
