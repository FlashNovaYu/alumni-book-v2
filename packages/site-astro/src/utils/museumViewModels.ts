import type { ClassmateEntry, Student } from '@alumni/shared'
import { buildInterestTags, computeProfileCompleteness, getMissingProfileFields } from './profileCompleteness'

export interface ArchiveClassmateCard {
  name: string
  slug: string
  href: string
  hasPage: boolean
  avatarUrl: string | null
  motto: string
  tags: string[]
  completion: number
  statusLabel: string
}

export function toArchiveClassmateCard(mate: ClassmateEntry, siteBase: string): ArchiveClassmateCard {
  const completion = mate.completion ?? 0
  return {
    name: mate.name,
    slug: mate.slug,
    href: `${siteBase}${`student/${mate.slug}/`.replace(/^\/+/, '')}`,
    hasPage: mate.hasPage,
    avatarUrl: mate.avatarUrl,
    motto: mate.motto || '这位同学还没有写下座右铭',
    tags: mate.tags || [mate.mbti, mate.school, mate.className].filter(Boolean).map(String).slice(0, 3),
    completion,
    statusLabel: mate.hasPage ? `馆藏完成度 ${completion}%` : '页面待完善',
  }
}

export function toStudentMuseumSummary(student: Student) {
  const info = student.info || {}
  return {
    completion: computeProfileCompleteness(info, student.avatarUrl),
    missingFields: getMissingProfileFields(info, student.avatarUrl),
    tags: buildInterestTags(info),
  }
}
