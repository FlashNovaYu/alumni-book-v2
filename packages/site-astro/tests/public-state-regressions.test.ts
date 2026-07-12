import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const source = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('public state consistency regressions', () => {
  it('applies valid roster cache when it differs from rendered data', () => {
    const roster = source('components/RosterWall.vue')
    expect(roster).toContain('const { data } = await fetchJsonIfChanged')
    expect(roster).toContain('!isDeepEqual(data.data, classmates.value)')
    expect(roster).not.toContain('changed && !isDeepEqual')
  })

  it('keeps private profile responses out of the public ETag cache', () => {
    const profile = source('components/StudentProfile.vue')
    expect(profile).toContain("const publicCacheKey = `student_${slugVal.value}_public`")
    expect(profile).toContain("fetch(fetchUrl, { headers: customHeaders, cache: 'no-cache' })")
  })

  it('reloads avatar elements when their URL changes', () => {
    expect(source('components/ArchiveRosterCard.vue')).toContain("watch(() => props.card.avatarUrl, () => { avatarError.value = false })")
    expect(source('components/StudentProfile.vue')).toContain("watch(() => student.value?.avatarUrl, () => { avatarError.value = false })")
  })

  it('loads editor data with the same classmate token used for saves', () => {
    expect(source('components/SelfEditPanel.vue')).toContain('const res = await fetch(url, { headers: authHeaders() })')
  })

  it('keeps dynamic timeline nodes styled and escapes API content', () => {
    const timeline = source('pages/timeline.astro')
    expect(timeline).toContain('<style is:global>')
    expect(timeline).toContain('function escapeHtml(value: unknown)')
    expect(timeline).toContain('${escapeHtml(item.title)}')
    expect(timeline).toContain('${escapeHtml(item.description)}')
  })

  it('builds mailbox links from the configured site base', () => {
    const profile = source('components/StudentProfile.vue')
    expect(profile).toContain("const siteBase = import.meta.env.BASE_URL || '/'")
    expect(profile).not.toContain('href="/mailbox/"')
  })
})
