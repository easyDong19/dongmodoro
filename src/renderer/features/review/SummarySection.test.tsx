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
    measuredSec: 18000,
    unplannedMeasuredSec: 0,
    ...over
  }
}

function summary(over: Partial<Summary> = {}): Summary {
  return {
    weeks: [fact()],
    idleWeekCount: 0,
    lastStudiedWeek: null,
    lastStudiedMeasuredSec: null,
    ...over
  }
}

function renderSummary(over: Partial<Summary> = {}, from = THIS_WEEK, to = THIS_WEEK) {
  return render(
    <SummarySection summary={summary(over)} from={from} to={to} currentWeek={THIS_WEEK} />
  )
}

describe('SummarySection — 한 일을 먼저 (§3 · R9 · A6)', () => {
  it('범위가 이번 주 하나면 마감 문구와 공부한 날·측정 시간을 적는다', () => {
    renderSummary()
    expect(screen.getByText(/이번 주 마감/)).toBeInTheDocument()
    expect(screen.getByText(/3일 공부/)).toBeInTheDocument()
    expect(screen.getByTestId('measured-time')).toHaveTextContent('5시간')
  })

  /** 예산은 폐기된 통화다 (ADR-030 §1) — 계획 대비를 말하는 자리가 요약에 없다. */
  it('예산을 말하지 않는다', () => {
    const { container } = renderSummary()
    expect(container.textContent).not.toContain('예산')
  })

  it('세션이 없던 주도 0분 으로 사실을 적는다 (ux-spec §0.5)', () => {
    renderSummary({ weeks: [fact({ studiedDays: 0, measuredSec: 0 })] })
    expect(screen.getByTestId('measured-time')).toHaveTextContent('0분')
  })

  it('범위가 과거 한 주면 그 주를 날짜로 밝힌다', () => {
    renderSummary({ weeks: [fact({ week: '2026-08-17' })] }, '2026-08-17', '2026-08-17')
    expect(screen.getByText(/지난 주\(8\/17\)/)).toBeInTheDocument()
  })

  it('여러 주면 헤더에 합계를, 아래에 주별 한 줄을 놓는다 (R11)', () => {
    renderSummary(
      {
        weeks: [
          fact({ week: '2026-08-10', studiedDays: 2, measuredSec: 5400 }),
          fact({ week: '2026-08-17', studiedDays: 4, measuredSec: 9000 })
        ]
      },
      '2026-08-10',
      '2026-08-17'
    )
    // 합산은 초 단계에서 끝난다 — 5400 + 9000 = 14400 (ADR-031 §2)
    expect(screen.getByText(/8\/10 – 8\/17 — 집중/)).toBeInTheDocument()
    const rows = screen.getAllByTestId('summary-week-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('8/10 · 2일 공부, 1시간 30분')
  })

  it('달성률 %를 주요 지표로 띄우지 않는다', () => {
    const { container } = renderSummary()
    expect(container.textContent).not.toMatch(/%/)
  })

  it('시간 표기는 앱 전체 한 벌을 따른다 — 60분 이상은 시간으로 접는다 (§0.1)', () => {
    renderSummary({ weeks: [fact({ measuredSec: 5400 })] })
    expect(screen.getByTestId('measured-time')).toHaveTextContent('1시간 30분')
  })
})

describe('SummarySection — 공백과 빈 기록 (R31 · A25)', () => {
  it('공백 주를 판단 없이 사실로만 적는다', () => {
    renderSummary(
      { idleWeekCount: 2, lastStudiedWeek: '2026-07-27', lastStudiedMeasuredSec: 30000 },
      '2026-08-03',
      '2026-08-17'
    )
    expect(screen.getByText(/2주 쉬었어요/)).toBeInTheDocument()
    expect(screen.getByText(/마지막으로 공부한 주\(7\/27\)/)).toBeInTheDocument()
    expect(screen.getAllByTestId('measured-time').at(-1)).toHaveTextContent('8시간 20분')
  })

  it('공부한 적이 없으면 마지막 공부 주 문장을 렌더하지 않는다', () => {
    renderSummary({ idleWeekCount: 1, lastStudiedWeek: null, lastStudiedMeasuredSec: null })
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
      lastStudiedMeasuredSec: 30000
    })
    for (const word of ['미달성', '밀린', '숙제', '지연', '실패', '아쉽']) {
      expect(container.textContent).not.toContain(word)
    }
  })

  it('--danger 를 쓰지 않는다', () => {
    const { container } = renderSummary({ weeks: [fact({ measuredSec: 360000 })] })
    expect(container.innerHTML).not.toMatch(/danger/)
  })
})
