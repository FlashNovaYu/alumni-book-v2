import { reactive } from 'vue'

interface TiltOptions {
  maxTilt?: number
  scale?: number
}

interface TiltState {
  isHovered: boolean
  rotateX: number
  rotateY: number
  glareX: number
  glareY: number
}

export function useMouseTilt(options: TiltOptions = {}) {
  const maxTilt = options.maxTilt ?? 8
  const scale = options.scale ?? 1.02

  const states = reactive(new Map<string | number, TiltState>())

  const getState = (key: string | number): TiltState => {
    if (!states.has(key)) {
      states.set(key, { isHovered: false, rotateX: 0, rotateY: 0, glareX: 50, glareY: 50 })
    }
    return states.get(key)!
  }

  const onMouseMove = (e: MouseEvent, key: string | number) => {
    const target = e.currentTarget as HTMLElement
    if (!target) return
    const rect = target.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const percentX = (x - centerX) / centerX
    const percentY = -((y - centerY) / centerY)

    const s = getState(key)
    s.rotateX = percentY * maxTilt
    s.rotateY = percentX * maxTilt
    s.glareX = (x / rect.width) * 100
    s.glareY = (y / rect.height) * 100
  }

  const onMouseEnter = (key: string | number) => {
    getState(key).isHovered = true
  }

  const onMouseLeave = (key: string | number) => {
    const s = getState(key)
    s.isHovered = false
    s.rotateX = 0
    s.rotateY = 0
    s.glareX = 50
    s.glareY = 50
  }

  const getTiltStyles = (key: string | number, baseTransform = '') => {
    const s = getState(key)
    if (!s.isHovered) {
      return {
        transform: `perspective(1000px) ${baseTransform} rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
        transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
      }
    }
    return {
      transform: `perspective(1000px) ${baseTransform} rotateX(${s.rotateX}deg) rotateY(${s.rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`,
      transition: 'transform 0.1s ease-out, box-shadow 0.1s ease-out',
      '--glare-x': `${s.glareX}%`,
      '--glare-y': `${s.glareY}%`,
    }
  }

  return { onMouseMove, onMouseEnter, onMouseLeave, getTiltStyles, getState }
}
