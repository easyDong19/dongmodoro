// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { Api } from '@shared/ipc/api'
import { MilestoneCard } from './MilestoneCard'
import {
  DisplayMonthProvider,
  useDisplayMonth
} from '@renderer/features/calendar/DisplayMonthProvider'

const MONTH = '2026-08'
const TODAY = '2026-08-04'
const WEEK = '2026-08-03'

type MonthRes = Awaited<ReturnType<Api['milestones']['forMonth']>>
type Item = MonthRes['items'][number]
type Bare = MonthRes['carryCandidates'][number]

function bare(over: Partial<Bare> = {}): Bare {
  return { id: 'm1', month: MONTH, title: '결과물', completedAt: null, archivedAt: null, ...over }
}

function item(over: Partial<Item> = {}): Item {
  return { ...bare(), rollup: null, ...over }
}

function makeRes(over: Partial<MonthRes> = {}): MonthRes {
  return {
    month: MONTH,
    mode: 'edit',
    items: [],
    badge: null,
    rollupWeek: null,
    carryCandidates: [],
    archivedItems: [],
    ...over
  }
}

async function renderCard(res: MonthRes, clockWeek = WEEK) {
  const calls = {
    create: vi.fn().mockResolvedValue({ month: MONTH, id: 'new' }),
    rename: vi.fn().mockResolvedValue(undefined),
    setCompleted: vi.fn().mockResolvedValue({ completedAt: null }),
    setArchived: vi.fn().mockResolvedValue({ archivedAt: null }),
    remove: vi.fn().mockResolvedValue(undefined),
    carryTitles: vi.fn().mockResolvedValue({ month: MONTH, created: 1 })
  }

  window.api = {
    clock: {
      now: vi
        .fn()
        .mockResolvedValue({ dayKey: TODAY, weekKey: clockWeek, monthKey: MONTH, weekdayIndex: 1 })
    },
    milestones: { forMonth: vi.fn().mockResolvedValue(res), ...calls }
  } as unknown as Api

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  qc.setQueryData(['clock'], {
    dayKey: TODAY,
    weekKey: clockWeek,
    monthKey: MONTH,
    weekdayIndex: 1
  })

  const view = render(
    <QueryClientProvider client={qc}>
      <DisplayMonthProvider>
        <MilestoneCard />
      </DisplayMonthProvider>
    </QueryClientProvider>
  )
  await screen.findByTestId('milestone-card')
  return { ...view, calls }
}

describe('표시 모드로만 분기한다 (R20)', () => {
  it('서버가 준 mode 를 그대로 쓴다 — 화면이 조건을 다시 계산하지 않는다', async () => {
    await renderCard(
      makeRes({
        mode: 'past',
        items: [item()],
        badge: { total: 1, completed: 1, archivedCount: 0 }
      })
    )
    expect(screen.getByTestId('milestone-card')).toHaveAttribute('data-mode', 'past')
  })

  it('지난달 카드에는 추가·완료 토글·삭제 진입점이 없다 (A20)', async () => {
    await renderCard(
      makeRes({
        mode: 'past',
        items: [item()],
        badge: { total: 1, completed: 0, archivedCount: 0 }
      })
    )
    expect(screen.queryByTestId('milestone-add')).not.toBeInTheDocument()
    expect(screen.queryByTestId('milestone-complete')).not.toBeInTheDocument()
    expect(screen.queryByTestId('milestone-delete')).not.toBeInTheDocument()
  })

  it('지난달에서도 보관은 동작한다 — 읽기 전용에서 유일하게 허용되는 쓰기다 (R11 · A20)', async () => {
    const user = userEvent.setup()
    const { calls } = await renderCard(
      makeRes({
        mode: 'past',
        items: [item()],
        badge: { total: 1, completed: 0, archivedCount: 0 }
      })
    )
    await user.click(screen.getByTestId('milestone-archive'))
    expect(calls.setArchived).toHaveBeenCalledWith({ id: 'm1', archived: true })
  })

  it('미래 달에는 편집이 열린다 — 날짜 제한이 없다 (R6 개정)', async () => {
    await renderCard(makeRes({ mode: 'lead-edit' }))
    expect(screen.getByTestId('milestone-add')).toBeInTheDocument()
  })
})

describe('월 이동 중간 상태 — 언마운트 깜빡임 금지', () => {
  it('새 달 응답이 오기 전에는 이전 달 내용이 그대로 남아 있다', async () => {
    const user = userEvent.setup()
    const res = makeRes({ mode: 'edit', items: [item({ title: '8월 결과물' })] })
    // 8월만 즉시 응답하고 다른 달은 영원히 보류한다 — 전환 중간 상태를 관찰한다.
    const forMonth = vi.fn((m: string) =>
      m === MONTH ? Promise.resolve(res) : new Promise<MonthRes>(() => {})
    )

    window.api = {
      clock: {
        now: vi
          .fn()
          .mockResolvedValue({ dayKey: TODAY, weekKey: WEEK, monthKey: MONTH, weekdayIndex: 1 })
      },
      milestones: { forMonth }
    } as unknown as Api

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    qc.setQueryData(['clock'], { dayKey: TODAY, weekKey: WEEK, monthKey: MONTH, weekdayIndex: 1 })

    // 카드에는 월 이동 버튼이 없다 (R19) — 캘린더가 하는 일을 최소 트리거로 대신한다.
    function NextMonthTrigger() {
      const { goNextMonth } = useDisplayMonth()
      return (
        <button type="button" onClick={goNextMonth}>
          다음 달로
        </button>
      )
    }

    render(
      <QueryClientProvider client={qc}>
        <DisplayMonthProvider>
          <MilestoneCard />
          <NextMonthTrigger />
        </DisplayMonthProvider>
      </QueryClientProvider>
    )
    await screen.findByText('8월 결과물')

    await user.click(screen.getByText('다음 달로'))

    // 응답이 보류된 동안 카드가 null 로 무너지면, 왼쪽 컬럼 전체가 주저앉았다가
    // 다시 솟는 점프가 전환마다 일어난다 (계측: 캘린더 카드 y 이동 112px).
    expect(screen.getByTestId('milestone-card')).toBeInTheDocument()
    expect(screen.getByText('8월 결과물')).toBeInTheDocument()
  })
})

describe('배지 (R21 · A21·A22)', () => {
  it('보관이 있으면 건수를 함께 적는다', async () => {
    await renderCard(
      makeRes({
        mode: 'past',
        items: [item()],
        badge: { total: 3, completed: 1, archivedCount: 2 }
      })
    )
    expect(screen.getByText('1/3 달성 · 보관 2건')).toBeInTheDocument()
  })

  it('보관이 없으면 건수 표기가 붙지 않는다', async () => {
    await renderCard(
      makeRes({
        mode: 'past',
        items: [item()],
        badge: { total: 3, completed: 1, archivedCount: 0 }
      })
    )
    expect(screen.getByText('1/3 달성')).toBeInTheDocument()
  })

  it('배지가 null 이면 렌더하지 않는다 — 0/0 달성이 존재하지 않는다 (A22)', async () => {
    await renderCard(makeRes({ mode: 'past-empty' }))
    expect(screen.queryByTestId('milestone-badge')).not.toBeInTheDocument()
    expect(screen.getByText('이 달은 계획 없이 지나갔어요')).toBeInTheDocument()
  })
})

describe('보관 목록 — 해제의 도달 경로 (R11 · A20)', () => {
  it('보관 건수를 펼치면 해제 버튼이 나온다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderCard(
      makeRes({
        mode: 'past',
        items: [],
        badge: { total: 1, completed: 0, archivedCount: 1 },
        archivedItems: [bare({ id: 'm-arch', archivedAt: '2026-08-20T00:00:00.000Z' })]
      })
    )

    await user.click(screen.getByTestId('archived-toggle'))
    await user.click(screen.getByTestId('milestone-unarchive'))
    expect(calls.setArchived).toHaveBeenCalledWith({ id: 'm-arch', archived: false })
  })

  it('보관이 0건이면 토글 자체가 없다', async () => {
    await renderCard(makeRes({ mode: 'edit', items: [item()] }))
    expect(screen.queryByTestId('archived-toggle')).not.toBeInTheDocument()
  })
})

describe('롤업 (R17 · A16·A17)', () => {
  it('언제나 범위 라벨과 함께 렌더한다 (A16)', async () => {
    await renderCard(
      makeRes({
        mode: 'edit',
        rollupWeek: WEEK,
        items: [item({ rollup: { measuredSec: 12000 } })]
      })
    )
    expect(screen.getByTestId('milestone-rollup')).toHaveTextContent('이번 주 3시간 20분')
  })

  /**
   * 분수가 아니라 시간 하나다 (ADR-030 §3) — 분모였던 est 합이 사라졌다. `0` 은
   * "쟀는데 0" 이라는 사실이므로 롤업 없음(`null`)과 달리 줄을 지우지 않는다 (R17·R18).
   */
  it('세션이 없던 주도 0분 으로 사실을 적는다', async () => {
    await renderCard(
      makeRes({
        mode: 'edit',
        rollupWeek: WEEK,
        items: [item({ rollup: { measuredSec: 0 } })]
      })
    )
    expect(screen.getByTestId('milestone-rollup')).toHaveTextContent('이번 주 0분')
  })

  /**
   * A17 — 달 전환 직후. 진행 중인 주가 8/31 시작이라 8월에 귀속되므로, 9월 카드(여기서는
   * 이번 달 카드)는 숫자 대신 사실 문구를 둔다.
   */
  it('귀속 주가 이 달이 아니면 숫자 대신 사실 문구를 둔다 (A17)', async () => {
    await renderCard(makeRes({ mode: 'edit', rollupWeek: null, items: [item()] }), '2026-08-31')
    expect(screen.queryByTestId('milestone-rollup')).not.toBeInTheDocument()
    expect(screen.getByTestId('rollup-out-of-month')).toHaveTextContent(
      '이번 주(8/31 – 9/6)는 8월에 속한 주예요'
    )
  })
})

describe('M 라벨은 렌더 전용이다 (R5 · A5)', () => {
  /**
   * A5 — 첫 항목이 목록에서 빠지면 두 번째의 라벨이 `M1` 로 바뀌지만, 그 마일스톤을
   * 가리키는 값은 어디서도 변하지 않는다. 라벨이 표시 순서에서만 나오고 조작이 `id` 로만
   * 나가는지를 본다.
   */
  it('목록이 바뀌면 라벨이 재배치되지만 조작은 여전히 id 로 나간다', async () => {
    const both = [item({ id: 'a', title: '첫째' }), item({ id: 'b', title: '둘째' })]
    const first = await renderCard(makeRes({ mode: 'edit', items: both }))
    const rows = screen.getAllByTestId('milestone-row')
    expect(within(rows[0]).getByText('M1')).toBeInTheDocument()
    expect(within(rows[1]).getByText('M2')).toBeInTheDocument()
    expect(rows[1]).toHaveAttribute('data-milestone-id', 'b')
    first.unmount()

    // 첫째가 빠진 목록 — 둘째가 M1 이 된다.
    const { calls } = await renderCard(makeRes({ mode: 'edit', items: [both[1]] }))
    const only = screen.getByTestId('milestone-row')
    expect(within(only).getByText('M1')).toBeInTheDocument()
    expect(only).toHaveAttribute('data-milestone-id', 'b')

    const user = userEvent.setup()
    await user.click(within(only).getByTestId('milestone-complete'))
    expect(calls.setCompleted).toHaveBeenCalledWith({ id: 'b', completed: true })
  })
})

describe('빈 상태 문구 (R23)', () => {
  it('이번 달 빈 상태 카피와 복사 액션', async () => {
    await renderCard(
      makeRes({
        mode: 'current-empty',
        carryCandidates: [bare({ id: 'p1', month: '2026-07', title: '남은 것' })]
      })
    )
    expect(screen.getByText('이번 달이 끝나면 뭐가 달라져 있을까요?')).toBeInTheDocument()
    expect(screen.getByTestId('carry-titles-open')).toBeInTheDocument()
  })

  it('직전 달 후보가 0건이면 복사 액션이 없다 (A23)', async () => {
    await renderCard(makeRes({ mode: 'current-empty', carryCandidates: [] }))
    expect(screen.queryByTestId('carry-titles-open')).not.toBeInTheDocument()
  })

  it('다음 달 빈 상태는 아직 계획 전 + N월 계획 잡기', async () => {
    await renderCard(makeRes({ mode: 'lead-edit', items: [] }))
    expect(screen.getByText('아직 계획 전')).toBeInTheDocument()
    expect(screen.getByTestId('milestone-add')).toHaveTextContent('8월 계획 잡기')
  })
})

describe('제목 복사는 제목만 보낸다 (R22 · A23)', () => {
  it('고른 항목의 제목 배열만 전송한다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderCard(
      makeRes({
        mode: 'current-empty',
        carryCandidates: [
          bare({ id: 'p1', month: '2026-07', title: '남은 것' }),
          bare({ id: 'p2', month: '2026-07', title: '다른 것' })
        ]
      })
    )

    await user.click(screen.getByTestId('carry-titles-open'))
    await user.click(screen.getAllByTestId('carry-candidate')[0])
    await user.click(screen.getByTestId('carry-titles-confirm'))

    expect(calls.carryTitles).toHaveBeenCalledWith({ month: MONTH, titles: ['남은 것'] })
  })
})

describe('삭제 확인 (R8 · A8)', () => {
  it('확인을 한 번 요구하고, 문구가 잃는 것과 남는 것을 함께 말한다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderCard(makeRes({ mode: 'edit', items: [item()] }))

    await user.click(screen.getByTestId('milestone-delete'))
    expect(calls.remove).not.toHaveBeenCalled()
    expect(screen.getByTestId('milestone-delete-confirm')).toHaveTextContent('되돌릴 수 없어요')
    expect(screen.getByTestId('milestone-delete-confirm')).toHaveTextContent('집중 기록은 그대로')

    await user.click(screen.getByTestId('milestone-delete-confirm-yes'))
    expect(calls.remove).toHaveBeenCalledWith('m1')
  })

  it('그대로 두기를 누르면 지우지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderCard(makeRes({ mode: 'edit', items: [item()] }))
    await user.click(screen.getByTestId('milestone-delete'))
    await user.click(screen.getByText('그대로 두기'))
    expect(calls.remove).not.toHaveBeenCalled()
  })
})

describe('개수를 막지 않는다 (R4 · A4)', () => {
  it('4개여도 경고색·차단이 없고 추가 CTA 가 그대로 있다', async () => {
    await renderCard(
      makeRes({
        mode: 'edit',
        items: [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' }), item({ id: 'd' })]
      })
    )
    expect(screen.getAllByTestId('milestone-row')).toHaveLength(4)
    expect(screen.getByTestId('milestone-add')).toBeEnabled()
  })
})

describe('부정 프레임과 이모지 금지 (R23·R25 · A24·A25)', () => {
  it('미완료에 부정 표기를 붙이지 않는다 (A24)', async () => {
    const { container } = await renderCard(
      makeRes({
        mode: 'past',
        items: [item({ completedAt: null })],
        badge: { total: 2, completed: 1, archivedCount: 0 }
      })
    )
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/미달성|실패|남음|더 해보/)
  })

  it('렌더 텍스트에 이모지가 없다 (A25)', async () => {
    const { container } = await renderCard(
      makeRes({
        mode: 'edit',
        rollupWeek: WEEK,
        items: [item({ rollup: { measuredSec: 1500 } })]
      })
    )
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
