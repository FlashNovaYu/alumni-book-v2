export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export type MotionBudget = 'full' | 'light' | 'reduced'

export interface MotionEnvironment {
  prefersReducedMotion: boolean
  coarsePointer: boolean
  saveData: boolean
  deviceMemory?: number
  hardwareConcurrency?: number
}

export function getMotionBudget(input: MotionEnvironment): MotionBudget {
  if (input.prefersReducedMotion) return 'reduced'
  if (
    input.coarsePointer ||
    input.saveData ||
    (typeof input.deviceMemory === 'number' && input.deviceMemory <= 4) ||
    (typeof input.hardwareConcurrency === 'number' && input.hardwareConcurrency <= 4)
  ) return 'light'
  return 'full'
}

export function getMotionFrameInterval(budget: MotionBudget): number {
  if (budget === 'reduced') return 0
  return budget === 'light' ? 1000 / 20 : 1000 / 30
}

export function getCurrentMotionBudget(): MotionBudget {
  if (typeof window === 'undefined') return 'full'
  const navigatorWithHints = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }
  return getMotionBudget({
    prefersReducedMotion: prefersReducedMotion(),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    saveData: navigatorWithHints.connection?.saveData === true,
    deviceMemory: navigatorWithHints.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  })
}

export function oncePerElement(el: Element, key: string): boolean {
  const attr = `data-motion-${key}`
  if (el.getAttribute(attr) === 'done') return false
  el.setAttribute(attr, 'done')
  return true
}
