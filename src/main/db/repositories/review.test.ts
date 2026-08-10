import { describe, expect, it } from 'vitest'
import { ensureWeeks, testUow } from './test-helpers'

const W1 = '2026-08-03' // 월요일
const W2 = '2026-08-10'
const W3 = '2026-08-17'

function focusSession(id: string, taskId: string | null, localDate: string, localWeek: string) {
  return {
    id,
    startedAt: '2026-08-04T01:00:00.000Z',
    endedAt: '2026-08-04T01:25:00.000Z',
    durationSec: 1500,
    kind: 'focus' as const,
    taskId,
    localDate,
    localWeek
  }
}

describe('review.earliestRecordedWeek — 워터마크 유실 폴백의 재료 (R28)', () => {
  it('아무 기록도 없으면 null', () => {
    const { uow } = testUow()
    expect(uow.run((repos) => repos.review.earliestRecordedWeek())).toBeNull()
  })

  it('weeks 행만 있어도 기록으로 센다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W2, W3)
    expect(uow.run((repos) => repos.review.earliestRecordedWeek())).toBe(W2)
  })

  it('세션이 더 이르면 세션의 주를 준다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W3)
    uow.run((repos) => {
      repos.sessions.insert(focusSession('s1', null, '2026-08-04', W1))
      expect(repos.review.earliestRecordedWeek()).toBe(W1)
    })
  })

  it('주간 항목의 주도 본다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W3)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      })
      expect(repos.review.earliestRecordedWeek()).toBe(W1)
    })
  })
})

describe('review.weekFacts — 주별 사실 (R9·R11·R32·R33)', () => {
  /**
   * A24. 명시 항목 10 · 시스템 "기타" 항목 6 · 미분류 2 인 주.
   *
   * **차액이 아니면 이 테스트가 깨진다.** `task_id IS NULL` 만 세는 구현은 기타 항목에
   * 붙은 6 을 어느 숫자에도 넣지 못해 사용자가 18 대신 12 를 보게 된다 (ADR-012 §4).
   */
  it('항목별 소진 합 + 계획에 없던 집중 = 그 주 소진 (R33)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: '논문', estPomos: 12, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't-plan', weekItemId: itemId, title: '조각' })

      const systemId = repos.weekItems.ensureSystemItem(W1)
      repos.tasks.create({ id: 't-other', weekItemId: systemId, title: '사후 캡처' })

      for (let i = 0; i < 10; i++) {
        repos.sessions.insert(focusSession(`p${i}`, 't-plan', '2026-08-04', W1))
      }
      for (let i = 0; i < 6; i++) {
        repos.sessions.insert(focusSession(`o${i}`, 't-other', '2026-08-05', W1))
      }
      for (let i = 0; i < 2; i++) {
        repos.sessions.insert(focusSession(`n${i}`, null, '2026-08-06', W1))
      }

      const [fact] = repos.review.weekFacts(W1, W1)
      expect(fact.spentPomos).toBe(18)
      expect(fact.unplannedPomos).toBe(8) // 6 + 2 — 둘이 하나로 합쳐 나온다
      expect(fact.studiedDays).toBe(3)
    })
  })

  /**
   * ADR-027 §1 의 정의역. 폐기 항목은 화면 목록에 나타나지 않으므로 Σ 에서 빠지고,
   * 그 소진은 "계획에 없던 집중"으로 흡수된다 — 빼지 않으면 그 뽀모가 증발한다.
   */
  it('폐기 항목의 소진은 Σ 에서 빠져 계획에 없던 집중으로 흡수된다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: '접은 것', estPomos: 3, days: [] }]
      })
      repos.tasks.create({ id: 't1', weekItemId: createdIds[0], title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', W1))
      repos.weekItems.drop(createdIds[0])

      const [fact] = repos.review.weekFacts(W1, W1)
      expect(fact.spentPomos).toBe(1)
      expect(fact.unplannedPomos).toBe(1)
    })
  })

  it('세션도 항목도 없는 주는 행을 만들지 않는다 — 공백 주는 세기만 한다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2, W3)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      })
      repos.sessions.insert(focusSession('s1', null, '2026-08-18', W3))

      expect(repos.review.weekFacts(W1, W3).map((f) => f.week)).toEqual([W1, W3])
    })
  })

  it('예산이 없는 주는 budget: null 이다 — 0 으로 만들지 않는다 (ADR-018 §1)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      })
      repos.weekItems.confirmPlan({
        week: W2,
        items: [{ id: null, title: 'B', estPomos: 1, days: [] }]
      })
      repos.weeks.setPlan(W2, 0) // "예산 0 으로 하겠다" 는 별개의 사실이다

      const byWeek = new Map(repos.review.weekFacts(W1, W2).map((f) => [f.week, f.budget]))
      expect(byWeek.get(W1)).toBeNull()
      expect(byWeek.get(W2)).toBe(0)
    })
  })

  it('항목 소진은 그 항목의 주에 기록된 세션만 센다 (ADR-012 §1)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: 'A', estPomos: 5, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', W1))
      // 같은 조각인데 주 경계를 넘겨 다음 주에 기록된 세션
      repos.sessions.insert(focusSession('s2', 't1', '2026-08-11', W2))

      const byWeek = new Map(repos.review.weekFacts(W1, W2).map((f) => [f.week, f]))
      // W2 에는 그 항목이 없으므로 s2 는 W2 의 "계획에 없던 집중" 이 된다
      expect(byWeek.get(W1)?.unplannedPomos).toBe(0)
      expect(byWeek.get(W2)?.spentPomos).toBe(1)
      expect(byWeek.get(W2)?.unplannedPomos).toBe(1)
    })
  })
})

describe('review.lastStudied — 범위 밖도 본다 (R31·A25)', () => {
  it('아무 세션도 없으면 null', () => {
    const { uow } = testUow()
    expect(uow.run((repos) => repos.review.lastStudied())).toBeNull()
  })

  it('focus 세션이 있는 가장 최근 주와 그 소진을 준다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2)
    uow.run((repos) => {
      repos.sessions.insert(focusSession('a1', null, '2026-08-04', W1))
      repos.sessions.insert(focusSession('b1', null, '2026-08-11', W2))
      repos.sessions.insert(focusSession('b2', null, '2026-08-12', W2))

      expect(repos.review.lastStudied()).toEqual({ week: W2, spentPomos: 2 })
    })
  })

  it('focus 가 아닌 세션만 있는 주는 세지 않는다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2)
    uow.run((repos) => {
      repos.sessions.insert(focusSession('a1', null, '2026-08-04', W1))
      repos.sessions.insert({ ...focusSession('b1', null, '2026-08-11', W2), kind: 'short' })

      expect(repos.review.lastStudied()).toEqual({ week: W1, spentPomos: 1 })
    })
  })
})

describe('review.listPending · listCompleted — 3택 대상과 끝낸 것들', () => {
  it('완료 항목은 끝낸 것들로, 미완료는 3택으로 갈린다 (A12)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: W1,
        items: [
          { id: null, title: '끝낸 것', estPomos: 2, days: [] },
          { id: null, title: '남은 것', estPomos: 5, days: [] }
        ]
      })
      repos.weekItems.complete(createdIds[0], '2026-08-06T00:00:00.000Z')

      expect(repos.review.listCompleted(W1, W1).map((r) => r.title)).toEqual(['끝낸 것'])
      expect(repos.review.listPending(W1, W1).map((r) => r.title)).toEqual(['남은 것'])
    })
  })

  it('완료 시각이 범위 밖이어도 항목의 주가 범위 안이면 끝낸 것들에 있다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: '늦게 끝낸 것', estPomos: 1, days: [] }]
      })
      // 정산 범위(W1)보다 두 주 뒤에 완료 처리했다
      repos.weekItems.complete(createdIds[0], '2026-08-19T00:00:00.000Z')

      expect(repos.review.listCompleted(W1, W1)).toHaveLength(1)
    })
  })

  it('시스템 기타·폐기·삭제 항목은 어느 목록에도 없다 (R16)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    uow.run((repos) => {
      repos.weekItems.ensureSystemItem(W1)
      const { createdIds } = repos.weekItems.confirmPlan({
        week: W1,
        items: [
          { id: null, title: '폐기', estPomos: 1, days: [] },
          { id: null, title: '남을 것', estPomos: 1, days: [] }
        ]
      })
      repos.weekItems.drop(createdIds[0])

      expect(repos.review.listPending(W1, W1).map((r) => r.title)).toEqual(['남을 것'])
      expect(repos.review.listCompleted(W1, W1)).toEqual([])
    })
  })

  it('소진은 그 항목의 주 조건으로 센다 — 주를 넘긴 세션은 빠진다 (ADR-012 §1)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: 'A', estPomos: 5, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', W1))
      repos.sessions.insert(focusSession('s2', 't1', '2026-08-05', W1))
      repos.sessions.insert(focusSession('s3', 't1', '2026-08-11', W2))

      expect(repos.review.listPending(W1, W1)[0].spentPomos).toBe(2)
    })
  })

  it('주·생성순으로만 정렬한다 — 이월 주수 정렬은 화면 몫이다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W2,
        items: [{ id: null, title: '나중 주', estPomos: 1, days: [] }]
      })
      repos.weekItems.confirmPlan({
        week: W1,
        items: [
          { id: null, title: '먼저', estPomos: 1, days: [] },
          { id: null, title: '나중', estPomos: 1, days: [] }
        ]
      })

      expect(repos.review.listPending(W1, W2).map((r) => r.title)).toEqual([
        '먼저',
        '나중',
        '나중 주'
      ])
    })
  })

  it('origin_week 와 milestone_id 를 실어 보낸다 — 배지와 승계의 재료다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W1,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      })
      const [row] = repos.review.listPending(W1, W1)
      expect(row.originWeek).toBe(W1)
      expect(row.milestoneId).toBeNull()
    })
  })
})

describe('review.countPending — 3택 대상 건수', () => {
  it('빈 범위면 0', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    expect(uow.run((repos) => repos.review.countPending(W1, W1))).toBe(0)
  })

  it('범위 안의 미완료 항목만 센다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1, W2, W3)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: W1,
        items: [
          { id: null, title: 'A', estPomos: 1, days: [] },
          { id: null, title: 'B', estPomos: 1, days: [] }
        ]
      })
      repos.weekItems.confirmPlan({
        week: W2,
        items: [{ id: null, title: 'C', estPomos: 1, days: [] }]
      })
      repos.weekItems.confirmPlan({
        week: W3,
        items: [{ id: null, title: '범위 밖', estPomos: 1, days: [] }]
      })

      expect(repos.review.countPending(W1, W2)).toBe(3)
      expect(repos.review.countPending(W1, W1)).toBe(2)
    })
  })

  it('완료·폐기·삭제된 항목과 시스템 기타 항목은 세지 않는다 (R16·R17)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, W1)
    uow.run((repos) => {
      repos.weekItems.ensureSystemItem(W1)
      const { createdIds } = repos.weekItems.confirmPlan({
        week: W1,
        items: [
          { id: null, title: '완료할 것', estPomos: 1, days: [] },
          { id: null, title: '폐기할 것', estPomos: 1, days: [] },
          { id: null, title: '남을 것', estPomos: 1, days: [] }
        ]
      })
      repos.weekItems.complete(createdIds[0], '2026-08-05T00:00:00.000Z')
      repos.weekItems.drop(createdIds[1])

      expect(repos.review.countPending(W1, W1)).toBe(1)
    })
  })
})
