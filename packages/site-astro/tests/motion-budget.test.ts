import { describe, expect, it } from 'vitest'
import { getMotionBudget, getMotionFrameInterval, type MotionEnvironment } from '../src/utils/motion'

const base: MotionEnvironment = {
  prefersReducedMotion: false,
  coarsePointer: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
}

describe('motion budget', () => {
  it('keeps normal fine-pointer devices on full budget', () => {
    expect(getMotionBudget(base)).toBe('full')
    expect(getMotionFrameInterval('full')).toBe(1000 / 30)
  })

  it('uses light budget for coarse, save-data, and low-capability devices', () => {
    expect(getMotionBudget({ ...base, coarsePointer: true })).toBe('light')
    expect(getMotionBudget({ ...base, saveData: true })).toBe('light')
    expect(getMotionBudget({ ...base, deviceMemory: 4 })).toBe('light')
    expect(getMotionBudget({ ...base, hardwareConcurrency: 4 })).toBe('light')
    expect(getMotionFrameInterval('light')).toBe(1000 / 20)
  })

  it('always gives reduced motion priority', () => {
    expect(getMotionBudget({ ...base, prefersReducedMotion: true })).toBe('reduced')
    expect(getMotionFrameInterval('reduced')).toBe(0)
  })
})
