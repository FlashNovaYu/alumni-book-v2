import { describe, expect, it } from 'vitest'
import {
  buildInterestTags,
  computeProfileCompleteness,
  getMissingProfileFields,
} from '../src/utils/profileCompleteness'

describe('museum profile helpers', () => {
  it('computes profile completeness from the required museum fields', () => {
    const info = {
      nickname: '小林',
      motto: '保持热爱',
      bestMemory: '运动会',
      favoriteSong: '同桌的你',
      futureSelf: '成为老师',
    }

    expect(computeProfileCompleteness(info)).toBe(25)
  })

  it('returns readable missing profile fields for content audit and self-edit hints', () => {
    const info = { nickname: '小林', motto: '保持热爱' }

    expect(getMissingProfileFields(info).slice(0, 4)).toEqual([
      { key: 'avatarUrl', label: '头像' },
      { key: 'bestMemory', label: '校园回忆' },
      { key: 'favoriteSong', label: '喜欢歌曲' },
      { key: 'futureSelf', label: '十年后的自己' },
    ])
  })

  it('builds stable interest tags without empty values', () => {
    const info = {
      mbti: 'ENFP',
      favoriteSong: '晴天',
      favoriteFood: '',
      bestSubject: '语文',
    }

    expect(buildInterestTags(info)).toEqual(['ENFP', '晴天', '语文'])
  })
})
