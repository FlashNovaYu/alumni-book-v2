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
  
  // Layer 1: The body of the tick (Sine)
  const osc1 = context.createOscillator()
  const gain1 = context.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(1400, now)
  osc1.frequency.exponentialRampToValueAtTime(600, now + 0.04)
  gain1.gain.setValueAtTime(0, now)
  gain1.gain.linearRampToValueAtTime(0.4, now + 0.005)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
  
  // Layer 2: The crisp click edge (Triangle)
  const osc2 = context.createOscillator()
  const gain2 = context.createGain()
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(4000, now)
  osc2.frequency.exponentialRampToValueAtTime(1000, now + 0.02)
  gain2.gain.setValueAtTime(0, now)
  gain2.gain.linearRampToValueAtTime(0.15, now + 0.002)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.02)
  
  osc1.connect(gain1).connect(context.destination)
  osc2.connect(gain2).connect(context.destination)
  
  osc1.start(now)
  osc2.start(now)
  osc1.stop(now + 0.04)
  osc2.stop(now + 0.02)
}

export function playPaperSlide() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  
  const now = context.currentTime
  
  // A soft airy sweep using noise and a moving filter
  const source = context.createBufferSource()
  source.buffer = createNoiseBuffer(context)
  
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(3000, now)
  filter.frequency.exponentialRampToValueAtTime(600, now + 0.15)
  
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.2, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  
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
  
  // Layer 1: Deep sub bass (Sine)
  const sub = context.createOscillator()
  const gainSub = context.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(120, now)
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.5)
  gainSub.gain.setValueAtTime(0, now)
  gainSub.gain.linearRampToValueAtTime(0.5, now + 0.1)
  gainSub.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
  
  // Layer 2: Subtle mid-low warmth (Triangle)
  const mid = context.createOscillator()
  const gainMid = context.createGain()
  mid.type = 'triangle'
  mid.frequency.setValueAtTime(200, now)
  mid.frequency.exponentialRampToValueAtTime(60, now + 0.3)
  
  // Lowpass filter for the mid layer to make it muffled
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(800, now)
  filter.frequency.linearRampToValueAtTime(200, now + 0.3)
  
  gainMid.gain.setValueAtTime(0, now)
  gainMid.gain.linearRampToValueAtTime(0.15, now + 0.05)
  gainMid.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
  
  sub.connect(gainSub).connect(context.destination)
  mid.connect(filter).connect(gainMid).connect(context.destination)
  
  sub.start(now)
  mid.start(now)
  sub.stop(now + 0.5)
  mid.stop(now + 0.3)
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
