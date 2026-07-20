export type UiAudioAsset = 'woodTap' | 'paperBrush' | 'cameraShutter'

const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
const assetPaths: Record<UiAudioAsset, string> = {
  woodTap: `${base}audio/ui/wood-tap.ogg`,
  paperBrush: `${base}audio/ui/paper-brush.ogg`,
  cameraShutter: `${base}audio/ui/camera-shutter.ogg`,
}

let buffers = new WeakMap<AudioContext, Map<UiAudioAsset, AudioBuffer>>()
let pending = new WeakMap<AudioContext, Map<UiAudioAsset, Promise<AudioBuffer | null>>>()

function getBufferMap(context: AudioContext) {
  let map = buffers.get(context)
  if (!map) {
    map = new Map()
    buffers.set(context, map)
  }
  return map
}

function getPendingMap(context: AudioContext) {
  let map = pending.get(context)
  if (!map) {
    map = new Map()
    pending.set(context, map)
  }
  return map
}

export function getUiAudio(context: AudioContext, asset: UiAudioAsset) {
  return getBufferMap(context).get(asset) || null
}

export function loadUiAudio(context: AudioContext, asset: UiAudioAsset): Promise<AudioBuffer | null> {
  const cached = getUiAudio(context, asset)
  if (cached) return Promise.resolve(cached)

  const pendingMap = getPendingMap(context)
  const existing = pendingMap.get(asset)
  if (existing) return existing

  const request = fetch(assetPaths[asset])
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load UI audio: ${asset}`)
      return response.arrayBuffer()
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      getBufferMap(context).set(asset, buffer)
      return buffer
    })
    .catch(() => null)
    .finally(() => {
      pendingMap.delete(asset)
    })

  pendingMap.set(asset, request)
  return request
}

export function clearUiAudioCache() {
  buffers = new WeakMap()
  pending = new WeakMap()
}
