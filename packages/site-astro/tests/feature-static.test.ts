import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

const distDir = resolve(__dirname, '../dist')

function readDistHtml(path: string): string {
  const filePath = join(distDir, path)
  expect(existsSync(filePath), `${path} should exist in dist`).toBe(true)
  return readFileSync(filePath, 'utf-8')
}

describe('Feature visibility smoke test', () => {
  it('exposes yearbook as a navigable public feature with expected sections', () => {
    const rosterHtml = readDistHtml('roster/index.html')
    const yearbookHtml = readDistHtml('yearbook/index.html')

    expect(rosterHtml).toContain('年度册')
    expect(rosterHtml).toContain('/yearbook')

    for (const label of ['班级寄语', '青春数据报告', '同窗好友名录', '青春瞬间', '时光足迹', '寄语留言板']) {
      expect(yearbookHtml).toContain(label)
    }
  })

  it('ships the rankings island and keeps the rankings endpoint wired', () => {
    const rosterHtml = readDistHtml('roster/index.html')
    const assetDir = join(distDir, 'assets')
    expect(existsSync(assetDir), 'assets directory should exist').toBe(true)

    const rankingAssetName = readdirSync(assetDir).find((name) => /^RankingsPanel\..+\.js$/.test(name))
    expect(rankingAssetName).toBeTruthy()

    const rankingAsset = readFileSync(join(assetDir, rankingAssetName!), 'utf-8')
    expect(rosterHtml).toContain('RankingsPanel')
    expect(rankingAsset).toContain('/api/rankings')
  })

  it('uses an injected timeline API base instead of reading VITE_API_BASE_URL in client code', () => {
    const timelineHtml = readDistHtml('timeline/index.html')
    const assetDir = join(distDir, 'assets')
    const timelineAssetName = readdirSync(assetDir).find((name) => /^timeline\.astro_astro_type_script.+\.js$/.test(name))
    
    expect(timelineHtml).toContain('data-api-base')

    if (timelineAssetName) {
      const timelineAsset = readFileSync(join(assetDir, timelineAssetName), 'utf-8')
      expect(timelineAsset).toContain('data-api-base')
      expect(timelineAsset).not.toContain('VITE_API_BASE_URL')
    } else {
      expect(timelineHtml).not.toContain('VITE_API_BASE_URL')
    }
  })
})
