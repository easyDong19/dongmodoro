import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * electron 의 real `nativeTheme` 은 테스트 프로세스에 없다 — 쓰기를 기록하는 최소 대역으로
 * 대신한다. `vi.mock` 팩토리는 파일 맨 위로 호이스트되므로 그 안에서 쓰는 값도
 * `vi.hoisted` 로 함께 끌어올린다 (clock.test.ts 와 같은 구도).
 */
const { fakeNativeTheme } = vi.hoisted(() => ({
  fakeNativeTheme: { themeSource: 'system' as string }
}))

vi.mock('electron', () => ({ nativeTheme: fakeNativeTheme }))

const { testUow } = await import('../db/repositories/test-helpers')
const { readTheme, applyTheme, setTheme } = await import('./theme')
const { BG_DEEP } = await import('./theme-colors')

function storedTheme(uow: ReturnType<typeof testUow>['uow']): string | null {
  return uow.run((r) => r.settings.get('theme'))
}

beforeEach(() => {
  fakeNativeTheme.themeSource = 'system'
})

describe('readTheme — 저장값 읽기와 정규화 (design-system ADR-010 §1)', () => {
  it('시딩된 기본값은 dark 다', () => {
    const { uow } = testUow()
    expect(readTheme(uow)).toBe('dark')
  })

  it('저장된 light 를 그대로 읽는다', () => {
    const { uow } = testUow()
    uow.run((r) => r.settings.set('theme', '"light"'))
    expect(readTheme(uow)).toBe('light')
  })

  /**
   * 이 테스트가 마이그레이션 없는 값 전환의 전부다. 시딩은 멱등이라(ADR-018 §4)
   * 기본값을 바꾸는 것만으로는 **이미 `"system"` 이 든 DB 가 갱신되지 않는다.**
   */
  it('레거시 "system" 을 dark 로 판정하고 저장값까지 되쓴다', () => {
    const { uow } = testUow()
    uow.run((r) => r.settings.set('theme', '"system"'))

    expect(readTheme(uow)).toBe('dark')
    // 되쓰기가 빠지면 저장소에 계약 밖의 값이 영원히 남는다.
    expect(storedTheme(uow)).toBe('"dark"')
  })

  it('계약에 없는 값도 같은 경로로 복구한다', () => {
    const { uow } = testUow()
    uow.run((r) => r.settings.set('theme', '"purple"'))

    expect(readTheme(uow)).toBe('dark')
    expect(storedTheme(uow)).toBe('"dark"')
  })

  /**
   * `readTheme` 의 JSON 파싱 가드는 **방어적이고, 리포지토리를 통해서는 도달할 수 없다** —
   * 스키마의 `CHECK (json_valid(value))` (ADR-019 §6) 가 애초에 깨진 값을 못 넣게 막는다.
   * 그 사실 자체를 여기서 못박는다: 가드를 지워도 되는지 판단하려면 이 보장이 유지되는지가
   * 근거이므로, 제약이 사라지면 이 테스트가 먼저 알려준다.
   */
  it('DB 가 깨진 JSON 을 애초에 거부한다 — 파싱 가드는 그 뒤의 방어선이다', () => {
    const { uow } = testUow()
    expect(() => uow.run((r) => r.settings.set('theme', '{not json'))).toThrow()
    // 거부됐으므로 저장값은 시딩된 그대로다.
    expect(storedTheme(uow)).toBe('"dark"')
  })
})

describe('applyTheme — themeSource 가 유일한 적용 채널 (ADR-010 §3)', () => {
  it('themeSource 에 값을 그대로 넣는다', () => {
    applyTheme('light')
    expect(fakeNativeTheme.themeSource).toBe('light')

    applyTheme('dark')
    expect(fakeNativeTheme.themeSource).toBe('dark')
  })

  /**
   * `system` 을 절대 쓰지 않는 것이 이 ADR 의 핵심이다 — 그 값이 들어가면 앱이 다시 OS 를
   * 따라가고, 화면이 어두운 이유가 저장값과 OS 둘로 갈린다.
   */
  it("themeSource 가 'system' 으로 남지 않는다", () => {
    applyTheme('dark')
    expect(fakeNativeTheme.themeSource).not.toBe('system')
  })

  /**
   * 창 배경색까지 함께 바꾼다 — **`themeSource` 는 이 색을 건드리지 않기 때문이다.**
   *
   * 창 배경색은 렌더러가 처음 칠하기 전까지 화면에 나가는 색이고, 창 생성 시점에 한 번
   * 정해진다. 여기서 갱신하지 않으면 실행 중에 테마를 바꾼 사용자가 **다음 기동에서**
   * 이전 테마의 색을 한 번 보게 된다. 적용 지점이 하나라는 규칙(ADR-010 §3)이 이 색에도
   * 그대로 적용된다.
   *
   * macOS 조기 반환보다 **앞에서** 불려야 한다 — 이 색은 플랫폼을 가리지 않는다.
   */
  it('창 배경색을 테마의 --bg-deep 으로 갱신한다', () => {
    const win = {
      isDestroyed: () => false,
      setBackgroundColor: vi.fn(),
      setTitleBarOverlay: vi.fn()
    }

    applyTheme('light', win as unknown as Parameters<typeof applyTheme>[1])
    expect(win.setBackgroundColor).toHaveBeenCalledWith(BG_DEEP.light)

    applyTheme('dark', win as unknown as Parameters<typeof applyTheme>[1])
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith(BG_DEEP.dark)
  })

  it('창이 없거나 파괴됐으면 배경색을 건드리지 않는다', () => {
    const destroyed = {
      isDestroyed: () => true,
      setBackgroundColor: vi.fn(),
      setTitleBarOverlay: vi.fn()
    }

    expect(() => applyTheme('light')).not.toThrow()
    applyTheme('light', destroyed as unknown as Parameters<typeof applyTheme>[1])
    expect(destroyed.setBackgroundColor).not.toHaveBeenCalled()
  })
})

describe('setTheme — 저장과 적용을 함께 한다', () => {
  it('저장하고, 적용하고, 저장된 값을 돌려준다', () => {
    const { uow } = testUow()

    expect(setTheme(uow, 'light')).toBe('light')
    expect(storedTheme(uow)).toBe('"light"')
    expect(fakeNativeTheme.themeSource).toBe('light')
  })

  it('되읽으면 방금 저장한 값이 나온다', () => {
    const { uow } = testUow()
    setTheme(uow, 'light')
    expect(readTheme(uow)).toBe('light')
  })
})
