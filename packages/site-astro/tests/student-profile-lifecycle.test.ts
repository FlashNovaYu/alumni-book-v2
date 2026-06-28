import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const sourcePath = path.resolve(__dirname, '../src/components/StudentProfile.vue')

describe('StudentProfile lazy observer lifecycle', () => {
  it('keeps lazy IntersectionObserver handles in component scope so unmount can disconnect them', () => {
    const source = fs.readFileSync(sourcePath, 'utf-8')
    const onMountedIndex = source.indexOf('onMounted(() => {')
    const onUnmountedIndex = source.indexOf('onUnmounted(() => {')

    expect(onMountedIndex).toBeGreaterThan(0)
    expect(onUnmountedIndex).toBeGreaterThan(onMountedIndex)

    for (const name of ['pObserver', 'mObserver', 'hObserver']) {
      const firstDeclaration = source.indexOf(`let ${name}`)
      expect(firstDeclaration, `${name} should be declared before onMounted`).toBeGreaterThan(0)
      expect(firstDeclaration, `${name} should be declared in component setup scope`).toBeLessThan(onMountedIndex)

      const mountedBody = source.slice(onMountedIndex, onUnmountedIndex)
      expect(mountedBody, `${name} must not be redeclared inside onMounted`).not.toContain(`let ${name}`)
      expect(source.slice(onUnmountedIndex), `${name} should be disconnected on unmount`).toContain(`${name}?.disconnect()`)
    }
  })
})
