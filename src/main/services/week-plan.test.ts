// `ensureWeeks` 를 아직 import 하지 않는다 — 이 파일의 Task 2 분량은 세션을 넣지 않으므로
// 쓰이지 않고, `no-unused-vars` 가 error 라 lint 가 깨진다. Task 3 에서 넓힌다.
import { describe, expect, it } from 'vitest'
import { testUow } from '../db/repositories/test-helpers'
import { confirmWeekPlan, otherRowSpent, remainingPomos } from './week-plan'

const WEEK = '2026-08-03'

describe('otherRowSpent (ADR-027 §1)', () => {
  it('총 소진에서 보이는 항목 소진 합을 뺀 값이다', () => {
    expect(otherRowSpent(18, [{ spentPomos: 10 }])).toBe(8)
  })

  it('보이는 항목이 없으면 총 소진 전부가 기타 행이다', () => {
    expect(otherRowSpent(4, [])).toBe(4)
  })
})

describe('remainingPomos (R9·A12)', () => {
  it('남은 몫은 est − 소진이다', () => {
    expect(remainingPomos(5, 2)).toBe(3)
  })

  it('소진이 est 를 넘어도 음수가 아니라 0 이다', () => {
    expect(remainingPomos(3, 5)).toBe(0)
  })
})

describe('confirmWeekPlan', () => {
  it('planned_at 은 최초 확정만 담고 재확정으로 갱신되지 않는다 (R23·A31)', () => {
    const { uow } = testUow()
    confirmWeekPlan(uow, {
      week: WEEK,
      budget: 20,
      items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
    })
    const first = uow.run((r) => r.weeks.plan(WEEK)!.plannedAt)
    expect(first).not.toBeNull()

    confirmWeekPlan(uow, { week: WEEK, budget: 25, items: [] })
    const second = uow.run((r) => r.weeks.plan(WEEK)!)
    expect(second.plannedAt).toBe(first) // 갱신되지 않았다
    expect(second.budget).toBe(25) // 예산은 갱신됐다
  })

  it('예산을 비운 채 확정하면 budget 이 NULL 로 남는다 (capacity 미설정 경로)', () => {
    const { uow } = testUow()
    confirmWeekPlan(uow, {
      week: WEEK,
      budget: null,
      items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
    })
    expect(uow.run((r) => r.weeks.plan(WEEK)!.budget)).toBeNull()
  })

  it('과적이어도 확정은 성공한다 (R22 — 차단 0건)', () => {
    const { uow } = testUow()
    const result = confirmWeekPlan(uow, {
      week: WEEK,
      budget: 2,
      items: [{ id: null, title: 'A', estPomos: 50, days: [] }]
    })
    expect(result.week).toBe(WEEK)
    expect(uow.run((r) => r.weekItems.listForWeek(WEEK))).toHaveLength(1)
  })
})
