import { describe, expect, it } from 'vitest'
import { otherRowSpent } from '../../services/week-plan'
import { ensureWeeks, testUow } from './test-helpers'

const WEEK = '2026-08-03' // 월요일
const NEXT = '2026-08-10' // 그 다음 월요일

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

describe('weekItems.listForWeek — 소진 집계 (R8)', () => {
  it('항목 소진은 그 항목의 주에 기록된 focus 세션만 센다 (A10)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK, NEXT) // 두 주 모두 — sessions.local_week FK

    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '논문 3장', estPomos: 5, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '3장 1절' })

      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      // 같은 task 인데 주 경계를 넘겨 다음 주로 기록된 세션
      repos.sessions.insert(focusSession('s2', 't1', '2026-08-10', NEXT))

      const rows = repos.weekItems.listForWeek(WEEK)
      expect(rows).toHaveLength(1)
      expect(rows[0].spentPomos).toBe(1) // s2 는 이 주 소진이 아니다
      // 총 소진에는 각자의 주에서 정확히 한 번씩 세어진다
      expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(1)
      expect(repos.weekItems.weekTotalSpent(NEXT)).toBe(1)
    })
  })

  it('focus 가 아닌 세션은 세지 않는다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 2, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })
      repos.sessions.insert({ ...focusSession('s1', 't1', '2026-08-04', WEEK), kind: 'short' })
      expect(repos.weekItems.listForWeek(WEEK)[0].spentPomos).toBe(0)
    })
  })

  it('폐기·시스템 항목은 목록에서 빠지고 생성순으로 정렬된다 (R10·R18)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      repos.weekItems.ensureSystemItem(WEEK)
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '먼저', estPomos: 1, days: [] },
          { id: null, title: '나중', estPomos: 1, days: [] }
        ]
      })
      // 정렬은 결과가 2개 이상일 때만 검증된다. 폐기 테스트와 정렬 테스트를 한 케이스에
      // 몰면 최종 배열이 1개라 정렬을 전혀 보지 못한다.
      expect(repos.weekItems.listForWeek(WEEK).map((r) => r.title)).toEqual(['먼저', '나중'])

      // 이제 '먼저'만 남기고 재확정 → '나중'이 폐기되고 시스템 항목도 계속 빠진다
      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '먼저', estPomos: 1, days: [] }]
      })
      expect(repos.weekItems.listForWeek(WEEK).map((r) => r.title)).toEqual(['먼저'])
    })
  })

  it('자식 조각 완료/전체 수를 함께 돌려준다 (완료 제안의 재료)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각1' })
      repos.tasks.create({ id: 't2', weekItemId: itemId, title: '조각2' })
      repos.tasks.toggleComplete('t1')

      const row = repos.weekItems.listForWeek(WEEK)[0]
      expect(row.childTotal).toBe(2)
      expect(row.childDone).toBe(1)
    })
  })

  it('자식이 0개면 childTotal·childDone 이 0 이다 (SUM 의 NULL 폴백)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      })
      const row = repos.weekItems.listForWeek(WEEK)[0]
      expect(row.childTotal).toBe(0)
      expect(row.childDone).toBe(0)
    })
  })
})

describe('weekItems.confirmPlan — 선언형 확정', () => {
  it('id 가 있으면 ID 로 매칭해 갱신하고 자식·origin_week 를 유지한다 (R23·A30)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '원래 제목', estPomos: 3, days: [0] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })

      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id, title: '고친 제목', estPomos: 5, days: [1, 3] }]
      })

      const row = repos.weekItems.listForWeek(WEEK)[0]
      expect(row.id).toBe(id) // 새 행이 만들어지지 않았다
      expect(row.title).toBe('고친 제목')
      expect(row.estPomos).toBe(5)
      expect(row.days).toEqual([1, 3])
      expect(row.childTotal).toBe(1) // 자식 조각이 살아 있다
      expect(row.originWeek).toBe(WEEK)
    })
  })

  it('목록에서 빠진 기존 항목은 폐기되고 자식·세션이 전부 남는다 (R24·A32)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '보낼 항목', estPomos: 9, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      for (let i = 0; i < 9; i++) {
        repos.sessions.insert(focusSession(`s${i}`, 't1', '2026-08-04', WEEK))
      }

      const { droppedIds } = repos.weekItems.confirmPlan({ week: WEEK, items: [] })

      expect(droppedIds).toEqual([id])
      expect(repos.weekItems.listForWeek(WEEK)).toHaveLength(0) // 목록에서 사라졌다
      expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(9) // 총 소진은 줄지 않았다
      expect(repos.tasks.get('t1')).not.toBeNull() // 조각은 남았다
    })
  })

  it('폐기 항목의 소진이 기타 행 차액으로 나타난다 (A24 · ADR-027 §1)', () => {
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
      repos.sessions.insert(focusSession('s1', 'keep', '2026-08-04', WEEK))
      repos.sessions.insert(focusSession('s2', 'gone', '2026-08-04', WEEK))
      repos.sessions.insert(focusSession('s3', 'gone', '2026-08-04', WEEK))
      repos.sessions.insert(focusSession('s4', 'gone', '2026-08-04', WEEK))

      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '남길 항목', estPomos: 2, days: [] }]
      })

      const visible = repos.weekItems.listForWeek(WEEK)
      const total = repos.weekItems.weekTotalSpent(WEEK)
      expect(total).toBe(4)
      expect(visible[0].spentPomos).toBe(1)
      expect(otherRowSpent(total, visible)).toBe(3) // 보낸 항목의 3뽀모가 여기 있다
    })
  })

  it('다른 주 항목 id 를 보내면 거부한다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK, NEXT)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: NEXT,
        items: [{ id: null, title: '다음 주 것', estPomos: 1, days: [] }]
      }).createdIds[0]
      expect(() =>
        repos.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id, title: '훔치기', estPomos: 1, days: [] }]
        })
      ).toThrow()
    })
  })
})

describe('weekItems.hasUnplannedActivity — 기타 행 표시 조건 ①② (ADR-027 §3)', () => {
  it('소진 0 이어도 부모 없는 조각이 있으면 true (A23)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const sysId = repos.weekItems.ensureSystemItem(WEEK)
      repos.tasks.create({ id: 't1', weekItemId: sysId, title: '직접 추가' })
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
      expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(0)
    })
  })

  it('미분류 세션(task 미연결)만 있어도 true', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK) // 세션 FK
    uow.run((repos) => {
      repos.sessions.insert(focusSession('s1', null, '2026-08-04', WEEK))
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
    })
  })

  it('폐기 항목의 소진만 있는 주는 이 술어로 false 다 — 세 번째 갈래가 필요한 이유', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      repos.weekItems.confirmPlan({ week: WEEK, items: [] })

      // 미분류 세션도 부모 없는 조각도 없다 → 이 술어만으로는 행이 숨겨진다.
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(false)
      // 그런데 차액은 1 이다. Task 4 의 weekSummary 가 세 번째 갈래로 이것을 살린다.
      expect(otherRowSpent(1, repos.weekItems.listForWeek(WEEK))).toBe(1)
    })
  })

  it('세션도 조각도 없는 주는 false', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(false))
  })
})

describe('weekItems.nextPullable — 원클릭 pull 대상', () => {
  it('유자격 = 미완료·미삭제·오늘 pull 없음, 생성순 첫 번째', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '첫째' })
      repos.tasks.create({ id: 't2', weekItemId: id, title: '둘째' })

      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBe('t1')
      repos.today.pull('t1', '2026-08-04')
      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBe('t2')
      repos.tasks.toggleComplete('t2')
      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBeNull()
    })
  })

  it('치운 조각은 다시 유자격이다 — removed_at 분기 (today-tasks R14)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      repos.today.pull('t1', '2026-08-04')
      // 그날 focus 세션이 있어야 remove 가 행 삭제가 아니라 removed_at 마킹이 된다.
      // 세션이 없으면 행이 지워져 `taskPulls IS NULL` 분기로 통과해버려,
      // 검증하려던 `removed_at IS NOT NULL` 경로가 한 번도 실행되지 않는다.
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      expect(repos.today.remove('t1', '2026-08-04')).toBe('marked')

      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBe('t1')
    })
  })
})

describe('weekItems.childTasks — 드로어 목록 (§6.2)', () => {
  it('조각별 소진과 오늘 목록 상태를 함께 준다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각1', estPomos: 2 })
      repos.tasks.create({ id: 't2', weekItemId: id, title: '조각2' })
      repos.today.pull('t2', '2026-08-04')
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))

      expect(repos.weekItems.childTasks(id, '2026-08-04')).toEqual([
        {
          taskId: 't1',
          title: '조각1',
          estPomos: 2,
          spentPomos: 1,
          measuredSec: 1500,
          completedAt: null,
          inToday: false
        },
        {
          taskId: 't2',
          title: '조각2',
          estPomos: null,
          spentPomos: 0,
          measuredSec: 0,
          completedAt: null,
          inToday: true
        }
      ])
    })
  })
})

describe('weekItems.header — 드로어 헤더 (폐기 항목도 열린다)', () => {
  it('폐기된 항목의 주·완료 시각을 읽을 수 있다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      }).createdIds[0]
      repos.weekItems.confirmPlan({ week: WEEK, items: [] })
      expect(repos.weekItems.header(id)).toEqual({ week: WEEK, completedAt: null })
    })
  })
})
