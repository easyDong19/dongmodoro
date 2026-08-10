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
