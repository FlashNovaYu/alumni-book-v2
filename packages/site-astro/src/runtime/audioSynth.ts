import { getUiAudio, loadUiAudio, type UiAudioAsset } from './audioAssets'

const storageKey = 'site_audio_muted'
export const MAX_ACTIVE_VOICES = 2

let audioContext: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let masterGain: GainNode | null = null
let compressor: DynamicsCompressorNode | null = null
let muted = false

type AudioCue = 'archiveHover' | 'archiveSlide' | 'albumOpen' | 'bookSettle' | 'archiveConfirm'

interface ActiveVoice {
  cue: AudioCue
  sources: AudioScheduledSourceNode[]
  protected: boolean
  startedAt: number
}

const activeVoices: ActiveVoice[] = []

if (typeof window !== 'undefined') {
  muted = window.localStorage.getItem(storageKey) === 'true'
}

function getOutputBus(context: AudioContext) {
  if (masterGain && compressor) return masterGain

  masterGain = context.createGain()
  masterGain.gain.value = 0.72
  compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.knee.value = 12
  compressor.ratio.value = 3
  compressor.attack.value = 0.003
  compressor.release.value = 0.12
  masterGain.connect(compressor)
  compressor.connect(context.destination)
  return masterGain
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioContext) {
    getOutputBus(audioContext)
    return audioContext
  }
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  audioContext = new AudioContextClass()
  getOutputBus(audioContext)
  return audioContext
}

export function hasAudioContext() {
  return audioContext !== null
}

function resumeContext(context: AudioContext) {
  if (context.state === 'suspended') void context.resume()
}

export function createNoiseBuffer(context: AudioContext) {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate && noiseBuffer.duration >= 0.35) return noiseBuffer
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.4), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

export function isAudioMuted() {
  return muted
}

function removeVoice(voice: ActiveVoice) {
  const index = activeVoices.indexOf(voice)
  if (index >= 0) activeVoices.splice(index, 1)
}

function stopVoice(voice: ActiveVoice) {
  voice.sources.forEach((source) => {
    try {
      source.stop()
    } catch {
      // The source may have already ended naturally.
    }
  })
  removeVoice(voice)
}

function claimVoice(cue: AudioCue, sources: AudioScheduledSourceNode[], protectedVoice: boolean, startedAt: number) {
  if (activeVoices.length >= MAX_ACTIVE_VOICES) {
    const removable = activeVoices.find((voice) => !voice.protected) || activeVoices[0]
    if (removable) stopVoice(removable)
  }

  const voice: ActiveVoice = { cue, sources, protected: protectedVoice, startedAt }
  activeVoices.push(voice)
  let ended = 0
  const onEnded = () => {
    ended += 1
    if (ended >= sources.length) removeVoice(voice)
  }
  sources.forEach((source) => source.addEventListener('ended', onEnded, { once: true }))
  return voice
}

function startVoice(voice: ActiveVoice, when: number, stopAt: number) {
  voice.sources.forEach((source) => {
    source.start(when)
    source.stop(stopAt)
  })
}

function requestAsset(context: AudioContext, asset: UiAudioAsset) {
  const cached = getUiAudio(context, asset)
  if (cached) return cached
  void loadUiAudio(context, asset)
  return null
}

function scheduleBuffer(context: AudioContext, buffer: AudioBuffer, when: number, duration: number, level: number, filterType?: BiquadFilterType, filterFrequency?: number) {
  const source = context.createBufferSource()
  source.buffer = buffer
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, when)
  gain.gain.linearRampToValueAtTime(level, when + Math.min(0.012, duration * 0.25))
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration)
  if (filterType && filterFrequency) {
    const filter = context.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = filterFrequency
    source.connect(filter).connect(gain).connect(getOutputBus(context))
  } else {
    source.connect(gain).connect(getOutputBus(context))
  }
  return { source, stopAt: when + Math.min(duration, buffer.duration) }
}

function scheduleTone(context: AudioContext, when: number, duration: number, type: OscillatorType, startFrequency: number, endFrequency: number, level: number, filterFrequency?: number) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(startFrequency, when)
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + duration)
  gain.gain.setValueAtTime(0, when)
  gain.gain.linearRampToValueAtTime(level, when + Math.min(0.01, duration * 0.25))
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration)
  if (filterFrequency) {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = filterFrequency
    oscillator.connect(gain).connect(filter).connect(getOutputBus(context))
  } else {
    oscillator.connect(gain).connect(getOutputBus(context))
  }
  return oscillator
}

export function playArchiveHover() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  const now = context.currentTime
  const sources: AudioScheduledSourceNode[] = []
  const sample = requestAsset(context, 'woodTap')
  if (sample) {
    const layer = scheduleBuffer(context, sample, now, 0.055, 0.16, 'lowpass', 2600)
    sources.push(layer.source)
    const voice = claimVoice('archiveHover', sources, false, now)
    startVoice(voice, now, layer.stopAt)
    return
  }
  sources.push(scheduleTone(context, now, 0.042, 'triangle', 680, 360, 0.13, 2600))
  const voice = claimVoice('archiveHover', sources, false, now)
  startVoice(voice, now, now + 0.042)
}

export function playArchiveSlide() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  const now = context.currentTime
  const sources: AudioScheduledSourceNode[] = []
  const sample = requestAsset(context, 'paperBrush')
  if (sample) {
    const layer = scheduleBuffer(context, sample, now, 0.17, 0.085, 'bandpass', 1500)
    sources.push(layer.source)
    const voice = claimVoice('archiveSlide', sources, false, now)
    startVoice(voice, now, layer.stopAt)
    return
  }

  const source = context.createBufferSource()
  source.buffer = createNoiseBuffer(context)
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.65
  filter.frequency.setValueAtTime(620, now)
  filter.frequency.exponentialRampToValueAtTime(1700, now + 0.14)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.085, now + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17)
  source.connect(filter).connect(gain).connect(getOutputBus(context))
  sources.push(source)
  const voice = claimVoice('archiveSlide', sources, false, now)
  startVoice(voice, now, now + 0.18)
}

export function playAlbumOpen() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  const now = context.currentTime
  const sources: AudioScheduledSourceNode[] = []
  const sample = requestAsset(context, 'cameraShutter')
  if (sample) {
    const layer = scheduleBuffer(context, sample, now, 0.135, 0.14, 'highpass', 700)
    sources.push(layer.source)
  } else {
    const noise = context.createBufferSource()
    noise.buffer = createNoiseBuffer(context)
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2300
    filter.Q.value = 1.2
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.075, now + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    noise.connect(filter).connect(gain).connect(getOutputBus(context))
    sources.push(noise)
  }
  sources.push(scheduleTone(context, now, 0.055, 'sine', 392, 470, 0.055, 2500))
  sources.push(scheduleTone(context, now + 0.045, 0.075, 'sine', 587, 680, 0.04, 2800))
  const voice = claimVoice('albumOpen', sources, true, now)
  voice.sources[1].start(now)
  voice.sources[1].stop(now + 0.055)
  voice.sources[2].start(now + 0.045)
  voice.sources[2].stop(now + 0.12)
  if (sources[0]) {
    sources[0].start(now)
    sources[0].stop(now + (sample ? 0.135 : 0.1))
  }
}

export function playBookSettle() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  const now = context.currentTime
  const sources: AudioScheduledSourceNode[] = []
  sources.push(scheduleTone(context, now, 0.28, 'sine', 128, 72, 0.075, 480))
  sources.push(scheduleTone(context, now, 0.18, 'triangle', 250, 118, 0.035, 720))
  const paper = context.createBufferSource()
  paper.buffer = createNoiseBuffer(context)
  const paperFilter = context.createBiquadFilter()
  paperFilter.type = 'lowpass'
  paperFilter.frequency.value = 900
  const paperGain = context.createGain()
  paperGain.gain.setValueAtTime(0, now)
  paperGain.gain.linearRampToValueAtTime(0.025, now + 0.02)
  paperGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
  paper.connect(paperFilter).connect(paperGain).connect(getOutputBus(context))
  sources.push(paper)
  const voice = claimVoice('bookSettle', sources, true, now)
  startVoice(voice, now, now + 0.3)
}

export function playArchiveConfirm() {
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  resumeContext(context)
  const now = context.currentTime
  const first = scheduleTone(context, now, 0.105, 'sine', 294, 330, 0.07, 1800)
  const second = scheduleTone(context, now + 0.075, 0.14, 'sine', 440, 494, 0.055, 2200)
  claimVoice('archiveConfirm', [first, second], true, now)
  first.start(now)
  first.stop(now + 0.105)
  second.start(now + 0.075)
  second.stop(now + 0.215)
}

export function playAudioCue(cue: AudioCue) {
  switch (cue) {
    case 'archiveHover': playArchiveHover(); break
    case 'archiveSlide': playArchiveSlide(); break
    case 'albumOpen': playAlbumOpen(); break
    case 'bookSettle': playBookSettle(); break
    case 'archiveConfirm': playArchiveConfirm(); break
  }
}

export function setAudioMuted(next: boolean) {
  muted = next
  if (next) activeVoices.slice().forEach(stopVoice)
  if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, String(next))
}

export function toggleAudioMuted() {
  const next = !muted
  setAudioMuted(next)
  if (!next) playArchiveConfirm()
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
