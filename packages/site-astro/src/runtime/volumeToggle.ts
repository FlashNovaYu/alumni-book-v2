import { hasAudioContext, isAudioMuted, playCrystalTick, toggleAudioMuted } from './audioSynth'
import { useMouseTilt } from '../composables/useMouseTilt'

const { initDeviceOrientation } = useMouseTilt()

interface VolumeRuntime { destroy(): void }

declare global {
  interface Window { __alumniVolumeRuntime?: VolumeRuntime }
}

function updateButtons() {
  const muted = isAudioMuted()
  document.querySelectorAll<HTMLButtonElement>('[data-volume-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(muted))
    button.setAttribute('aria-label', muted ? '开启页面音效' : '关闭页面音效')
    button.title = muted ? '开启页面音效' : '关闭页面音效'
    button.dataset.muted = String(muted)
  })
}

export function initVolumeToggle() {
  window.__alumniVolumeRuntime?.destroy()
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-volume-toggle]'))
  const hoverTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-audio-hover]'))
  let lastHoverAt = 0
  const onClick = () => {
    toggleAudioMuted()
    updateButtons()
    if (!isAudioMuted()) {
      initDeviceOrientation?.()
    }
  }
  const onHover = () => {
    const now = performance.now()
    if (now - lastHoverAt < 100) return
    lastHoverAt = now
    if (hasAudioContext()) playCrystalTick()
  }
  buttons.forEach((button) => button.addEventListener('click', onClick))
  hoverTargets.forEach((target) => target.addEventListener('pointerenter', onHover, { passive: true }))
  updateButtons()
  const runtime: VolumeRuntime = {
    destroy() {
      buttons.forEach((button) => button.removeEventListener('click', onClick))
      hoverTargets.forEach((target) => target.removeEventListener('pointerenter', onHover))
    },
  }
  window.__alumniVolumeRuntime = runtime
  return runtime
}

export { setAudioMuted, toggleAudioMuted } from './audioSynth'
