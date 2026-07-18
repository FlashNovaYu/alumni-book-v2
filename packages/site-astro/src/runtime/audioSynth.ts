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
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const now = context.currentTime
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(1200, now)
  oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.05)
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.linearRampToValueAtTime(0.5, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.05)
}

export function playPaperSlide() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  const source = context.createBufferSource()
  source.buffer = createNoiseBuffer(context)
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 800
  filter.Q.value = 1.5
  const gain = context.createGain()
  const now = context.currentTime
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.linearRampToValueAtTime(0.3, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(now)
  source.stop(now + 0.1)
}

export function playDeepWhoosh() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const now = context.currentTime
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(100, now)
  oscillator.frequency.exponentialRampToValueAtTime(30, now + 0.4)
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.linearRampToValueAtTime(0.4, now + 0.1)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.4)
}

export function toggleAudioMuted() {
  const next = !muted
  setAudioMuted(next)
  if (!next) playCrystalTick()
  return next
}
