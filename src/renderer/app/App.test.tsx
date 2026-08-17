// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {} from '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { TimerSnapshotWire } from '@shared/ipc/contracts'
import { installMatchMedia, setViewportWidth } from '@renderer/shared/layout/testViewport'
import { App } from './App'

const clock = { dayKey: '2026-08-07', weekKey: '2026-08-03', monthKey: '2026-08', weekdayIndex: 4 }

const idleFocusSnapshot: TimerSnapshotWire = {
  mode: 'focus',
  phase: 'idle',
  startedAt: null,
  durationSec: 1500,
  pausedRemainingSec: null,
  taskId: null,
  taskTitle: null,
  focusCountToday: 0,
  focusSinceLastLong: 0
}

function setup({
  clockNow,
  viewportWidth
}: {
  clockNow: () => Promise<typeof clock>
  viewportWidth?: number
}) {
  // 폭을 주지 않은 호출은 matchMedia 를 세우지 않는다 — useBreakpoint 가 wide 로 떨어져
  // 기존 테스트들이 지금까지와 똑같은 화면을 본다.
  if (viewportWidth !== undefined) installMatchMedia(viewportWidth)

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })

  window.api = {
    system: { getAppInfo: vi.fn() },
    clock: { now: vi.fn(clockNow) },
    today: {
      list: vi.fn().mockResolvedValue({ dayKey: clock.dayKey, rows: [] }),
      addDirect: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      pull: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      remove: vi.fn().mockResolvedValue({ itemWeek: clock.weekKey }),
      toggleComplete: vi.fn().mockResolvedValue({ parentWeek: clock.weekKey, completedAt: null })
    },
    timer: {
      getState: vi.fn().mockResolvedValue(idleFocusSnapshot),
      start: vi.fn(),
      startWithTask: vi.fn().mockResolvedValue(idleFocusSnapshot),
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      adjust: vi.fn(),
      completeEarly: vi.fn(),
      setMode: vi.fn()
    },
    sessions: { capture: vi.fn() },
    // 전부 채운다 — `api` 는 접근 시점에 Reflect.get 하는 Proxy 이고,
    // useMutation({ mutationFn: api.week.complete }) 는 **렌더 도중** 프로퍼티를 읽는다.
    // queryFn 과 달리 React Query 가 삼켜주지 않아 하나만 빠져도 렌더가 죽는다.
    week: {
      summary: vi.fn().mockResolvedValue({
        week: clock.weekKey,
        totalMeasuredSec: 0,
        items: [],
        otherRow: { visible: false, measuredSec: 0 }
      }),
      planDraft: vi.fn(),
      confirmPlan: vi.fn(),
      drawer: vi.fn(),
      pullFromDrawer: vi.fn(),
      complete: vi.fn(),
      uncomplete: vi.fn(),
      drop: vi.fn(),
      setMilestone: vi.fn()
    },
    calendar: {
      month: vi.fn().mockResolvedValue({ month: clock.monthKey, leadingBlanks: 0, days: [] }),
      day: vi
        .fn()
        .mockResolvedValue({ dayKey: clock.dayKey, hasRecord: false, focusCount: 0, tasks: [] }),
      studyDays: vi.fn().mockResolvedValue({ week: clock.weekKey, days: 0 })
    },
    milestones: {
      forMonth: vi.fn().mockResolvedValue({
        month: clock.monthKey,
        mode: 'current-empty',
        items: [],
        badge: null,
        rollupWeek: null,
        carryCandidates: [],
        archivedItems: []
      }),
      create: vi.fn(),
      rename: vi.fn(),
      setCompleted: vi.fn(),
      setArchived: vi.fn(),
      remove: vi.fn(),
      carryTitles: vi.fn()
    },
    events: {
      onTimerTransition: vi.fn(() => () => {}),
      onSessionRecorded: vi.fn(() => () => {}),
      onClockBoundary: vi.fn(() => () => {})
    }
  } as unknown as Api & { events: Api['events'] }

  render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  )
  return qc
}

describe('App — clock 게이트 (콜드 스타트 크래시 회귀)', () => {
  it('clock:now 가 아직 resolve 되지 않았으면 던지지 않고, 카드도 렌더하지 않는다', () => {
    // 절대 resolve 되지 않는 프로미스 — 콜드 스타트의 "아직 모른다" 구간을 고정한다.
    const neverResolves = new Promise<typeof clock>(() => {})
    expect(() => setup({ clockNow: () => neverResolves })).not.toThrow()

    expect(screen.queryByLabelText('타이머')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('오늘 목록')).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-row-title')).not.toBeInTheDocument()
  })

  it('clock:now 가 resolve 되면 타이머 카드와 오늘 목록이 렌더된다', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })

    expect(await screen.findByLabelText('타이머')).toBeInTheDocument()
    expect(screen.getByLabelText('오늘 목록')).toBeInTheDocument()
  })

  it('clock:now 가 거부되면 던지지 않고 중립 안내만 보여준다 (ADR-024 — 재시도 없음)', async () => {
    setup({ clockNow: () => Promise.reject(new Error('offline')) })

    expect(await screen.findByText('잠시 후 다시 열어 주세요')).toBeInTheDocument()
    expect(screen.queryByLabelText('타이머')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('오늘 목록')).not.toBeInTheDocument()
  })
})

describe('App — 카드 표면 (design-system ADR-002)', () => {
  it('다섯 카드가 유리 표면 클래스를 쓴다 — 인라인 배경으로 때우지 않는다', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })
    await screen.findByLabelText('타이머')

    for (const label of ['Milestone', '캘린더', '타이머', 'Sprint', '오늘 목록']) {
      const section = screen.getByLabelText(label)
      expect(section.className).toContain('card')
      // 인라인 background 는 backdrop-filter·shadow 를 못 데려온다. 그래서 이 검사가 있다.
      expect(section.getAttribute('style') ?? '').not.toContain('background')
    }
  })
})

describe('App — MONTH 컬럼 (app-shell ux-spec §2)', () => {
  it('마일스톤과 캘린더가 같은 컬럼에 인접해 있다 — 달 이동 연동이 시야 안에서 일어난다', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })
    await screen.findByLabelText('캘린더')

    const milestone = screen.getByLabelText('Milestone')
    const calendar = screen.getByLabelText('캘린더')
    expect(milestone.parentElement).toBe(calendar.parentElement)
  })

  it('WEEK 과 TODAY 도 한 컬럼에 쌓인다 (§2)', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })
    await screen.findByLabelText('타이머')

    expect(screen.getByLabelText('Sprint').parentElement).toBe(
      screen.getByLabelText('오늘 목록').parentElement
    )
  })

  /**
   * 두 카드가 같은 달을 말하는 것은 규율이 아니라 구조다 (calendar-records R26 · A24) —
   * 마일스톤 카드가 자기 월 상태를 갖지 않고 provider 를 구독하므로, 서로 다른 달을
   * 말하는 상태가 표현되지 않는다.
   */
  it('두 카드가 같은 달을 조회한다 (A24)', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })
    await screen.findByLabelText('캘린더')

    const api = window.api as unknown as {
      calendar: { month: ReturnType<typeof vi.fn> }
      milestones: { forMonth: ReturnType<typeof vi.fn> }
    }
    expect(api.calendar.month).toHaveBeenCalledWith(clock.monthKey)
    expect(api.milestones.forMonth).toHaveBeenCalledWith(clock.monthKey)
  })
})

describe('App — 카드 접근성 이름은 셸이 소유한다', () => {
  /**
   * 카드 컴포넌트가 자기 `aria-label` 을 또 붙이면 **같은 이름의 region 이 중첩된다.**
   * 스크린리더는 같은 이름을 두 번 읽고, `getByRole('region', …)` 은 두 요소로 갈라져
   * E2E 가 strict mode 위반으로 죽는다 — 실제로 그렇게 한 번 깨졌다 (마일스톤 카드).
   *
   * 라벨의 소유자는 App.tsx 의 `<section>` 하나뿐이라는 것을 여기서 못 박는다.
   */
  it('카드 이름 5개가 각각 정확히 하나의 region 을 가리킨다', async () => {
    setup({ clockNow: () => Promise.resolve(clock) })
    /**
     * **셸 라벨을 기다리면 안 된다.** `캘린더`·`월 결과물` 은 App 의 `<section>` 이
     * 데이터와 무관하게 즉시 그리므로, 그걸 기다리면 카드 내용이 도착하기 전에 단언이
     * 지나간다 — 중복이 생기는 것은 카드가 렌더된 **뒤**라서 그 순간엔 아무것도 안 잡힌다.
     * CI 를 깨뜨린 것이 정확히 이 타이밍이었다. 카드 안쪽이 뜬 것을 기다린다.
     */
    await screen.findByTestId('milestone-card')

    for (const label of ['Milestone', '캘린더', '타이머', 'Sprint', '오늘 목록']) {
      expect(screen.getAllByRole('region', { name: label })).toHaveLength(1)
    }
  })
})

describe('App — 미디엄 구간 (app-shell ux-spec §3)', () => {
  it('와이드에서는 MONTH 컬럼이 자리에 있고 타이틀바에 토글이 없다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 1280 })
    await screen.findByLabelText('타이머')

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    expect(screen.getByLabelText('캘린더')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MONTH' })).not.toBeInTheDocument()
  })

  it('미디엄에서는 MONTH 컬럼이 접히고 토글이 나온다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('캘린더')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MONTH' })).toBeInTheDocument()
  })

  it('미디엄에서도 타이머와 계획 카드는 그대로 남는다 — 접히는 것은 계획 레이어 순서다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    expect(screen.getByLabelText('타이머')).toBeInTheDocument()
    expect(screen.getByLabelText('Sprint')).toBeInTheDocument()
    expect(screen.getByLabelText('오늘 목록')).toBeInTheDocument()
  })

  it('콜드 스타트는 접힘이다 — 토글이 눌리지 않은 상태로 시작한다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('타이머 섹션에 최소 폭이 있다 — 폭이 모자랄 때 타이머만 눌리지 않게', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    const timer = await screen.findByLabelText('타이머')

    expect(timer.className).toContain('min-w-[288px]')
  })

  it('토글을 누르면 오버레이가 열리고 MONTH 카드가 나온다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    expect(screen.getByLabelText('캘린더')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('토글을 다시 누르면 닫힌다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
  })

  it('Esc 로 닫힌다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
  })

  it('오버레이 안 닫기 버튼으로 닫힌다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.click(screen.getByRole('button', { name: 'MONTH 닫기' }))

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
  })

  /**
   * 타이머 버튼은 정의상 오버레이 "밖"이다. 밖 클릭 닫힘을 두면 일시정지를 누를 때마다
   * 오버레이가 예고 없이 닫힌다 — 그래서 닫는 경로가 셋뿐이다 (ux-spec §3.1).
   */
  it('오버레이 밖(타이머)을 눌러도 닫히지 않고, 그 조작이 그대로 먹는다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.click(screen.getByRole('button', { name: '시작' }))

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    const api = window.api as unknown as { timer: { start: ReturnType<typeof vi.fn> } }
    expect(api.timer.start).toHaveBeenCalled()
  })

  /**
   * 컨트롤러 룰링 1: `tabindex` 를 단언하는 것은 아무것도 증명하지 않는다 — 이 코드는
   * 어디서도 tabindex 를 설정하지 않으므로 그 단언은 항상 통과한다. 비모달이라는 주장을
   * 실제로 인코딩하는 것은 오버레이 루트에 `aria-modal` 이 없고 스크림 요소가 없다는
   * 사실이다.
   */
  it('열릴 때 포커스가 오버레이 안으로 들어간다 — 갇히지는 않는다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))

    const closeButton = screen.getByRole('button', { name: 'MONTH 닫기' })
    expect(closeButton).toHaveFocus()

    const overlayRoot = closeButton.parentElement
    expect(overlayRoot).not.toHaveAttribute('aria-modal')
    expect(document.querySelector('[class*="scrim"], [class*="backdrop"]')).toBeNull()
  })
})

describe('App — 구간 전환 연속성 (app-shell ux-spec §5)', () => {
  it('와이드 → 미디엄은 오버레이가 열린 상태로 진입한다 — 보고 있던 것이 이어진다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 1280 })
    await screen.findByLabelText('타이머')
    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()

    act(() => setViewportWidth(900))

    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
  })

  it('미디엄 → 와이드는 컬럼 자리로 복귀하고 토글이 사라진다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    act(() => setViewportWidth(1280))

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MONTH' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MONTH 닫기' })).not.toBeInTheDocument()
  })

  it('미디엄 안에서 닫아 둔 뒤 와이드를 거쳐 돌아오면 다시 열린다 — 규칙은 직전 조작이 아니라 전환이다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')
    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'false')

    act(() => setViewportWidth(1280))
    act(() => setViewportWidth(900))

    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'true')
  })
})
