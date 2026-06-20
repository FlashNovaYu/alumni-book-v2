export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function oncePerElement(el: Element, key: string): boolean {
  const attr = `data-motion-${key}`
  if (el.getAttribute(attr) === 'done') return false
  el.setAttribute(attr, 'done')
  return true
}
