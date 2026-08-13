import { describe, expect, it } from 'vitest'
import { otherRowMeasuredSec } from '../../services/week-plan'
import { testUow } from './test-helpers'

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

describe('weekItems.listForWeek — 측정 시간 집계 (R8)', () => {
  it('항목 측정 시간은 그 항목의 주에 기록된 focus 세션만 합한다 (A10)', () => {
    const { uow } = testUow()

    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '논문 3장', days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '3장 1절' })

      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      // 같은 task 인데 주 경계를 넘겨 다음 주로 기록된 세션
      repos.sessions.insert(focusSession('s2', 't1', '2026-08-10', NEXT))

      const rows = repos.weekItems.listForWeek(WEEK)
      expect(rows).toHaveLength(1)
      expect(rows[0].measuredSec).toBe(1500) // s2 는 이 주 집중이 아니다
      // 주 총합에는 각자의 주에서 정확히 한 번씩 들어간다
      expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(1500)
      expect(repos.weekItems.weekTotalMeasuredSec(NEXT)).toBe(1500)
    })
  })

  it('focus 가 아닌 세션은 합하지 않는다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })
      repos.sessions.insert({ ...focusSession('s1', 't1', '2026-08-04', WEEK), kind: 'short' })
      expect(repos.weekItems.listForWeek(WEEK)[0].measuredSec).toBe(0)
    })
  })

  it('폐기·시스템 항목은 목록에서 빠지고 생성순으로 정렬된다 (R10·R18)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.weekItems.ensureSystemItem(WEEK)
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '먼저', days: [] },
          { id: null, title: '나중', days: [] }
        ]
      })
      // 정렬은 결과가 2개 이상일 때만 검증된다. 폐기 테스트와 정렬 테스트를 한 케이스에
      // 몰면 최종 배열이 1개라 정렬을 전혀 보지 못한다.
      expect(repos.weekItems.listForWeek(WEEK).map((r) => r.title)).toEqual(['먼저', '나중'])

      // 이제 '먼저'만 남기고 재확정 → '나중'이 폐기되고 시스템 항목도 계속 빠진다
      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '먼저', days: [] }]
      })
      expect(repos.weekItems.listForWeek(WEEK).map((r) => r.title)).toEqual(['먼저'])
    })
  })

  it('자식 조각 완료/전체 수를 함께 돌려준다 (완료 제안의 재료)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
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
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
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
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '원래 제목', days: [0] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })

      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id, title: '고친 제목', days: [1, 3] }]
      })

      const row = repos.weekItems.listForWeek(WEEK)[0]
      expect(row.id).toBe(id) // 새 행이 만들어지지 않았다
      expect(row.title).toBe('고친 제목')
      expect(row.days).toEqual([1, 3])
      expect(row.childTotal).toBe(1) // 자식 조각이 살아 있다
      expect(row.originWeek).toBe(WEEK)
    })
  })

  it('목록에서 빠진 기존 항목은 폐기되고 자식·세션이 전부 남는다 (R24·A32)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '보낼 항목', days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      for (let i = 0; i < 9; i++) {
        repos.sessions.insert(focusSession(`s${i}`, 't1', '2026-08-04', WEEK))
      }

      const { droppedIds } = repos.weekItems.confirmPlan({ week: WEEK, items: [] })

      expect(droppedIds).toEqual([id])
      expect(repos.weekItems.listForWeek(WEEK)).toHaveLength(0) // 목록에서 사라졌다
      expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(13500) // 주 총합은 줄지 않았다
      expect(repos.tasks.get('t1')).not.toBeNull() // 조각은 남았다
    })
  })

  it('폐기 항목의 집중이 기타 행 차액으로 나타난다 (A24 · ADR-027 §1)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '남길 항목', days: [] },
          { id: null, title: '보낼 항목', days: [] }
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
        items: [{ id: createdIds[0], title: '남길 항목', days: [] }]
      })

      const visible = repos.weekItems.listForWeek(WEEK)
      const total = repos.weekItems.weekTotalMeasuredSec(WEEK)
      expect(total).toBe(6000)
      expect(visible[0].measuredSec).toBe(1500)
      // 보낸 항목의 75분이 여기 있다
      expect(otherRowMeasuredSec(total, visible)).toBe(4500)
    })
  })

  it('다른 주 항목 id 를 보내면 거부한다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: NEXT,
        items: [{ id: null, title: '다음 주 것', days: [] }]
      }).createdIds[0]
      expect(() =>
        repos.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id, title: '훔치기', days: [] }]
        })
      ).toThrow()
    })
  })
})

describe('weekItems.hasUnplannedActivity — 기타 행 표시 조건 ①② (ADR-027 §3)', () => {
  it('집중 0 이어도 부모 없는 조각이 있으면 true (A23)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const sysId = repos.weekItems.ensureSystemItem(WEEK)
      repos.tasks.create({ id: 't1', weekItemId: sysId, title: '직접 추가' })
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
      expect(repos.weekItems.weekTotalMeasuredSec(WEEK)).toBe(0)
    })
  })

  it('미분류 세션(task 미연결)만 있어도 true', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(focusSession('s1', null, '2026-08-04', WEEK))
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
    })
  })

  it('폐기 항목의 집중만 있는 주는 이 술어로 false 다 — 세 번째 갈래가 필요한 이유', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      repos.weekItems.confirmPlan({ week: WEEK, items: [] })

      // 미분류 세션도 부모 없는 조각도 없다 → 이 술어만으로는 행이 숨겨진다.
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(false)
      // 세 번째 갈래가 이것을 살린다: 목록으로 설명되지 않는 집중이 있다.
      expect(repos.weekItems.hasHiddenFocus(WEEK)).toBe(true)
      expect(otherRowMeasuredSec(1500, repos.weekItems.listForWeek(WEEK))).toBe(1500)
    })
  })

  it('세션도 조각도 없는 주는 false', () => {
    const { uow } = testUow()
    uow.run((repos) => expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(false))
  })
})

/**
 * 세 번째 갈래는 **크기가 아니라 존재**를 본다 (ux-spec §3.4). `duration_sec = 0` 인
 * 세션은 시작 직후 `완료 처리` 가 만드는 정상 경로이고, 그런 세션만 붙은 항목을 폐기하면
 * 차액이 0 초다 — 차액 크기로 판정하면 그 집중이 화면에서 증발한다 (A24).
 */
describe('weekItems.hasHiddenFocus — 기타 행 표시 조건 ③', () => {
  it('목록에 보이는 항목의 집중만 있으면 false', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      expect(repos.weekItems.hasHiddenFocus(WEEK)).toBe(false)
    })
  })

  it('0초 세션만 붙은 항목을 폐기해도 true — 차액은 0 인데 집중은 실재한다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      repos.sessions.insert({ ...focusSession('s1', 't1', '2026-08-04', WEEK), durationSec: 0 })
      repos.weekItems.confirmPlan({ week: WEEK, items: [] })

      expect(repos.weekItems.hasHiddenFocus(WEEK)).toBe(true)
      expect(otherRowMeasuredSec(0, repos.weekItems.listForWeek(WEEK))).toBe(0)
    })
  })

  it('휴식 세션은 잡지 않는다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert({ ...focusSession('s1', null, '2026-08-04', WEEK), kind: 'short' })
      expect(repos.weekItems.hasHiddenFocus(WEEK)).toBe(false)
    })
  })
})

describe('weekItems.nextPullable — 원클릭 pull 대상', () => {
  it('유자격 = 미완료·미삭제·오늘 pull 없음, 생성순 첫 번째', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
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
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
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
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각1' })
      repos.tasks.create({ id: 't2', weekItemId: id, title: '조각2' })
      repos.today.pull('t2', '2026-08-04')
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))

      expect(repos.weekItems.childTasks(id, '2026-08-04')).toEqual([
        {
          taskId: 't1',
          title: '조각1',
          measuredSec: 1500,
          completedAt: null,
          inToday: false
        },
        {
          taskId: 't2',
          title: '조각2',
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
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', days: [] }]
      }).createdIds[0]
      repos.weekItems.confirmPlan({ week: WEEK, items: [] })
      expect(repos.weekItems.header(id)).toEqual({ week: WEEK, completedAt: null })
    })
  })
})
