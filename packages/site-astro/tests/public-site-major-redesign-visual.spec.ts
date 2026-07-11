import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const mobilePages = ['./', './preface/', './roster/', './album/', './timeline/', './yearbook/', './student/template/']
const yearbookSource = readFileSync(resolve(__dirname, '../src/pages/yearbook.astro'), 'utf-8')
const yearbookStyles = yearbookSource.match(/<style>([\s\S]*)<\/style>/)?.[1] || ''

async function seedClassmateSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'template',
      avatarUrl: null,
    }))
    sessionStorage.setItem('classmate_name', '测试同学')
  })
}

test.describe('public site major redesign responsive smoke', () => {
  for (const pathname of mobilePages) {
    test(`mobile page has no horizontal overflow: ${pathname}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      if (pathname !== './') {
        await seedClassmateSession(page)
      }
      await page.goto(pathname)

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflow).toBe(false)
    })
  }

  test('yearbook broken avatar fallback stays centered without outer flex layout', async ({ page }) => {
    let invalidAvatarRequests = 0
    await page.route('https://avatar.invalid/**', route => {
      invalidAvatarRequests += 1
      return route.fulfill({ status: 404, body: '' })
    })
    await page.setContent(`
      <style>${yearbookStyles}</style>
      <style>.mate-avatar-box { display: block; }</style>
      <div class="mate-avatar-box">
        <object class="mate-avatar-image" data="https://avatar.invalid/broken-avatar.png" style="aspect-ratio: 1">
          <span class="mate-avatar-char">测</span>
        </object>
      </div>
    `)

    const fallback = page.locator('.mate-avatar-image > .mate-avatar-char')
    await expect.poll(() => invalidAvatarRequests).toBeGreaterThan(0)
    await expect(fallback).toBeVisible()

    const centers = await page.evaluate(() => {
      const avatar = document.querySelector('.mate-avatar-box')!.getBoundingClientRect()
      const fallback = document.querySelector('.mate-avatar-char')!
      const range = document.createRange()
      range.selectNodeContents(fallback)
      const text = range.getBoundingClientRect()
      const styles = getComputedStyle(fallback)
      return {
        avatarWidth: avatar.width,
        avatarHeight: avatar.height,
        display: styles.display,
        alignItems: styles.alignItems,
        justifyContent: styles.justifyContent,
        horizontal: Math.abs((text.left + text.width / 2) - (avatar.left + avatar.width / 2)),
        vertical: Math.abs((text.top + text.height / 2) - (avatar.top + avatar.height / 2)),
      }
    })

    expect(centers.avatarWidth).toBe(60)
    expect(centers.avatarHeight).toBe(60)
    expect(centers.display).toBe('flex')
    expect(centers.alignItems).toBe('center')
    expect(centers.justifyContent).toBe('center')
    expect(centers.horizontal).toBeLessThanOrEqual(1)
    expect(centers.vertical).toBeLessThanOrEqual(1)
  })

  test('homepage keeps logged-out nav minimal and scrolls to login smoothly', async ({ page }) => {
    await page.goto('./')

    await expect(page.locator('.top-nav.top-nav--home')).toBeVisible()
    await expect(page.locator('.top-nav:not(.has-session) .nav-links')).toBeHidden()

    await page.getByTestId('home-login-cta').click()
    await expect(page.locator('#login')).toBeInViewport()
  })

  test('core browsing pages expose paper page headers', async ({ page }) => {
    await seedClassmateSession(page)
    for (const pathname of ['./preface/', './roster/', './album/', './timeline/']) {
      await page.goto(pathname)
      await expect(page.locator('.page-shell')).toBeVisible()
      await expect(page.locator('.page-header')).toBeVisible()
    }
  })
})
