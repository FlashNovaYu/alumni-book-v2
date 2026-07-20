import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = resolve(__dirname, '../src')
const audioAssets = resolve(__dirname, '../public/audio/ui')
const read = (file: string) => readFileSync(resolve(src, file), 'utf8')

describe('温润青春档案音效契约', () => {
  it('导出五个语义化音效 cue', () => {
    const audio = read('runtime/audioSynth.ts')
    for (const cue of ['archiveHover', 'archiveSlide', 'albumOpen', 'bookSettle', 'archiveConfirm']) {
      expect(audio).toContain(cue)
    }
    expect(audio).not.toContain('playCrystalTick')
    expect(audio).not.toContain('playPaperSlide')
    expect(audio).not.toContain('playDeepWhoosh')
  })

  it('所有声部经 master bus 输出并限制活动声部', () => {
    const audio = read('runtime/audioSynth.ts')
    expect(audio).toContain('masterGain')
    expect(audio).toContain('DynamicsCompressorNode')
    expect(audio).toContain('MAX_ACTIVE_VOICES')
    expect(audio).toContain('masterGain.connect(compressor)')
    expect(audio).toContain('compressor.connect(context.destination)')
    expect(audio).not.toContain('osc.connect(context.destination)')
    expect(audio).not.toContain('source.connect(context.destination)')
    expect(audio).not.toContain('noise.connect(context.destination)')
  })

  it('音频资源只通过懒加载清单读取并支持 null 回退', () => {
    const assets = read('runtime/audioAssets.ts')
    expect(assets).toContain('wood-tap.ogg')
    expect(assets).toContain('paper-brush.ogg')
    expect(assets).toContain('camera-shutter.ogg')
    expect(assets).toContain('Promise<AudioBuffer | null>')
  })

  it('仓库包含三段短微采样资源', () => {
    for (const file of ['wood-tap.ogg', 'paper-brush.ogg', 'camera-shutter.ogg']) {
      expect(existsSync(resolve(audioAssets, file))).toBe(true)
    }
  })
})
