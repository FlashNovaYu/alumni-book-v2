import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const srcRoot = path.resolve(__dirname, '../src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(srcRoot, relativePath))
}

describe('class post office static constraints', () => {
  it('replaces tubelight navigation with paper bookmark navigation', () => {
    const source = read('components/TopNav.astro')

    expect(source).toContain('paper-bookmark-nav')
    expect(source).toContain('ink-line')
    expect(source).toContain('mail-unread-stamp')
    expect(source).not.toContain('lamp-glow')
    expect(source).not.toContain('复古床头灯泡渐变光晕')
  })

  it('keeps mailbox public page and makes group chat the canonical public message entry', () => {
    expect(exists('pages/messages.astro')).toBe(true)
    expect(exists('pages/mailbox.astro')).toBe(true)
    expect(exists('components/PublicMessageBoard.vue')).toBe(false)
    expect(exists('components/MailboxApp.vue')).toBe(true)
  })

  it('redirects the legacy public message page and keeps mailbox in the paper page shell', () => {
    const messages = read('pages/messages.astro')
    const mailbox = read('pages/mailbox.astro')

    expect(messages).toContain('class-space')
    expect(messages).toContain('group-chat')
    expect(mailbox).toContain('page-shell')
    expect(mailbox).toContain('page-header')
    expect(mailbox).toContain('paper-panel')
  })

  it('adds profile write-mail entry without replacing profile message wall', () => {
    const source = read('components/StudentProfile.vue')

    expect(source).toContain('profile-mail-actions')
    expect(source).toContain('给 TA 写信')
    expect(source).toContain('MessageWall')
  })
})
