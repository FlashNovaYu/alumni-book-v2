import { reactive, onUnmounted, getCurrentInstance } from 'vue'

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
    if (!isDeviceOrientationActive) {
      s.rotateX = 0
      s.rotateY = 0
    }
    s.glareX = 50
    s.glareY = 50
  }

  // --- Device Orientation (Gyroscope) ---
  let isDeviceOrientationActive = false
  let baseBeta: number | null = null
  let currentRotateX = 0
  let currentRotateY = 0
  let targetRotateX = 0
  let targetRotateY = 0
  let rafId: number | null = null

  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)

  const handleOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return

    // 设定首次捕获的角度作为基准前后倾斜度
    if (baseBeta === null) {
      baseBeta = e.beta
    }

    const deltaBeta = e.beta - baseBeta
    const gamma = e.gamma

    // 将约 45 度的倾斜映射为 maxTilt 极值
    targetRotateX = clamp((deltaBeta / 45) * maxTilt, -maxTilt, maxTilt)
    targetRotateY = clamp((gamma / 45) * maxTilt, -maxTilt, maxTilt)
  }

  const loop = () => {
    if (!isDeviceOrientationActive) return

    // 低通滤波平滑插值 (0.1 防止抖动)
    currentRotateX += (targetRotateX - currentRotateX) * 0.1
    currentRotateY += (targetRotateY - currentRotateY) * 0.1

    states.forEach((s) => {
      // 若鼠标正 Hover (桌面端优先)，则以鼠标为准；否则由陀螺仪接管
      if (!s.isHovered) {
        s.rotateX = currentRotateX
        s.rotateY = currentRotateY
      }
    })

    rafId = requestAnimationFrame(loop)
  }

  const startOrientationListener = () => {
    if (isDeviceOrientationActive || typeof window === 'undefined') return
    isDeviceOrientationActive = true
    window.addEventListener('deviceorientation', handleOrientation)
    loop()
  }

  const initDeviceOrientation = async () => {
    if (typeof window === 'undefined') return
    const iOSDeviceOrientationEvent = (window as any).DeviceOrientationEvent
    if (typeof iOSDeviceOrientationEvent?.requestPermission === 'function') {
      try {
        const permission = await iOSDeviceOrientationEvent.requestPermission()
        if (permission === 'granted') {
          startOrientationListener()
        }
      } catch (e) {
        console.error('DeviceOrientation permission denied', e)
      }
    } else {
      startOrientationListener()
    }
  }

  const stopDeviceOrientation = () => {
    if (!isDeviceOrientationActive) return
    isDeviceOrientationActive = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    // 复位非 hover 状态的卡片
    states.forEach((s) => {
      if (!s.isHovered) {
        s.rotateX = 0
        s.rotateY = 0
      }
    })
  }

  // 组件卸载时自动清理事件
  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopDeviceOrientation()
    })
  }

  const getTiltStyles = (key: string | number, baseTransform = '') => {
    const s = getState(key)
    // 若既未 hover 又未激活陀螺仪，则静止
    if (!s.isHovered && !isDeviceOrientationActive) {
      return {
        transform: `perspective(1000px) ${baseTransform} rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
        transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
      }
    }

    // 缩放逻辑：鼠标 Hover 时放大，纯陀螺仪控制时不放大
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
    onMouseEnter,
    onMouseLeave,
    getTiltStyles,
    getState,
    initDeviceOrientation,
    stopDeviceOrientation
  }
}
