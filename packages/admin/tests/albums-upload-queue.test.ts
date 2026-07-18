// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/image', () => ({
  compressImage: vi.fn(async (file: File) => file),
}))
vi.mock('@alumni/shared', () => ({
  appendImageVariants: vi.fn(),
  buildMediaSources: (src: string) => ({ src, srcset: '', sizes: '72px' }),
  generateImageVariants: vi.fn(async (file: File) => [{ kind: 'original', blob: file, width: 1, height: 1, contentType: file.type }]),
}))

import AlbumsView from '../src/views/AlbumsView.vue'

describe('AlbumsView upload queue', () => {
  beforeEach(() => {
    sessionStorage.setItem('admin_token', 'queue-test-token')
    vi.stubGlobal('alert', vi.fn())
  })

  it('限制并发为 2，展示阶段进度并允许取消单个排队文件', async () => {
    let active = 0
    let peak = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/albums')) return new Response(JSON.stringify({ success: true, data: [{ id: 'album-1', title: '相册', photos: [] }] }))
      if (url.includes('/api/upload')) {
        active++
        peak = Math.max(peak, active)
        await new Promise<void>((resolve, reject) => {
          const signal = init?.signal
          const timer = setTimeout(resolve, 20)
          signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
        })
        active--
      }
      return new Response(JSON.stringify({ success: true, data: {} }))
    }))

    const wrapper = mount(AlbumsView, { global: { stubs: { Teleport: true } } })
    await vi.waitFor(() => expect(wrapper.find('.album-card').exists()).toBe(true))
    await wrapper.get('.album-actions .btn-secondary:nth-child(2)').trigger('click')
    const files = [1, 2, 3].map((index) => new File([`photo-${index}`], `photo-${index}.jpg`, { type: 'image/jpeg' }))
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: files })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.findAll('.upload-progress-item')).toHaveLength(3)
    expect(wrapper.text()).toContain('压缩中')

    const cancelButtons = wrapper.findAll('.upload-progress-item button')
    expect(cancelButtons.length).toBeGreaterThan(0)
    await cancelButtons[2].trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('已取消'))
    await vi.waitFor(() => expect(wrapper.text()).toContain('已完成'))
    expect(peak).toBeLessThanOrEqual(2)
    wrapper.unmount()
  })
})
