# 温润青春档案交互音效实施计划

> **执行说明：** 本计划按任务逐项执行并在每个验证点停留；项目约束禁止启用 `superpowers` 子技能，因此由当前会话直接完成和复核。

**目标：** 将公开站点现有的泛用合成 click/噪声替换为“纸页、铅笔、胶片相机、木桌”主题的高级短交互音效，同时保留惰性加载、静音持久化和低运行时开销。

**架构：** `audioSynth.ts` 负责 AudioContext、master bus、程序化音色和最多两个活动声部；`audioAssets.ts` 负责用户首次触发后的短微采样加载、缓存和失败回退。现有 Astro/Vue 组件只调用语义化 cue，不再直接选择音色。导航抽屉关闭由现有 `navRuntime.ts` 触发 `bookSettle`，相册打开由 `AlbumGrid.vue` 触发 `albumOpen`。

**技术栈：** Web Audio API、TypeScript、Astro/Vue、Vitest 静态测试、Playwright 浏览器测试、ffmpeg 生成并压缩短 OGG 微采样。

---

## 文件结构与职责

### 新增

- `packages/site-astro/src/runtime/audioAssets.ts`：UI 音频资源清单、首次触发后的加载 Promise 缓存、`AudioBuffer` 缓存和失败返回 `null`。
- `packages/site-astro/public/audio/ui/wood-tap.ogg`：木质铅笔触点，单声道、约 45ms。
- `packages/site-astro/public/audio/ui/paper-brush.ogg`：纸张摩擦纹理，单声道、约 160ms。
- `packages/site-astro/public/audio/ui/camera-shutter.ogg`：轻机械快门纹理，单声道、约 120ms。
- `packages/site-astro/tests/audio-synth-static.test.ts`：音效角色、总线、并发限制、资源回退和命名契约的静态测试。

### 修改

- `packages/site-astro/src/runtime/audioSynth.ts`：重做 cue API、master bus、程序化层、微采样混合、voice budget、可见性暂停和静音逻辑。
- `packages/site-astro/src/runtime/volumeToggle.ts`：悬停改用 `archiveHover`，开启音效改用 `archiveConfirm`。
- `packages/site-astro/src/composables/useAudioSynth.ts`：暴露语义化 cue 名称，移除旧的材质命名。
- `packages/site-astro/src/components/ArchiveRosterCard.vue`：卡片悬停/触摸使用 `archiveSlide`，触摸只播放一次。
- `packages/site-astro/src/components/AlbumGrid.vue`：照片悬停/触摸使用 `archiveSlide`，打开灯箱使用 `albumOpen`，避免触摸和点击重复播放。
- `packages/site-astro/src/scripts/navRuntime.ts`：现有抽屉真正从打开状态关闭时触发一次 `bookSettle`。
- `packages/site-astro/tests/runtime-performance.spec.ts`：更新惰性音效断言，覆盖单一 master bus 和新 cue 名称。
- `packages/site-astro/tests/runtime-performance-browser.spec.ts`：覆盖首次音效交互前无 UI 音频请求、开启后只建立一个上下文，以及连续悬停不产生无限请求。

---

## Task 1：先锁定新的音效契约并让测试失败

**Files:**

- Create: `packages/site-astro/tests/audio-synth-static.test.ts`
- Modify: `packages/site-astro/tests/runtime-performance.spec.ts`

- [ ] **Step 1: 编写 cue、总线和资源回退的失败静态测试**

在 `audio-synth-static.test.ts` 中读取 `runtime/audioSynth.ts` 和 `runtime/audioAssets.ts`，加入以下断言：

```ts
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
```

- [ ] **Step 2: 更新运行时性能静态测试的契约**

将 `runtime-performance.spec.ts` 中旧的 `createNoiseBuffer`/旧 cue 断言改为同时断言：`new AudioContextClass()`、`createNoiseBuffer`、`audioAssets` 的懒加载入口、`masterGain`、`document.addEventListener('visibilitychange'` 和 `audio` 文件没有 `onMounted`。

- [ ] **Step 3: 运行测试确认测试先失败**

运行：

```bash
pnpm --filter site-astro exec vitest run tests/audio-synth-static.test.ts tests/runtime-performance.spec.ts
```

预期：FAIL，原因是新 cue、master bus 和 `audioAssets.ts` 尚不存在；不得跳过失败直接修改实现。

- [ ] **Step 4: 提交测试契约**

```bash
git add packages/site-astro/tests/audio-synth-static.test.ts packages/site-astro/tests/runtime-performance.spec.ts
git commit -m "test: define warm archive audio contracts"
```

## Task 2：生成并校验三段微采样

**Files:**

- Create: `packages/site-astro/public/audio/ui/wood-tap.ogg`
- Create: `packages/site-astro/public/audio/ui/paper-brush.ogg`
- Create: `packages/site-astro/public/audio/ui/camera-shutter.ogg`

- [ ] **Step 1: 以统一规格生成源音频**

用 ffmpeg 生成 44.1kHz、单声道、16-bit PCM 源文件，再转为低码率 OGG。音色配方必须遵守：木质触点使用短衰减的 180–520Hz 复合音；纸张使用带随机纹理的 500–1900Hz 带通噪声并在尾端平滑淡出；快门使用 2–4 个 1–4kHz 的短机械 transient 加轻微上行双音。每个源文件前后均留 2ms 静音，避免点击声。

转换命令统一使用：

```bash
ffmpeg -y -i <source.wav> -c:a libopus -b:a 32k -vbr on <target.ogg>
```

- [ ] **Step 2: 校验文件格式、时长和总预算**

运行：

```bash
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels,duration -of default=noprint_wrappers=1 packages/site-astro/public/audio/ui/wood-tap.ogg packages/site-astro/public/audio/ui/paper-brush.ogg packages/site-astro/public/audio/ui/camera-shutter.ogg
Get-ChildItem packages/site-astro/public/audio/ui/*.ogg | Measure-Object -Property Length -Sum
```

预期：三个文件均为可解码音频、单声道、时长分别不超过 60ms/180ms/140ms，压缩后总大小不超过 35KB。

- [ ] **Step 3: 运行资源存在性测试**

在 `audio-synth-static.test.ts` 增加对三个相对路径文件存在的断言，运行该测试确认资源已被纳入仓库。

- [ ] **Step 4: 提交微采样资源**

```bash
git add packages/site-astro/public/audio/ui
git commit -m "feat: add warm archive micro samples"
```

## Task 3：实现资源加载与 Web Audio cue 引擎

**Files:**

- Create: `packages/site-astro/src/runtime/audioAssets.ts`
- Modify: `packages/site-astro/src/runtime/audioSynth.ts`

- [ ] **Step 1: 实现资源清单和缓存**

`audioAssets.ts` 提供以下固定接口，不在模块初始化阶段调用 `fetch` 或创建 `AudioContext`：

```ts
export type UiAudioAsset = 'woodTap' | 'paperBrush' | 'cameraShutter'
export function loadUiAudio(context: AudioContext, asset: UiAudioAsset): Promise<AudioBuffer | null>
export function clearUiAudioCache(): void
```

资源路径使用 `import.meta.env.BASE_URL` 拼接 `/audio/ui/wood-tap.ogg`、`/audio/ui/paper-brush.ogg`、`/audio/ui/camera-shutter.ogg`，以兼容嵌套站点基路径；同一资源的并发调用共享一个 Promise；非 2xx、解码失败或浏览器不支持 `decodeAudioData` 时返回 `null`，不得抛出到组件事件处理器。

- [ ] **Step 2: 建立惰性 AudioContext 和 master bus**

在 `audioSynth.ts` 中保留现有 `getAudioContext()`、`hasAudioContext()`、静音 key 和 `visibilitychange` 生命周期；首次播放前仍不创建上下文。上下文创建后只初始化一次：

```ts
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
```

所有 oscillator、buffer source 和程序化噪声必须连接到 `masterGain`，禁止 cue 直接连接 `context.destination`。

- [ ] **Step 3: 实现最多两个活动声部的 voice budget**

定义 `const MAX_ACTIVE_VOICES = 2` 和活动声部集合；注册 source 的 `onended` 清理引用。超过上限时优先停止最早的 `archiveHover`/`archiveSlide`，点击确认和抽屉收束音不得被新的悬停声挤掉。

- [ ] **Step 4: 实现五个 cue 的程序化层和微采样混合**

导出以下 API：

```ts
export type AudioCue = 'archiveHover' | 'archiveSlide' | 'albumOpen' | 'bookSettle' | 'archiveConfirm'
export function playAudioCue(cue: AudioCue): void
export function playArchiveHover(): void
export function playArchiveSlide(): void
export function playAlbumOpen(): void
export function playBookSettle(): void
export function playArchiveConfirm(): void
```

实现要求：`archiveHover` 以木质微采样为主并叠加 30–45ms 的低比例 triangle；`archiveSlide` 使用 350ms 以上共享噪声缓冲，带通频率从 600Hz 平滑到 1.7kHz，衰减不早于 160ms；`albumOpen` 使用快门微采样并叠加 40–80ms 的上行双音；`bookSettle` 使用低中频 sine/triangle 和低通纸页层，峰值明显低于其他 cue；`archiveConfirm` 使用闷纸章程序化 transient 加短双音。微采样 Promise 未完成或返回 `null` 时立即使用对应程序化层，不等待或阻塞交互。

- [ ] **Step 5: 保留静音切换语义并改用确认 cue**

`toggleAudioMuted()` 继续写入 `site_audio_muted`；只有从 muted 切换到可播放时调用 `playArchiveConfirm()`。`setAudioMuted()`、页面隐藏暂停/恢复和 `hasAudioContext()` 的对外行为保持不变。

- [ ] **Step 6: 运行引擎静态测试并提交**

运行：

```bash
pnpm --filter site-astro exec vitest run tests/audio-synth-static.test.ts tests/runtime-performance.spec.ts
```

预期：Task 1 的静态测试全部 PASS。

```bash
git add packages/site-astro/src/runtime/audioAssets.ts packages/site-astro/src/runtime/audioSynth.ts
git commit -m "feat: build warm archive audio cue engine"
```

## Task 4：接入导航、卡片、相册和抽屉交互

**Files:**

- Modify: `packages/site-astro/src/runtime/volumeToggle.ts`
- Modify: `packages/site-astro/src/composables/useAudioSynth.ts`
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/scripts/navRuntime.ts`

- [ ] **Step 1: 迁移全局音量运行时**

将 `volumeToggle.ts` 的 import 改为 `playArchiveHover`、`playArchiveConfirm`；`pointerenter` 继续保持 100–120ms 节流并只播放 `archiveHover`；点击开启音效由 `toggleAudioMuted()` 负责确认声。保留已有按钮清理逻辑和 `initDeviceOrientation()` 调用。

- [ ] **Step 2: 迁移 Vue composable API**

`useAudioSynth()` 返回 `playArchiveHover`、`playArchiveSlide`、`playAlbumOpen`、`playBookSettle`、`playArchiveConfirm` 和原有 `isMuted/toggleMute`；删除旧材质名称，确保仓库内不再引用旧 cue 名称。

- [ ] **Step 3: 修正同学卡片和照片卡片的触摸重复播放**

把 `ArchiveRosterCard.vue` 和 `AlbumGrid.vue` 的 `@touchstart` 改为统一的 pointer handler：当 `event.pointerType === 'touch'` 时播放一次 `archiveSlide`，并记录最近一次触摸时间；紧随其后的 synthetic click 不得再次播放。桌面 `pointerenter` 仍只在进入元素时播放一次。

- [ ] **Step 4: 为相册打开接入快门 cue**

在 `AlbumGrid.vue` 的 `openLightbox(album.photos, i)` 成功调用后播放 `playAlbumOpen()`；若照片无效、打开函数提前返回，不播放音效。

- [ ] **Step 5: 为抽屉关闭接入书页收束 cue**

在 `navRuntime.ts` 的 `closeDrawer()` 中保留 `wasOpen` 判断；只有 `wasOpen === true` 时调用 `playBookSettle()`，然后移除 `nav-open`、恢复焦点。打开按钮、遮罩、关闭按钮和 Escape 共享同一关闭函数，因而不会重复接线。

- [ ] **Step 6: 增加触发映射静态断言并提交**

在 `audio-synth-static.test.ts` 断言：`volumeToggle.ts` 包含 `playArchiveHover`，`ArchiveRosterCard.vue` 和 `AlbumGrid.vue` 包含 `playArchiveSlide`，`AlbumGrid.vue` 包含 `playAlbumOpen`，`navRuntime.ts` 包含 `playBookSettle`；仓库源码不再出现 `playCrystalTick`、`playPaperSlide`、`playDeepWhoosh`。

运行：

```bash
pnpm --filter site-astro exec vitest run tests/audio-synth-static.test.ts tests/runtime-performance.spec.ts
```

```bash
git add packages/site-astro/src/runtime/volumeToggle.ts packages/site-astro/src/composables/useAudioSynth.ts packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/src/components/AlbumGrid.vue packages/site-astro/src/scripts/navRuntime.ts packages/site-astro/tests/audio-synth-static.test.ts
git commit -m "feat: map warm archive cues to interactions"
```

## Task 5：完成浏览器验证、构建和听感验收

**Files:**

- Modify: `packages/site-astro/tests/runtime-performance-browser.spec.ts`
- Modify: `packages/site-astro/tests/audio-synth-static.test.ts`（仅在资源断言需要补充时）

- [ ] **Step 1: 添加首次交互前的资源请求断言**

在现有“悬停不会创建音频上下文”测试中记录 `/audio/ui/` 请求：页面加载和音量按钮 hover 后请求数必须为 0；第一次点击静音、第二次点击开启后，音频上下文创建数必须为 1，且资源请求总数不超过三个。

- [ ] **Step 2: 添加连续悬停节流验证**

在同一测试中连续 hover 导航项、同学卡片或照片卡片 10 次，等待 250ms 后断言 `/audio/ui/` 请求仍不超过三个；页面导航后再次 hover 不得创建第二个 AudioContext。

- [ ] **Step 3: 运行站点静态测试和浏览器测试**

运行：

```bash
pnpm --filter site-astro exec vitest run tests/audio-synth-static.test.ts tests/runtime-performance.spec.ts
pnpm --filter site-astro test:perf-network -- --grep "音频|悬停|名册和年度册"
```

预期：静态测试和相关 Playwright 测试全部通过；浏览器控制台无未捕获音频解码异常。

- [ ] **Step 4: 运行构建和类型检查**

运行：

```bash
pnpm build:site
pnpm --filter site-astro typecheck
```

预期：构建产物包含三个 `/audio/ui/*.ogg` 资源，TypeScript 和 Astro 检查通过。

- [ ] **Step 5: 做桌面与移动 Chrome 听感验收**

在本地预览站点分别用桌面 Chrome 和移动 Chrome 检查：悬停不刺耳、卡片像纸张移动、照片打开有快门语义、抽屉关闭有温暖收束、音效开启确认与悬停声可区分；关闭音效后所有交互均无声且状态可持久化。

- [ ] **Step 6: 汇总最终差异并提交验证结果**

运行：

```bash
git diff --check HEAD~4..HEAD
git status --short
```

确认只包含本计划产生的音频引擎、资源、触发点和测试改动；不得暂存或修改用户已有的后台、账号、信箱和部署文件。
