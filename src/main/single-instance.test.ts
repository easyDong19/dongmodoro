import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeApp = {
  requestSingleInstanceLock: vi.fn<() => boolean>(),
  quit: vi.fn()
}

vi.mock('electron', () => ({ app: fakeApp }))

const { acquireSingleInstanceLock, focusExistingWindow } = await import('./single-instance')

function fakeWindow(over: { minimized?: boolean } = {}) {
  return {
    isMinimized: vi.fn(() => over.minimized ?? false),
    restore: vi.fn(),
    focus: vi.fn()
  }
}

beforeEach(() => {
  fakeApp.requestSingleInstanceLock.mockReset()
  fakeApp.quit.mockReset()
})

describe('acquireSingleInstanceLock (app-shell R19)', () => {
  it('잠금을 얻으면 그대로 진행한다', () => {
    fakeApp.requestSingleInstanceLock.mockReturnValue(true)

    expect(acquireSingleInstanceLock()).toBe(true)
    expect(fakeApp.quit).not.toHaveBeenCalled()
  })

  /**
   * 두 번째 프로세스가 `false` 를 받고도 계속 부팅하면 잠금이 있으나 마나다 — 같은
   * `app.db` 를 두 프로세스가 열고, 타이머가 둘 돌고, 백업이 살아 있는 인스턴스의 DB
   * 위에서 실행된다. 호출부는 이 반환값으로 부팅 전체를 가른다.
   */
  it('잠금을 얻지 못하면 종료를 요청하고 진행하지 말라고 답한다', () => {
    fakeApp.requestSingleInstanceLock.mockReturnValue(false)

    expect(acquireSingleInstanceLock()).toBe(false)
    expect(fakeApp.quit).toHaveBeenCalledOnce()
  })
})

describe('focusExistingWindow (app-shell R18)', () => {
  it('최소화된 창은 복원한 뒤 포커스한다', () => {
    const win = fakeWindow({ minimized: true })

    focusExistingWindow(win as never)

    expect(win.restore).toHaveBeenCalledOnce()
    expect(win.focus).toHaveBeenCalledOnce()
  })

  it('최소화되지 않았으면 복원하지 않는다', () => {
    const win = fakeWindow()

    focusExistingWindow(win as never)

    expect(win.restore).not.toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalledOnce()
  })

  /** 창이 없는 상태는 지금 도달 불가지만, 도달하면 조용히 넘어가야 한다 — 복귀는 실행이 아니다. */
  it('창이 없으면 아무 것도 하지 않는다', () => {
    expect(() => focusExistingWindow(null)).not.toThrow()
  })
})
