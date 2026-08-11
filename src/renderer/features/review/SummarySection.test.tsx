// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SummarySection } from './SummarySection'
import type { ReviewPending } from './useReview'

type Panel = Extract<ReviewPending, { needed: true }>
type Summary = Panel['summary']
type WeekFact = Summary['weeks'][number]

const THIS_WEEK = '2026-08-24'

function fact(over: Partial<WeekFact> = {}): WeekFact {
  return {
    week: THIS_WEEK,
    studiedDays: 3,
    spentPomos: 12,
    budget: 20,
    unplannedPomos: 0,
    ...over
  }
}

function summary(over: Partial<Summary> = {}): Summary {
  return {
    weeks: [fact()],
    idleWeekCount: 0,
    lastStudiedWeek: null,
    lastStudiedPomos: null,
    ...over
  }
}

function renderSummary(over: Partial<Summary> = {}, from = THIS_WEEK, to = THIS_WEEK) {
  return render(
    <SummarySection summary={summary(over)} from={from} to={to} currentWeek={THIS_WEEK} />
  )
}

describe('SummarySection — 한 일을 먼저 (§3 · R9 · A6)', () => {
  it('범위가 이번 주 하나면 마감 문구와 공부한 날·소진을 적는다', () => {
    renderSummary()
    expect(screen.getByText(/이번 주 마감/)).toBeInTheDocument()
    expect(screen.getByText(/3일 공부/)).toBeInTheDocument()
    expect(screen.getByText(/뽀모 12 소진/)).toBeInTheDocument()
    expect(screen.getByText(/예산 20/)).toBeInTheDocument()
  })

  it('예산이 없으면 예산 괄호를 아예 적지 않는다 — 0 이라고 하지 않는다', () => {
    renderSummary({ weeks: [fact({ budget: null })] })
    expect(screen.queryByText(/예산/)).not.toBeInTheDocument()
  })

  it('예산 0 은 기록 없음과 다르다 — 0 으로 적는다', () => {
    renderSummary({ weeks: [fact({ budget: 0 })] })
    expect(screen.getByText(/예산 0/)).toBeInTheDocument()
  })

  it('범위가 과거 한 주면 그 주를 날짜로 밝힌다', () => {
    renderSummary({ weeks: [fact({ week: '2026-08-17' })] }, '2026-08-17', '2026-08-17')
    expect(screen.getByText(/지난 주\(8\/17\)/)).toBeInTheDocument()
  })

  it('여러 주면 헤더에 합계를, 아래에 주별 한 줄을 놓는다 (R11)', () => {
    renderSummary(
      {
        weeks: [
          fact({ week: '2026-08-10', studiedDays: 2, spentPomos: 6 }),
          fact({ week: '2026-08-17', studiedDays: 4, spentPomos: 9 })
        ]
      },
      '2026-08-10',
      '2026-08-17'
    )
    expect(screen.getByText(/뽀모 15 소진/)).toBeInTheDocument()
    const rows = screen.getAllByTestId('summary-week-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('8/10 · 2일 공부, 뽀모 6')
  })

  it('달성률 %를 주요 지표로 띄우지 않는다', () => {
    const { container } = renderSummary()
    expect(container.textContent).not.toMatch(/%/)
  })

  it('소진 수를 뽀모 도트와 숫자로 함께 보여준다', () => {
    renderSummary({ weeks: [fact({ spentPomos: 4, budget: null })] })
    expect(screen.getAllByTestId('pomo-dot-filled')).toHaveLength(4)
  })
})

describe('SummarySection — 공백과 빈 기록 (R31 · A25)', () => {
  it('공백 주를 판단 없이 사실로만 적는다', () => {
    renderSummary(
      { idleWeekCount: 2, lastStudiedWeek: '2026-07-27', lastStudiedPomos: 20 },
      '2026-08-03',
      '2026-08-17'
    )
    expect(screen.getByText(/2주 쉬었어요/)).toBeInTheDocument()
    expect(screen.getByText(/마지막으로 공부한 주\(7\/27\) 뽀모 20 소진/)).toBeInTheDocument()
  })

  it('공부한 적이 없으면 마지막 공부 주 문장을 렌더하지 않는다', () => {
    renderSummary({ idleWeekCount: 1, lastStudiedWeek: null, lastStudiedPomos: null })
    expect(screen.queryByText(/마지막으로 공부한 주/)).not.toBeInTheDocument()
  })

  it('기록이 전혀 없는 범위는 주별 목록 대신 한 줄만 남긴다', () => {
    renderSummary({ weeks: [], idleWeekCount: 3 }, '2026-08-03', '2026-08-17')
    expect(screen.getByText('이 기간에는 기록이 없어요')).toBeInTheDocument()
    expect(screen.queryAllByTestId('summary-week-row')).toHaveLength(0)
  })

  it('공백이 없으면 쉬었다는 문장을 적지 않는다', () => {
    renderSummary({ idleWeekCount: 0 })
    expect(screen.queryByText(/쉬었어요/)).not.toBeInTheDocument()
  })
})

describe('SummarySection — 톤 (원칙 6·7)', () => {
  it('실패 프레임 단어를 쓰지 않는다', () => {
    const { container } = renderSummary({
      idleWeekCount: 2,
      lastStudiedWeek: '2026-07-27',
      lastStudiedPomos: 20
    })
    for (const word of ['미달성', '밀린', '숙제', '지연', '실패', '아쉽']) {
      expect(container.textContent).not.toContain(word)
    }
  })

  it('--danger 를 쓰지 않는다', () => {
    const { container } = renderSummary({ weeks: [fact({ spentPomos: 40, budget: 10 })] })
    expect(container.innerHTML).not.toMatch(/danger/)
  })
})
