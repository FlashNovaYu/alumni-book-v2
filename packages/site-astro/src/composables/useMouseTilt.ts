import { reactive, onUnmounted, getCurrentInstance } from 'vue'
import { getCurrentMotionBudget, getMotionFrameInterval } from '../utils/motion'

interface TiltOptions {
  maxTilt?: number
  scale?: number
}

interface TiltState {
  isHovered: boolean
  isOrientationActive: boolean
  maxTilt: number
  rotateX: number
  rotateY: number
  glareX: number
  glareY: number
}

export type DeviceOrientationStatus = 'idle' | 'granted' | 'unsupported' | 'insecure-context' | 'denied' | 'error'

const round = (value: number) => Number(value.toFixed(2))

export function classifyDeviceOrientation(input: { isSecureContext: boolean; hasEvent: boolean }): DeviceOrientationStatus {
  if (!input.isSecureContext) return 'insecure-context'
  if (!input.hasEvent) return 'unsupported'
  return 'idle'
}

export function mapOrientationToTilt(input: { beta: number; gamma: number; baseBeta: number; maxTilt: number }) {
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
  const rotateX = clamp(round(((input.beta - input.baseBeta) / 45) * input.maxTilt), -input.maxTilt, input.maxTilt)
  const rotateY = clamp(round((input.gamma / 45) * input.maxTilt), -input.maxTilt, input.maxTilt)
  const glareX = clamp(round(50 + (input.gamma / 45) * 50), 0, 100)
  const glareY = clamp(round(50 - ((input.beta - input.baseBeta) / 45) * 50), 0, 100)
  return { rotateX, rotateY, glareX, glareY }
}

export function mapPointerToGlare(input: { x: number; y: number; width: number; height: number }) {
  return {
    glareX: Math.min(100, Math.max(0, round((input.x / input.width) * 100))),
    glareY: Math.min(100, Math.max(0, round((input.y / input.height) * 100))),
  }
}

// Shared Gyroscope State
let isDeviceOrientationActive = false
let baseBeta: number | null = null
let currentRotateX = 0
let currentRotateY = 0
let targetRotateX = 0
let targetRotateY = 0
let currentGlareX = 50
let currentGlareY = 50
let targetGlareX = 50
let targetGlareY = 50
let orientationFrameId: number | null = null
let lastOrientationFrame = Number.NEGATIVE_INFINITY
let orientationFrameInterval = getMotionFrameInterval(getCurrentMotionBudget())
let lastAmbientX: number | null = null
let lastAmbientY: number | null = null

const syncAmbientTilt = () => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const ambientX = round(currentRotateY * 16)
  const ambientY = round(currentRotateX * 16)
  if (ambientX === lastAmbientX && ambientY === lastAmbientY) return
  lastAmbientX = ambientX
  lastAmbientY = ambientY
  root.style.setProperty('--ambient-tilt-x', `${ambientX}px`)
  root.style.setProperty('--ambient-tilt-y', `${ambientY}px`)
  root.style.setProperty('--ambient-hero-x', `${round(ambientX * 0.3)}px`)
  root.style.setProperty('--ambient-hero-y', `${round(ambientY * 0.3)}px`)
  document.dispatchEvent(new CustomEvent('alumni:ambient-tilt', { detail: { x: ambientX, y: ambientY } }))
}

const handleOrientation = (e: DeviceOrientationEvent) => {
  if (e.beta === null || e.gamma === null) return
  if (baseBeta === null) baseBeta = e.beta
  const target = mapOrientationToTilt({ beta: e.beta, gamma: e.gamma, baseBeta, maxTilt: 8 })
  targetRotateX = target.rotateX / 8
  targetRotateY = target.rotateY / 8
  targetGlareX = target.glareX
  targetGlareY = target.glareY
  queueOrientationFrame()
}

const activeStates = new Set<Map<string | number, TiltState>>()

const updateOrientationStates = () => {
  activeStates.forEach((states) => {
    states.forEach((s) => {
      if (!s.isHovered) {
        s.isOrientationActive = true
        s.rotateX = currentRotateX * s.maxTilt
        s.rotateY = currentRotateY * s.maxTilt
        s.glareX = currentGlareX
        s.glareY = currentGlareY
      }
    })
  })
}

const queueOrientationFrame = () => {
  if (!isDeviceOrientationActive || orientationFrameId !== null || typeof window === 'undefined') return
  orientationFrameId = requestAnimationFrame(updateOrientation)
}

const updateOrientation = (timestamp: number) => {
  orientationFrameId = null
  if (!isDeviceOrientationActive) return
  if (timestamp - lastOrientationFrame < orientationFrameInterval) {
    queueOrientationFrame()
    return
  }
  lastOrientationFrame = timestamp
  currentRotateX += (targetRotateX - currentRotateX) * 0.1
  currentRotateY += (targetRotateY - currentRotateY) * 0.1
  currentGlareX += (targetGlareX - currentGlareX) * 0.1
  currentGlareY += (targetGlareY - currentGlareY) * 0.1
  syncAmbientTilt()
  updateOrientationStates()

  const settled = [
    targetRotateX - currentRotateX,
    targetRotateY - currentRotateY,
    targetGlareX - currentGlareX,
    targetGlareY - currentGlareY,
  ].every((difference) => Math.abs(difference) < 0.01)
  if (!settled) queueOrientationFrame()
}

const startOrientationListener = () => {
  if (isDeviceOrientationActive || typeof window === 'undefined') return
  isDeviceOrientationActive = true
  orientationFrameInterval = getMotionFrameInterval(getCurrentMotionBudget())
  lastOrientationFrame = Number.NEGATIVE_INFINITY
  activeStates.forEach((states) => states.forEach((state) => { state.isOrientationActive = true }))
  window.addEventListener('deviceorientation', handleOrientation)
}

export const initDeviceOrientation = async (): Promise<DeviceOrientationStatus> => {
  if (typeof window === 'undefined') return 'unsupported'
  const status = classifyDeviceOrientation({
    isSecureContext: window.isSecureContext,
    hasEvent: typeof window.DeviceOrientationEvent !== 'undefined',
  })
  if (status !== 'idle') return status
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'unsupported'
  if (isDeviceOrientationActive) return 'granted'

  const orientationEvent = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (typeof orientationEvent.requestPermission === 'function') {
    try {
      const permission = await orientationEvent.requestPermission()
      if (permission === 'granted') {
        startOrientationListener()
        return 'granted'
      }
      return 'denied'
    } catch (e) {
      console.error('DeviceOrientation permission denied', e)
      return 'error'
    }
  }
  startOrientationListener()
  return 'granted'
}

export const stopDeviceOrientation = () => {
  isDeviceOrientationActive = false
  if (typeof window !== 'undefined') {
    window.removeEventListener('deviceorientation', handleOrientation)
  }
  if (orientationFrameId !== null) {
    cancelAnimationFrame(orientationFrameId)
    orientationFrameId = null
  }
  lastOrientationFrame = Number.NEGATIVE_INFINITY
  baseBeta = null
  currentRotateX = 0
  currentRotateY = 0
  targetRotateX = 0
  targetRotateY = 0
  currentGlareX = 50
  currentGlareY = 50
  targetGlareX = 50
  targetGlareY = 50
  syncAmbientTilt()
  activeStates.forEach((states) => {
    states.forEach((s) => {
      s.isOrientationActive = false
      if (!s.isHovered) {
        s.rotateX = 0
        s.rotateY = 0
        s.glareX = 50
        s.glareY = 50
      }
    })
  })
}

export function useMouseTilt(options: TiltOptions = {}) {
  const maxTilt = options.maxTilt ?? 8
  const scale = options.scale ?? 1.02

  const states = reactive(new Map<string | number, TiltState>())
  activeStates.add(states)
  const pendingPointers = new Map<string | number, {
    target: HTMLElement
    clientX: number
    clientY: number
    pointerType: string
  }>()
  let pointerFrameId: number | null = null

  const getState = (key: string | number): TiltState => {
    if (!states.has(key)) {
      states.set(key, {
        isHovered: false,
        isOrientationActive: isDeviceOrientationActive,
        maxTilt,
        rotateX: 0,
        rotateY: 0,
        glareX: 50,
        glareY: 50,
      })
    }
    return states.get(key)!
  }

  const flushPointers = () => {
    pointerFrameId = null
    pendingPointers.forEach((pending, key) => {
      const rect = pending.target.getBoundingClientRect()
      const x = pending.clientX - rect.left
      const y = pending.clientY - rect.top
      const centerX = rect.width / 2 || 1
      const centerY = rect.height / 2 || 1
      const percentX = (x - centerX) / centerX
      const percentY = -((y - centerY) / centerY)

      const s = getState(key)
      s.rotateX = percentY * maxTilt
      s.rotateY = percentX * maxTilt
      const glare = mapPointerToGlare({ x, y, width: rect.width || 1, height: rect.height || 1 })
      s.glareX = glare.glareX
      s.glareY = glare.glareY
    })
    pendingPointers.clear()
  }

  const queuePointerFrame = () => {
    if (pointerFrameId === null) pointerFrameId = requestAnimationFrame(flushPointers)
  }

  const onPointerMove = (e: MouseEvent | PointerEvent, key: string | number) => {
    const target = e.currentTarget as HTMLElement
    if (!target) return
    const s = getState(key)
    const pointerType = 'pointerType' in e ? e.pointerType || 'mouse' : 'mouse'
    if (pointerType !== 'mouse') s.isHovered = true
    pendingPointers.set(key, { target, clientX: e.clientX, clientY: e.clientY, pointerType })
    queuePointerFrame()
  }

  const onMouseMove = onPointerMove

  const onMouseEnter = (key: string | number) => {
    getState(key).isHovered = true
  }

  const onMouseLeave = (key: string | number) => {
    pendingPointers.delete(key)
    if (pendingPointers.size === 0 && pointerFrameId !== null) {
      cancelAnimationFrame(pointerFrameId)
      pointerFrameId = null
    }
    const s = getState(key)
    s.isHovered = false
    if (!isDeviceOrientationActive) {
      s.rotateX = 0
      s.rotateY = 0
      s.glareX = 50
      s.glareY = 50
    }
  }

  const onPointerEnd = (e: PointerEvent, key: string | number) => {
    if (e.pointerType !== 'mouse') onMouseLeave(key)
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      pendingPointers.clear()
      if (pointerFrameId !== null) {
        cancelAnimationFrame(pointerFrameId)
        pointerFrameId = null
      }
      activeStates.delete(states)
      if (activeStates.size === 0) stopDeviceOrientation()
    })
  }

  const getTiltStyles = (key: string | number, baseTransform = '') => {
    const s = getState(key)
    if (!s.isHovered && !s.isOrientationActive) {
      return {
        transform: `perspective(1000px) ${baseTransform} rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
        transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
        '--glare-x': `${s.glareX}%`,
        '--glare-y': `${s.glareY}%`,
      }
    }

    const currentScale = s.isHovered ? scale : 1

    return {
      transform: `perspective(1000px) ${baseTransform} rotateX(${s.rotateX}deg) rotateY(${s.rotateY}deg) scale3d(${currentScale}, ${currentScale}, ${currentScale})`,
      transition: 'transform 0.1s ease-out, box-shadow 0.1s ease-out',
      '--glare-x': `${s.glareX}%`,
      '--glare-y': `${s.glareY}%`,
    }
  }

  return {
    onMouseMove,
    onPointerMove,
    onPointerEnd,
    onMouseEnter,
    onMouseLeave,
    getTiltStyles,
    getState,
    initDeviceOrientation,
    stopDeviceOrientation
  }
}
