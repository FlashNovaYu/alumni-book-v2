export interface MissingProfileField {
  key: string
  label: string
}

const REQUIRED_FIELDS: MissingProfileField[] = [
  { key: 'avatarUrl', label: '头像' },
  { key: 'nickname', label: '昵称' },
  { key: 'motto', label: '座右铭' },
  { key: 'bestMemory', label: '校园回忆' },
  { key: 'favoriteSong', label: '喜欢歌曲' },
  { key: 'futureSelf', label: '十年后的自己' },
  { key: 'letterToClassmates', label: '给同学的话' },
  { key: 'profileModules', label: '个人小传' },
  { key: 'favoriteFood', label: '喜欢食物' },
  { key: 'bestSubject', label: '喜欢科目' },
  { key: 'targetUniversity', label: '目标大学' },
  { key: 'futureCareer', label: '未来职业' },
  { key: 'bestLesson', label: '难忘课堂' },
  { key: 'deskmateFun', label: '同桌趣事' },
  { key: 'classMeme', label: '班级经典梗' },
  { key: 'mbti', label: 'MBTI' },
]

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && String(value).trim().length > 0
}

export function computeProfileCompleteness(info: Record<string, unknown>, avatarUrl?: string | null): number {
  const filled = REQUIRED_FIELDS.filter((field) => {
    if (field.key === 'avatarUrl') return hasValue(avatarUrl)
    return hasValue(info[field.key])
  }).length
  return Math.round((filled / REQUIRED_FIELDS.length) * 100)
}

export function getMissingProfileFields(info: Record<string, unknown>, avatarUrl?: string | null): MissingProfileField[] {
  return REQUIRED_FIELDS.filter((field) => {
    if (field.key === 'avatarUrl') return !hasValue(avatarUrl)
    return !hasValue(info[field.key])
  })
}

export function buildInterestTags(info: Record<string, unknown>): string[] {
  const keys = ['mbti', 'favoriteSong', 'favoriteFood', 'bestSubject', 'favoriteSport', 'targetMajor']
  return keys
    .map((key) => info[key])
    .filter(hasValue)
    .map((value) => String(value).trim())
    .slice(0, 6)
}
