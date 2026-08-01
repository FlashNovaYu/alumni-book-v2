// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AlbumsView from '../src/views/AlbumsView.vue'

describe('AlbumsView 投稿相册开关', () => {
  beforeEach(() => {
    sessionStorage.setItem('admin_token', 'submission-toggle-test-token')
    vi.stubGlobal('alert', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('新建相册勾选接收同学投稿时提交投稿开关', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      return new Response(JSON.stringify({ success: true, data: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const wrapper = mount(AlbumsView, { global: { stubs: { Teleport: true } } })
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await wrapper.get('input[type="text"]').setValue('公共投稿相册')
    const submissionToggle = wrapper.findAll('label.checkbox-label')
      .find((label) => label.text().includes('接收同学投稿'))
      ?.get('input')
    expect(submissionToggle).toBeDefined()
    await submissionToggle!.setValue(true)
    await wrapper.findAll('button').find((button) => button.text() === '创建')!.trigger('click')
    await flushPromises()

    const createRequest = requests.find(({ url, init }) => url.includes('/api/albums') && init?.method === 'POST')
    expect(createRequest).toBeDefined()
    expect(JSON.parse(String(createRequest!.init?.body))).toMatchObject({
      title: '公共投稿相册',
      acceptsClassmateUploads: true,
    })
    wrapper.unmount()
  })
})
