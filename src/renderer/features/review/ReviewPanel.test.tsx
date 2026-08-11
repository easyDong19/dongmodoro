// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReviewPanel } from './ReviewPanel'
import type { ReviewError, ReviewPending, SettleInput, SettleResult } from './useReview'

type Panel = Extract<ReviewPending, { needed: true }>

const THIS_WEEK = '2026-08-24'

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
          spentPomos: 12,
          budget: 20,
          unplannedPomos: 0
        }
      ],
      idleWeekCount: 0,
      lastStudiedWeek: null,
      lastStudiedPomos: null
    },
    completed: [],
    pending: [
      {
        id: 'a',
        week: THIS_WEEK,
        title: '논문 3장',
        estPomos: 5,
        spentPomos: 2,
        remaining: 3,
        carryWeeks: 1
      }
    ],
    targetWeekBudget: 20,
    baseline: { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 },
    ...over
  }
}

function result(over: Partial<SettleResult> = {}): SettleResult {
  return {
    settledThrough: THIS_WEEK,
    carriedItemIds: ['new-a'],
    droppedItemIds: [],
    carriedPomos: 3,
    autoCarried: [{ sourceItemId: 'a', newItemId: 'new-a', title: '논문 3장', estPomos: 3 }],
    ignoredExceptionIds: [],
    clampedExceptionIds: [],
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
    <ReviewPanel
      data={data}
      currentWeek={THIS_WEEK}
      settle={{ mutate, isPending: false }}
      error={over.error ?? null}
      onSettled={over.onSettled ?? vi.fn()}
      onClose={over.onClose ?? vi.fn()}
    />
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
          weeks: [{ ...panel().summary.weeks[0], unplannedPomos: 8 }]
        }
      })
    )
    expect(screen.getByText(/계획에 없던 집중 8 — 기록으로만 남아요/)).toBeInTheDocument()
  })

  it('"미분류" 라는 단어를 쓰지 않는다', () => {
    const { container } = renderPanel(
      panel({
        summary: {
          ...panel().summary,
          weeks: [{ ...panel().summary.weeks[0], unplannedPomos: 3 }]
        }
      })
    )
    expect(container.textContent).not.toContain('미분류')
  })

  it('현재 뽀모 길이를 사실로 적고 효력 시점을 밝힌다', () => {
    renderPanel()
    expect(screen.getByText('뽀모 길이 — 집중 25 · 짧은 휴식 5 · 긴 휴식 15')).toBeInTheDocument()
    expect(
      screen.getByText('바꾼 길이는 다음 주부터 적용돼요 · 이번 주 기록은 그대로예요')
    ).toBeInTheDocument()
  })

  it('조정 버튼은 이번 마일스톤에 없다 — 갈 화면이 없다', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: '조정' })).not.toBeInTheDocument()
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
  it('숫자 뒤에 조사를 붙이지 않는다 — 어떤 수에도 어색하지 않아야 한다', () => {
    for (const n of [1, 2, 3, 6, 9, 10]) {
      const { container, unmount } = renderPanel(
        panel({
          summary: {
            ...panel().summary,
            weeks: [{ ...panel().summary.weeks[0], unplannedPomos: n }]
          }
        })
      )
      expect(container.textContent).toContain(`계획에 없던 집중 ${n} —`)
      expect(container.textContent).not.toContain(`집중 ${n}은`)
      expect(container.textContent).not.toContain(`집중 ${n}는`)
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
    expect(confirmButton()).toHaveTextContent('다음 주 시작 (이월 뽀모 3 포함)')
  })

  it('계획 대상 주가 오늘의 주면 라벨이 이번 주다', () => {
    renderPanel(panel({ targetWeekIsCurrent: true }))
    expect(confirmButton()).toHaveTextContent('이번 주 시작 (이월 뽀모 3 포함)')
  })

  it('이월 뽀모가 0 이면 괄호를 붙이지 않는다', () => {
    renderPanel(panel({ pending: [] }))
    expect(confirmButton()).toHaveTextContent('다음 주 시작')
    expect(confirmButton()).not.toHaveTextContent('포함')
  })

  it('A28 — 이월과 예산을 중립 사실로 나란히 놓고 확정을 막지 않는다', () => {
    renderPanel(
      panel({
        targetWeekBudget: 20,
        pending: [
          {
            id: 'big',
            week: THIS_WEEK,
            title: '큰 것',
            estPomos: 60,
            spentPomos: 0,
            remaining: 60,
            carryWeeks: 1
          }
        ]
      })
    )
    expect(screen.getByText('이월 60 · 다음 주 예산 20')).toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
  })

  it('예산이 없으면 예산 숫자를 지어내지 않는다', () => {
    renderPanel(panel({ targetWeekBudget: null }))
    // 요약은 그 주 자신의 예산을 말할 수 있다 — 여기서 보는 것은 확정 위 중립 사실 줄이다.
    expect(screen.getByText('이월 3')).toBeInTheDocument()
    expect(screen.queryByText(/이월 3 · /)).not.toBeInTheDocument()
  })

  it('과적을 막거나 경고하지 않는다 (원칙 4·6)', () => {
    const { container } = renderPanel(panel({ targetWeekBudget: 1 }))
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
              { sourceItemId: 'a', newItemId: 'new-a', title: '논문 3장', estPomos: 3 },
              { sourceItemId: 'ghost', newItemId: 'new-ghost', title: '몰랐던 것', estPomos: 1 },
              { sourceItemId: 'ghost2', newItemId: 'new-ghost2', title: '또', estPomos: 1 }
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
      within(screen.getByTestId('pending-row')).getByRole('button', { name: '줄여서' })
    )
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('2')

    rerender(
      <ReviewPanel
        data={panel()}
        currentWeek={THIS_WEEK}
        settle={{ mutate: vi.fn(), isPending: false }}
        error="failed"
        onSettled={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('2')
  })

  /**
   * §8.1. `STALE_RANGE` 후 재조회하면 행 집합이 달라질 수 있다. 살아남은 행의 선택은
   * id 로 이어지고, 새 행은 기본 이월로 시작하며, 남은 몫이 줄었으면 상한으로 잘린다.
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
          estPomos: 2,
          spentPomos: 0,
          remaining: 2,
          carryWeeks: 1
        }
      ]
    })
    rerender(
      <ReviewPanel
        data={grown}
        currentWeek={THIS_WEEK}
        settle={{ mutate: vi.fn(), isPending: false }}
        error="stale"
        onSettled={vi.fn()}
        onClose={vi.fn()}
      />
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

  it('남은 몫이 줄면 스테퍼 값이 새 상한으로 잘린다', async () => {
    const { rerender } = renderPanel(
      panel({
        pending: [{ ...panel().pending[0], estPomos: 8, spentPomos: 0, remaining: 8 }]
      })
    )
    await userEvent.click(
      within(screen.getByTestId('pending-row')).getByRole('button', { name: '줄여서' })
    )
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('4')

    // 패널을 열어둔 사이 세션이 돌아 남은 몫이 2 로 줄었다
    rerender(
      <ReviewPanel
        data={panel({
          pending: [{ ...panel().pending[0], estPomos: 8, spentPomos: 6, remaining: 2 }]
        })}
        currentWeek={THIS_WEEK}
        settle={{ mutate: vi.fn(), isPending: false }}
        error={null}
        onSettled={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('2')
  })
})
