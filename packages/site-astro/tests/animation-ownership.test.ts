import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const siteRoot = path.resolve(__dirname, '../src')

function read(relative: string) {
  return fs.readFileSync(path.join(siteRoot, relative), 'utf-8')
}

describe('animation ownership', () => {
  it('does not keep the old global GSAP animation owner wired into the layout', () => {
    const layout = read('layouts/MainLayout.astro')

    expect(layout).not.toContain('../scripts/animations')
    expect(layout).not.toContain('initAnimations')
    expect(layout).toContain('../scripts/globalReveal')
  })

  it('does not keep the old global animations source file with top-level GSAP imports', () => {
    const animationPath = path.join(siteRoot, 'scripts/animations.ts')
    if (!fs.existsSync(animationPath)) {
      expect(fs.existsSync(animationPath)).toBe(false)
      return
    }

    const source = fs.readFileSync(animationPath, 'utf-8')
    expect(source).not.toContain("import gsap")
    expect(source).not.toContain("from 'gsap/ScrollTrigger'")
  })

  it('does not load GSAP or ScrollTrigger in classmate account login book component', () => {
    const loginPath = path.join(siteRoot, 'components/ClassmateLoginBook.vue')
    if (fs.existsSync(loginPath)) {
      const source = fs.readFileSync(loginPath, 'utf-8')
      expect(source).not.toContain("import gsap")
      expect(source).not.toContain("gsap/ScrollTrigger")
    }
  })

  it('global reveal can be reinitialized per Astro page load without stacking duplicate state', () => {
    const reveal = read('scripts/globalReveal.ts')
    const layout = read('layouts/MainLayout.astro')

    expect(reveal).toContain('let activeObserver')
    expect(reveal).toContain('activeObserver.disconnect()')
    expect(layout).toContain('initGlobalReveal(true)')
  })

  it('keeps chat islands out of global reveal ownership and scopes all polling cleanup', () => {
    const groupChat = read('composables/useGroupChat.ts')
    const inbox = read('composables/useInbox.ts')
    const stage = read('components/GroupChatStage.vue')
    const polling = read('composables/useVisibilityPolling.ts')

    expect(groupChat).toContain('useVisibilityPolling')
    expect(inbox).toContain('useVisibilityPolling')
    expect(stage).not.toContain('data-reveal')
    expect(polling).toContain('onScopeDispose(stop)')
    expect(polling).toContain("removeEventListener('visibilitychange'")
  })

  it('全仓站点运行时不再依赖 GSAP 或闲置 React 导航示例', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(siteRoot, '../package.json'), 'utf8'))
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of ['gsap', 'framer-motion', 'lucide-react', 'lucide-vue-next', 'react', 'react-dom', '@types/react', '@types/react-dom', 'clsx', 'tailwind-merge']) {
      expect(dependencies[name]).toBeUndefined()
    }
    expect(fs.existsSync(path.join(siteRoot, 'components/ui/tubelight-navbar.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(siteRoot, 'components/ui/demo.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(siteRoot, 'utils/cn.ts'))).toBe(false)
    const photoWall = read('components/PhotoWall.vue')
    expect(photoWall).not.toContain("import('gsap')")
    expect(photoWall).toContain('@keyframes photo-item-enter')
    expect(photoWall).toContain('prefers-reduced-motion: reduce')
  })
})
