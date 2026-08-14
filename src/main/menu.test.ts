import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

/**
 * `Menu.buildFromTemplate` 에 넘어간 템플릿을 그대로 붙잡는다. 네이티브 메뉴는 화면에서
 * 확인할 수 없으므로, 검증 대상은 "무엇을 만들라고 시켰는가" 다.
 */
let captured: MenuItemConstructorOptions[] | undefined
let packaged = false

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (t: MenuItemConstructorOptions[]) => {
      captured = t
      return { id: 'menu' }
    }
  },
  get app() {
    return { isPackaged: packaged }
  }
}))

const roles = (t: MenuItemConstructorOptions[]): string[] =>
  t.flatMap((i) => (i.role === undefined ? [] : [i.role as string]))

function find(t: MenuItemConstructorOptions[], id: string): MenuItemConstructorOptions | undefined {
  for (const item of t) {
    if (item.id === id) return item
    if (Array.isArray(item.submenu)) {
      const hit = find(item.submenu, id)
      if (hit) return hit
    }
  }
  return undefined
}

async function build(onResetAllData = vi.fn()) {
  const { buildAppMenu, RESET_MENU_ITEM_ID } = await import('./menu')
  buildAppMenu({ onResetAllData })
  if (!captured) throw new Error('buildFromTemplate was never called')
  return { template: captured, onResetAllData, RESET_MENU_ITEM_ID }
}

beforeEach(() => {
  captured = undefined
  packaged = false
  vi.resetModules()
})

describe('buildAppMenu', () => {
  it('exposes the reset item under a stable id and runs the callback', async () => {
    const { template, onResetAllData, RESET_MENU_ITEM_ID } = await build()

    const item = find(template, RESET_MENU_ITEM_ID)
    expect(item).toBeDefined()
    item?.click?.(undefined as never, undefined as never, undefined as never)
    expect(onResetAllData).toHaveBeenCalledTimes(1)
  })

  it('gives the reset item no accelerator', async () => {
    // 되돌릴 수 없는 전체 삭제에 키스트로크를 붙이지 않기로 한 결정을 고정한다.
    const { template, RESET_MENU_ITEM_ID } = await build()
    expect(find(template, RESET_MENU_ITEM_ID)?.accelerator).toBeUndefined()
  })

  it('keeps the standard edit and window menus', async () => {
    // setApplicationMenu 는 기본 메뉴를 대체한다 — 이 둘이 빠지면 앱 전체에서
    // Cmd+C·Cmd+M 이 죽는다. 회귀가 가장 아픈 자리다.
    const { template } = await build()
    expect(roles(template)).toEqual(expect.arrayContaining(['editMenu', 'windowMenu']))
  })

  it('hides developer items in a packaged build', async () => {
    packaged = true
    const { template } = await build()
    const view = template.find((i) => i.label === '보기')
    const submenu = Array.isArray(view?.submenu) ? view.submenu : []
    expect(roles(submenu)).not.toContain('toggleDevTools')
    // 사용자용 항목은 남아 있어야 한다.
    expect(roles(submenu)).toContain('togglefullscreen')
  })

  it('offers developer items in a dev build', async () => {
    const { template } = await build()
    const view = template.find((i) => i.label === '보기')
    const submenu = Array.isArray(view?.submenu) ? view.submenu : []
    expect(roles(submenu)).toContain('toggleDevTools')
  })

  it('always provides a quit path', async () => {
    // macOS 는 role:'appMenu' 안에, 그 밖에서는 파일 메뉴 안에 있다. 어느 쪽이든
    // 종료가 메뉴에서 도달 가능해야 한다 — 프레임리스 창이라 다른 경로가 얇다.
    const { template } = await build()
    const hasAppMenu = roles(template).includes('appMenu')
    const fileQuit = template
      .filter((i) => Array.isArray(i.submenu))
      .some((i) => roles(i.submenu as MenuItemConstructorOptions[]).includes('quit'))
    expect(hasAppMenu || fileQuit).toBe(true)
  })
})
