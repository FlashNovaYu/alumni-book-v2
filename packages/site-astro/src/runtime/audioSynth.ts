const storageKey = 'site_audio_muted'

let audioContext: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = false

if (typeof window !== 'undefined') {
  muted = window.localStorage.getItem(storageKey) === 'true'
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioContext) return audioContext
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  audioContext = new AudioContextClass()
  return audioContext
}

export function hasAudioContext() {
  return audioContext !== null
}

function resumeContext(context: AudioContext) {
  if (context.state === 'suspended') void context.resume()
}

export function createNoiseBuffer(context: AudioContext) {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.1), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

export function isAudioMuted() {
  return muted
}

export function setAudioMuted(next: boolean) {
  muted = next
  if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, String(next))
}

export function playCrystalTick() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  
  const now = context.currentTime
  
  // Pen tap has a short, sharp transient and a tiny hollow body
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(300, now)
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.03)
  
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.6, now + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
  
  // Mix some high-passed noise for the "click" texture
  const noise = context.createBufferSource()
  noise.buffer = createNoiseBuffer(context)
  const noiseFilter = context.createBiquadFilter()
  noiseFilter.type = 'highpass'
  noiseFilter.frequency.value = 4000
  const noiseGain = context.createGain()
  noiseGain.gain.setValueAtTime(0, now)
  noiseGain.gain.linearRampToValueAtTime(0.3, now + 0.002)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015)
  
  osc.connect(gain).connect(context.destination)
  noise.connect(noiseFilter).connect(noiseGain).connect(context.destination)
  
  osc.start(now)
  noise.start(now)
  osc.stop(now + 0.04)
  noise.stop(now + 0.02)
}

export function playPaperSlide() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  
  const now = context.currentTime
  
  // Soft paper friction
  const source = context.createBufferSource()
  source.buffer = createNoiseBuffer(context)
  
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.8
  filter.frequency.setValueAtTime(800, now)
  filter.frequency.exponentialRampToValueAtTime(2000, now + 0.1)
  
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.15, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(now)
  source.stop(now + 0.15)
}

export function playDeepWhoosh() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  
  const now = context.currentTime
  
  // Soft book thud / page settle (Sine + Triangle)
  const sub = context.createOscillator()
  const gainSub = context.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(150, now)
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.2)
  gainSub.gain.setValueAtTime(0, now)
  gainSub.gain.linearRampToValueAtTime(0.4, now + 0.02)
  gainSub.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
  
  const mid = context.createOscillator()
  const gainMid = context.createGain()
  mid.type = 'triangle'
  mid.frequency.setValueAtTime(300, now)
  mid.frequency.exponentialRampToValueAtTime(80, now + 0.1)
  gainMid.gain.setValueAtTime(0, now)
  gainMid.gain.linearRampToValueAtTime(0.1, now + 0.01)
  gainMid.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  
  // Paper rustle on close
  const noise = context.createBufferSource()
  noise.buffer = createNoiseBuffer(context)
  const noiseFilter = context.createBiquadFilter()
  noiseFilter.type = 'lowpass'
  noiseFilter.frequency.value = 1000
  const noiseGain = context.createGain()
  noiseGain.gain.setValueAtTime(0, now)
  noiseGain.gain.linearRampToValueAtTime(0.05, now + 0.02)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
  
  sub.connect(gainSub).connect(context.destination)
  mid.connect(gainMid).connect(context.destination)
  noise.connect(noiseFilter).connect(noiseGain).connect(context.destination)
  
  sub.start(now)
  mid.start(now)
  noise.start(now)
  sub.stop(now + 0.3)
  mid.stop(now + 0.2)
  noise.stop(now + 0.25)
}

export function toggleAudioMuted() {
  const next = !muted
  setAudioMuted(next)
  if (!next) playCrystalTick()
  return next
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!audioContext) return
    if (document.hidden) {
      void audioContext.suspend()
    } else if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }
  })
}
