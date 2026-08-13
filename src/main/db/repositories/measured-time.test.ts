import { describe, expect, it } from 'vitest'
import { recordSession } from '../../services/sessions'
import { otherRowMeasuredSec, weekSummary } from '../../services/week-plan'
import { ensureWeeks, testUow } from './test-helpers'

/**
 * 측정 시간 파생 조회 (ADR-031 §2·§3). 합산 대상은 **완료 focus 세션뿐**이고, 차액은
 * **초 단계에서** 계산된다.
 */

const WEEK = '2026-08-03' // 월요일
const NEXT = '2026-08-10'

function focusSession(
  id: string,
  taskId: string | null,
  durationSec: number,
  localDate = '2026-08-04',
  localWeek = WEEK
) {
  return {
    id,
    startedAt: '2026-08-04T01:00:00.000Z',
    endedAt: '2026-08-04T01:25:00.000Z',
    durationSec,
    kind: 'focus' as const,
    taskId,
    localDate,
    localWeek
  }
}

describe('측정 시간 합산 — 정의역 (ADR-031 §3)', () => {
  it('휴식 세션은 산입하지 않는다 — 개수에도 초에도', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 2, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })

      repos.sessions.insert(focusSession('s1', 't1', 1500))
      repos.sessions.insert({ ...focusSession('s2', 't1', 300), kind: 'short' })
      repos.sessions.insert({ ...focusSession('s3', 't1', 900), kind: 'long' })

      expect(repos.weekItems.listForWeek(WEEK)[0].measuredSec).toBe(1500)
      expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(1500)
      expect(repos.weekItems.childTasks(itemId, '2026-08-04')[0].measuredSec).toBe(1500)
    })
  })

  it('완료되지 않은 세션은 행 자체가 없으므로 산입되지 않는다 (ADR-031 §3)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)

    // 진행 중·중단된 세션은 `recordSession` 을 거치지 않는다 — 그것이 유일한 INSERT
    // 경로이므로 완료 전까지 어떤 조회에도 나타날 수 없다. 계약에 `runningSec` 를
    // 얹지 않기로 한 결정이 이 성질 위에 서 있다.
    uow.run((repos) => expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(0))

    recordSession(uow, {
      kind: 'focus',
      startedAtMs: Date.parse('2026-08-04T10:00:00+09:00'),
      endedAtMs: Date.parse('2026-08-04T10:20:00+09:00'),
      durationSec: 1200,
      taskId: null
    })

    uow.run((repos) => expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(1200))
  })

  it('항목 측정 시간은 그 항목의 주에 기록된 세션만 센다 (ADR-012 §1)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK, NEXT)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 2, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', 1500))
      repos.sessions.insert(focusSession('s2', 't1', 900, '2026-08-10', NEXT))

      expect(repos.weekItems.listForWeek(WEEK)[0].measuredSec).toBe(1500)
      expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(1500)
      expect(repos.weekItems.weekTotalMeasuredSec(NEXT)).toBe(900)
      // 조각 단위에는 주 조건이 없다 (today-tasks R3-3) — 두 주의 합이다.
      expect(repos.weekItems.childTasks(itemId, '2026-08-04')[0].measuredSec).toBe(2400)
    })
  })
})

describe('기타 행 차액 — 초 단계 계산 (ADR-031 §2)', () => {
  it('폐기된 항목의 시간이 차액으로 흘러든다 (ADR-027 A24 의 시간판)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '남길 항목', estPomos: 2, days: [] },
          { id: null, title: '보낼 항목', estPomos: 3, days: [] }
        ]
      })
      repos.tasks.create({ id: 'keep', weekItemId: createdIds[0], title: 'a' })
      repos.tasks.create({ id: 'gone', weekItemId: createdIds[1], title: 'b' })
      repos.sessions.insert(focusSession('s1', 'keep', 1500))
      repos.sessions.insert(focusSession('s2', 'gone', 1500))
      repos.sessions.insert(focusSession('s3', 'gone', 600))

      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '남길 항목', estPomos: 2, days: [] }]
      })

      const visible = repos.weekItems.listForWeek(WEEK)
      const total = repos.weekItems.weekTotalMeasuredSec(WEEK)
      expect(total).toBe(3600) // 폐기가 주 총합을 줄이지 않는다 (ADR-027 §2)
      expect(visible[0].measuredSec).toBe(1500)
      expect(otherRowMeasuredSec(total, visible)).toBe(2100) // 보낸 항목의 35분이 여기 있다
    })
  })

  it('차액은 초에서 계산된다 — 분으로 접고 빼면 없던 1분이 생기는 배치에서 검증', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: 'A', estPomos: 1, days: [] },
          { id: null, title: 'B', estPomos: 1, days: [] },
          { id: null, title: 'C', estPomos: 1, days: [] }
        ]
      })
      createdIds.forEach((itemId, i) => {
        repos.tasks.create({ id: `t${i}`, weekItemId: itemId, title: `조각${i}` })
        // 90초씩 3개. 초에서는 총합 270 = Σ270 이라 차액이 정확히 0 이다.
        // 분으로 접고 빼는 구현이라면 총합 `4분` − Σ(`1분`×3) = `1분` 이 되어, 있지도
        // 않은 집중 1분이 기타 행에 생긴다 (ADR-031 §2 Context 2).
        repos.sessions.insert(focusSession(`s${i}`, `t${i}`, 90))
      })
    })

    const result = weekSummary(uow, WEEK)
    expect(result.totalMeasuredSec).toBe(270)
    expect(result.items.map((i) => i.measuredSec)).toEqual([90, 90, 90])
    expect(result.otherRow.measuredSec).toBe(0) // 초에서 참인 항등식
  })

  it('미분류 집중은 항목 합에 없고 차액으로만 나타난다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      })
      repos.sessions.insert(focusSession('s1', null, 1500))
    })

    const result = weekSummary(uow, WEEK)
    expect(result.totalMeasuredSec).toBe(1500)
    expect(result.otherRow.measuredSec).toBe(1500)
    expect(result.otherRow.visible).toBe(true)
  })
})

describe('이월 재부모화와 귀속 (ADR-012 §3)', () => {
  it('재부모화해도 과거 주의 측정 시간은 소급 이동하지 않는다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK, NEXT)

    const { sourceId, newItemId } = uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '논문 3장', estPomos: 3, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '3장 1절' })
      repos.sessions.insert(focusSession('s1', 't1', 1500))

      const { carried } = repos.review.applySettlement({
        targetWeek: NEXT,
        drops: [],
        carries: [{ sourceId: itemId }],
        at: '2026-08-10T00:00:00.000Z'
      })
      return { sourceId: itemId, newItemId: carried[0].newItemId }
    })

    uow.run((repos) => {
      // 지난 주 항목은 폐기되지 않았지만 조각이 옮겨 갔다. 세션의 주는 불변이므로
      // 지난 주의 총합은 그대로다 (ADR-027 §2).
      expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(1500)
      expect(repos.weekItems.weekTotalMeasuredSec(NEXT)).toBe(0)
      // 새 항목의 측정 시간은 0 이다 — 이월분은 아직 하지 않은 일이다 (ADR-031 §1).
      expect(repos.weekItems.listForWeek(NEXT)[0].measuredSec).toBe(0)
      // 조각 단위에는 주 조건이 없으므로 그 이력은 새 부모 아래에서도 살아 있다.
      expect(repos.weekItems.childTasks(newItemId, '2026-08-10')[0].measuredSec).toBe(1500)
      expect(repos.weekItems.header(sourceId)?.week).toBe(WEEK)
    })

    // 지난 주 항목은 조각을 잃었으므로 그 주의 항목 합이 0 이 되고, 25분은 차액으로
    // 옮겨 간다 — 시간이 화면에서 증발하지 않는다.
    const past = weekSummary(uow, WEEK)
    expect(past.items[0].measuredSec).toBe(0)
    expect(past.otherRow.measuredSec).toBe(1500)
    expect(past.otherRow.visible).toBe(true)
  })
})

describe('마일스톤 롤업 — 측정 시간 (milestones R17)', () => {
  it('연결된 할당들의 측정 시간을 그 주 기준으로 합한다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      repos.milestones.create({ id: 'm1', month: '2026-08', title: '논문', sortOrder: 0 })
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '3장', estPomos: 2, days: [] },
          { id: null, title: '4장', estPomos: 2, days: [] }
        ]
      })
      repos.milestones.setWeekItemMilestone(createdIds[0], 'm1')
      repos.milestones.setWeekItemMilestone(createdIds[1], 'm1')
      repos.tasks.create({ id: 't1', weekItemId: createdIds[0], title: 'a' })
      repos.tasks.create({ id: 't2', weekItemId: createdIds[1], title: 'b' })
      repos.sessions.insert(focusSession('s1', 't1', 1500))
      repos.sessions.insert(focusSession('s2', 't2', 900))
      repos.sessions.insert({ ...focusSession('s3', 't2', 300), kind: 'short' })

      const rollup = repos.milestones.rollup('2026-08', WEEK)
      expect(rollup).toHaveLength(1)
      expect(rollup[0].measuredSec).toBe(2400) // 휴식 300초는 빠진다
      expect(rollup[0].spentPomos).toBe(2)
    })
  })

  it('폐기된 할당은 롤업에서 빠진다 — 주간 카드에서 사라진 시간이 롤업에만 남지 않는다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      repos.milestones.create({ id: 'm1', month: '2026-08', title: '논문', sortOrder: 0 })
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '3장', estPomos: 2, days: [] }]
      }).createdIds[0]
      repos.milestones.setWeekItemMilestone(itemId, 'm1')
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: 'a' })
      repos.sessions.insert(focusSession('s1', 't1', 1500))
      repos.weekItems.drop(itemId)

      expect(repos.milestones.rollup('2026-08', WEEK)).toHaveLength(0)
      // 그 시간은 주간 카드의 차액에 남는다.
      expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(1500)
    })
  })
})
