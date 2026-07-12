import { describe, expect, it } from 'vitest'
import { audienceForStudent, filterStudentForAudience } from '../src/lib/studentAudience'

describe('student audience', () => {
  it('根据一次解析的 viewer 推导每名学生的 audience', () => {
    expect(audienceForStudent({ kind: 'public' }, 'alice')).toBe('public')
    expect(audienceForStudent({ kind: 'admin' }, 'alice')).toBe('admin')
    expect(audienceForStudent({ kind: 'classmate', slug: 'alice' }, 'alice')).toBe('owner')
    expect(audienceForStudent({ kind: 'classmate', slug: 'bob' }, 'alice')).toBe('classmates')
  })

  it('只向本人和管理员返回账号内部元数据', () => {
    const student = {
      slug: 'alice',
      accountStatus: 'active',
      accountLastLoginAt: '2026-07-12 12:00:00',
      info: { phone: '1', visibility: { phone: 'classmates' } },
    }

    expect(filterStudentForAudience(student, 'public')).not.toHaveProperty('accountStatus')
    expect(filterStudentForAudience(student, 'classmates')).not.toHaveProperty('accountLastLoginAt')
    expect(filterStudentForAudience(student, 'owner')).toMatchObject({ accountStatus: 'active' })
    expect(filterStudentForAudience(student, 'admin')).toMatchObject({ accountLastLoginAt: '2026-07-12 12:00:00' })
  })
})
