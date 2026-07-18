import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizePageResult } from '../src/api/pagination.ts'

const students = Array.from({ length: 1_000 }, (_, index) => ({ id: `student-${index}`, name: `学生 ${index}` }))
const messages = Array.from({ length: 10_000 }, (_, index) => ({ id: `message-${index}`, content: `留言 ${index}` }))

test('1000 名学生的首批列表最多渲染 50 条，并能继续翻页', () => {
  const first = normalizePageResult(students, 50)
  const second = normalizePageResult(students, 50, first.nextCursor)

  assert.equal(first.items.length, 50)
  assert.equal(first.total, 1_000)
  assert.equal(first.nextCursor, '50')
  assert.equal(second.items.length, 50)
  assert.equal(second.items[0].id, 'student-50')
})

test('10000 条留言的首批列表最多渲染 50 条，并保留总数和下一游标', () => {
  const first = normalizePageResult(messages, 50)

  assert.equal(first.items.length, 50)
  assert.equal(first.total, 10_000)
  assert.equal(first.nextCursor, '50')
})

test('主要高密度列表使用统一分页、取消和惰性图片策略', () => {
  for (const file of ['StudentsView.vue', 'AlbumsView.vue', 'MessagesView.vue']) {
    const source = readFileSync(new URL(`../src/views/${file}`, import.meta.url), 'utf8')
    assert.match(source, /DEFAULT_PAGE_SIZE/)
    assert.match(source, /AbortController/)
    assert.match(source, /signal: controller\.signal/)
  }

  const studentsView = readFileSync(new URL('../src/views/StudentsView.vue', import.meta.url), 'utf8')
  const albumsView = readFileSync(new URL('../src/views/AlbumsView.vue', import.meta.url), 'utf8')
  assert.match(studentsView, /loading="lazy" decoding="async"/)
  assert.match(albumsView, /loading="lazy" decoding="async"/)
})
