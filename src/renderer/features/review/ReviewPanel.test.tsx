// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/ipc/api'
import { ReviewPanel } from './ReviewPanel'
import type { ReviewError, ReviewPending, SettleInput, SettleResult } from './useReview'

type Panel = Extract<ReviewPending, { needed: true }>

const THIS_WEEK = '2026-08-24'

/**
 * 패널의 안내 섹션이 `조정` 진입점을 품으면서 이 패널도 쿼리를 쓰는 화면이 됐다
 * (pomo-baseline R25). 값을 읽지 못하면 `조정` 이 비활성일 뿐 나머지 섹션은 그대로다.
 */
function withQuery(node: ReactNode) {
  window.api = {
    settings: {
      getBaseline: vi.fn().mockResolvedValue({
        focusMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15
      }),
      setBaseline: vi.fn()
    }
  } as unknown as Api

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>
}

function panel(over: Partial<Panel> = {}): Panel {
  return {
    needed: true,
    targetWeek: '2026-08-31',
    targetWeekIsCurrent: false,
    from: THIS_WEEK,
    to: THIS_WEEK,
    summary: {
      weeks: [
        {
          week: THIS_WEEK,
          studiedDays: 3,
          measuredSec: 18000,
          unplannedMeasuredSec: 0
        }
      ],
      idleWeekCount: 0,
      lastStudiedWeek: null,
      lastStudiedMeasuredSec: null
    },
    completed: [],
    pending: [
      {
        id: 'a',
        week: THIS_WEEK,
        title: '논문 3장',
        measuredSec: 3000,
        carryWeeks: 1
      }
    ],
    baseline: { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 },
    ...over
  }
}

function result(over: Partial<SettleResult> = {}): SettleResult {
  return {
    settledThrough: THIS_WEEK,
    carriedItemIds: ['new-a'],
    droppedItemIds: [],
    autoCarried: [{ sourceItemId: 'a', newItemId: 'new-a', title: '논문 3장' }],
    ignoredExceptionIds: [],
    ...over
  }
}

function renderPanel(
  data: ReviewPending = panel(),
  over: {
    onSettled?: (m: string) => void
    onClose?: () => void
    error?: ReviewError | null
    mutate?: (input: SettleInput, o: { onSuccess: (r: SettleResult) => void }) => void
  } = {}
) {
  // `over.mutate` 를 준 테스트도 호출 인자를 볼 수 있도록 항상 spy 로 감싼다.
  const inner =
    over.mutate ??
    ((_input: SettleInput, o: { onSuccess: (r: SettleResult) => void }) => o.onSuccess(result()))
  const mutate = vi.fn(inner)
  const view = render(
    withQuery(
      <ReviewPanel
        data={data}
        currentWeek={THIS_WEEK}
        settle={{ mutate, isPending: false }}
        error={over.error ?? null}
        onSettled={over.onSettled ?? vi.fn()}
        onClose={over.onClose ?? vi.fn()}
      />
    )
  )
  return { ...view, mutate }
}

const confirmButton = () => screen.getByRole('button', { name: /시작/ })

describe('ReviewPanel — 안내 (§6)', () => {
  it('계획에 없던 집중이 1 이상일 때만 안내가 나온다', () => {
    renderPanel()
    expect(screen.queryByText(/계획에 없던 집중/)).not.toBeInTheDocument()

    renderPanel(
      panel({
        summary: {
          ...panel().summary,
          weeks: [{ ...panel().summary.weeks[0], unplannedMeasuredSec: 12000 }]
        }
      })
    )
    expect(screen.getByText(/계획에 없던 집중/)).toBeInTheDocument()
    expect(screen.getByText(/기록으로만 남아요/)).toBeInTheDocument()
    expect(screen.getAllByTestId('measured-time').at(-1)).toHaveTextContent('3시간 20분')
  })

  it('"미분류" 라는 단어를 쓰지 않는다', () => {
    const { container } = renderPanel(
      panel({
        summary: {
          ...panel().summary,
          weeks: [{ ...panel().summary.weeks[0], unplannedMeasuredSec: 4500 }]
        }
      })
    )
    expect(container.textContent).not.toContain('미분류')
  })

  it('길이를 다루지 않는다 — 표시도 진입점도 없다 (설계 R6)', () => {
    renderPanel()

    expect(screen.queryByRole('button', { name: '조정' })).toBeNull()
    expect(screen.queryByText(/뽀모 길이/)).toBeNull()
    expect(screen.queryByText(/다음 세션부터 적용돼요/)).toBeNull()
  })

  it('"정산에서만 바꿔요" 류를 쓰지 않는다', () => {
    const { container } = renderPanel()
    expect(container.textContent).not.toMatch(/정산에서만/)
  })

  /**
   * 실물에서 `계획에 없던 집중 2은` 이 나왔다. 은/는은 숫자를 **읽은 소리**에 따라
   * 갈리는데(2 = `이` → 는, 3 = `삼` → 은) 템플릿은 하나뿐이라 반드시 절반이 틀린다.
   * 주간 카드의 pull 토스트가 같은 이유로 조사를 뺐고, 여기도 끊어 쓴다.
   */
  it('숫자 뒤에 조사를 붙이지 않는다 — 어떤 값에도 어색하지 않아야 한다', () => {
    for (const sec of [30, 60, 1500, 3600, 5400]) {
      const { container, unmount } = renderPanel(
        panel({
          summary: {
            ...panel().summary,
            weeks: [{ ...panel().summary.weeks[0], unplannedMeasuredSec: sec }]
          }
        })
      )
      expect(container.textContent).toContain('계획에 없던 집중')
      expect(container.textContent).toMatch(/분| — 기록으로만 남아요/)
      expect(container.textContent).not.toMatch(/(분|시간)(은|는) /)
      unmount()
    }
  })

  it('확정 버튼이 스크롤 영역 밖 하단에 고정된다 (§10)', () => {
    renderPanel()
    const sections = screen.getByTestId('review-sections')
    expect(sections.contains(confirmButton())).toBe(false)
  })
})

describe('ReviewPanel — 확정 버튼 (§7.1·§7.2)', () => {
  it('계획 대상 주가 다음 주면 라벨이 다음 주다', () => {
    renderPanel()
    expect(confirmButton()).toHaveTextContent('다음 주 시작 (이월 1건 포함)')
  })

  it('계획 대상 주가 오늘의 주면 라벨이 이번 주다', () => {
    renderPanel(panel({ targetWeekIsCurrent: true }))
    expect(confirmButton()).toHaveTextContent('이번 주 시작 (이월 1건 포함)')
  })

  it('이월 건수가 0 이면 괄호를 붙이지 않는다', () => {
    renderPanel(panel({ pending: [] }))
    expect(confirmButton()).toHaveTextContent('다음 주 시작')
    expect(confirmButton()).not.toHaveTextContent('포함')
  })

  /**
   * R40 의 중립 사실 줄. 규모를 **건수**로 말한다 (ADR-031 §1) — 이월분의 측정 시간은
   * 0 이라 시간으로는 아무것도 말할 수 없다. 나란히 놓던 예산은 함께 죽었다.
   */
  it('A28 — 이월 규모를 건수로 적고 확정을 막지 않는다', () => {
    renderPanel(
      panel({
        pending: [
          { id: 'x', week: THIS_WEEK, title: '하나', measuredSec: 0, carryWeeks: 1 },
          { id: 'y', week: THIS_WEEK, title: '둘', measuredSec: 0, carryWeeks: 1 }
        ]
      })
    )
    expect(screen.getByText('이월 2건')).toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
  })

  it('예산을 말하지 않는다 — 폐기된 통화다 (ADR-030 §1)', () => {
    const { container } = renderPanel()
    expect(container.textContent).not.toContain('예산')
  })

  it('과적을 막거나 경고하지 않는다 (원칙 4·6)', () => {
    const { container } = renderPanel()
    for (const word of ['예산 초과', '무리', '위험', '경고']) {
      expect(container.textContent).not.toContain(word)
    }
  })

  it('확정 전 확인 다이얼로그가 없다 (§7.3)', async () => {
    const { mutate } = renderPanel()
    await userEvent.click(confirmButton())
    expect(mutate).toHaveBeenCalledOnce()
  })

  it('선택을 예외로 담아 보낸다 — 손대지 않은 항목은 빠진다', async () => {
    const { mutate } = renderPanel()
    await userEvent.click(confirmButton())
    expect(mutate.mock.calls[0][0]).toEqual({
      expectedRange: { from: THIS_WEEK, to: THIS_WEEK },
      targetWeek: '2026-08-31',
      exceptions: []
    })
  })

  it('보내주기를 고르면 그 예외만 실린다', async () => {
    const { mutate } = renderPanel()
    await userEvent.click(
      within(screen.getByTestId('pending-row')).getByRole('button', { name: '보내주기' })
    )
    await userEvent.click(confirmButton())
    expect(mutate.mock.calls[0][0].exceptions).toEqual([{ kind: 'drop', itemId: 'a' }])
  })
})

describe('ReviewPanel — 확정 후 (§7.3)', () => {
  it('사실만 담은 토스트를 넘긴다', async () => {
    const onSettled = vi.fn()
    renderPanel(panel(), { onSettled })
    await userEvent.click(confirmButton())
    expect(onSettled).toHaveBeenCalledWith('다음 주로 1건 넘어갔어요')
  })

  it('R30 — 화면이 몰랐던 이월만 "그 사이 추가된" 으로 센다', async () => {
    const onSettled = vi.fn()
    renderPanel(panel(), {
      onSettled,
      mutate: (_input, o) =>
        o.onSuccess(
          result({
            carriedItemIds: ['new-a', 'new-ghost', 'new-ghost2'],
            autoCarried: [
              { sourceItemId: 'a', newItemId: 'new-a', title: '논문 3장' },
              { sourceItemId: 'ghost', newItemId: 'new-ghost', title: '몰랐던 것' },
              { sourceItemId: 'ghost2', newItemId: 'new-ghost2', title: '또' }
            ]
          })
        )
    })
    await userEvent.click(confirmButton())
    expect(onSettled).toHaveBeenCalledWith(
      '다음 주로 3건 넘어갔어요 · 그 사이 추가된 2건도 함께 넘어갔어요'
    )
  })

  it('축하·사과 문구를 쓰지 않는다', async () => {
    const onSettled = vi.fn()
    renderPanel(panel(), { onSettled })
    await userEvent.click(confirmButton())
    const message = onSettled.mock.calls[0][0] as string
    for (const word of ['축하', '잘했', '죄송', '아쉽']) {
      expect(message).not.toContain(word)
    }
  })
})

describe('ReviewPanel — 예외 화면 (§8)', () => {
  it('범위가 달라졌으면 다시 불러왔다고 알린다', () => {
    renderPanel(panel(), { error: 'stale' })
    expect(screen.getByTestId('review-error')).toHaveTextContent(
      '날짜가 바뀌어서 정산 범위를 다시 불러왔어요'
    )
  })

  it('확정 실패는 아무것도 반영되지 않았음을 명시한다 (R22)', () => {
    renderPanel(panel(), { error: 'failed' })
    expect(screen.getByTestId('review-error')).toHaveTextContent('아무것도 반영되지 않았어요')
  })

  it('실패해도 선택이 유지된다 (§8.1)', async () => {
    const { rerender } = renderPanel()
    await userEvent.click(
      within(screen.getByTestId('pending-row')).getByRole('button', { name: '보내주기' })
    )
    expect(screen.getByRole('button', { name: '보내주기' })).toHaveAttribute('aria-pressed', 'true')

    rerender(
      withQuery(
        <ReviewPanel
          data={panel()}
          currentWeek={THIS_WEEK}
          settle={{ mutate: vi.fn(), isPending: false }}
          error="failed"
          onSettled={vi.fn()}
          onClose={vi.fn()}
        />
      )
    )
    expect(screen.getByRole('button', { name: '보내주기' })).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * §8.1. `STALE_RANGE` 후 재조회하면 행 집합이 달라질 수 있다. 살아남은 행의 선택은
   * id 로 이어지고, 새 행은 기본 이월로 시작한다. (스테퍼 값의 클램프 규칙은 축소
   * 처분과 함께 죽었다 — ADR-031 §1.)
   */
  it('범위가 커져도 기존 행의 선택이 살아남고 새 행은 기본 이월이다', async () => {
    const { rerender } = renderPanel()
    await userEvent.click(
      within(screen.getByTestId('pending-row')).getByRole('button', { name: '보내주기' })
    )

    const grown = panel({
      from: '2026-08-17',
      to: THIS_WEEK,
      pending: [
        ...panel().pending,
        {
          id: 'newcomer',
          week: '2026-08-17',
          title: '새로 들어온 주',
          measuredSec: 0,
          carryWeeks: 1
        }
      ]
    })
    rerender(
      withQuery(
        <ReviewPanel
          data={grown}
          currentWeek={THIS_WEEK}
          settle={{ mutate: vi.fn(), isPending: false }}
          error="stale"
          onSettled={vi.fn()}
          onClose={vi.fn()}
        />
      )
    )

    const rows = screen.getAllByTestId('pending-row')
    expect(rows).toHaveLength(2)
    const survivor = rows.find((r) => r.textContent?.includes('논문 3장'))!
    expect(within(survivor).getByRole('button', { name: '보내주기' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const newcomer = rows.find((r) => r.textContent?.includes('새로 들어온 주'))!
    expect(within(newcomer).getByRole('button', { name: '다음 주로' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('그 사이 세션이 돌아 시간이 늘어도 선택은 그대로다', async () => {
    const { rerender } = renderPanel()
    await userEvent.click(
      within(screen.getByTestId('pending-row')).getByRole('button', { name: '보내주기' })
    )

    rerender(
      withQuery(
        <ReviewPanel
          data={panel({ pending: [{ ...panel().pending[0], measuredSec: 9000 }] })}
          currentWeek={THIS_WEEK}
          settle={{ mutate: vi.fn(), isPending: false }}
          error={null}
          onSettled={vi.fn()}
          onClose={vi.fn()}
        />
      )
    )
    expect(
      within(screen.getByTestId('pending-row')).getByTestId('measured-time')
    ).toHaveTextContent('2시간 30분')
    expect(screen.getByRole('button', { name: '보내주기' })).toHaveAttribute('aria-pressed', 'true')
  })
})
