import { describe, expect, it } from 'vitest'
import { ensureWeeks, testUow } from '../db/repositories/test-helpers'
import {
  confirmWeekPlan,
  dropItem,
  itemDrawer,
  otherRowSpent,
  planDraft,
  pullFromDrawer,
  pullNextFromItem,
  remainingPomos,
  setItemCompleted,
  weekSummary
} from './week-plan'

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

// 아래 유스케이스들은 `localKeys()` 로 오늘 날짜를 스스로 읽는다. 테스트가 날짜를
// 하드코딩하지 않는 이유다 — 어느 날 돌려도 통과해야 한다.
describe('pullNextFromItem — 원클릭 pull (§3.1·R27)', () => {
  it('생성순 다음 유자격 조각을 하나씩 가져온다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '첫째' })
      r.tasks.create({ id: 't2', weekItemId: id, title: '둘째' })
    })

    expect(pullNextFromItem(uow, id).pulled).toEqual({ taskId: 't1', title: '첫째' })
    expect(pullNextFromItem(uow, id).pulled).toEqual({ taskId: 't2', title: '둘째' })
  })

  it('유자격 조각이 0개면 던지지 않고 pulled: null 을 돌려준다 (드로어 폴백 신호)', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    const result = pullNextFromItem(uow, id)
    expect(result.pulled).toBeNull()
    expect(result.itemWeek).toBe(WEEK) // 화면이 무효화할 주를 알아야 한다
  })

  it('완료된 항목에서는 pull 할 수 없다 (R27) — pullFromDrawer 와 같은 가드다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
    setItemCompleted(uow, id, true)

    expect(() => pullNextFromItem(uow, id)).toThrow()
  })
})

describe('itemDrawer', () => {
  it('폐기된 항목도 열린다 — header 는 listForWeek 밖을 본다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
    dropItem(uow, id)

    const drawer = itemDrawer(uow, id)
    expect(drawer.itemWeek).toBe(WEEK)
    expect(drawer.tasks.map((t) => t.taskId)).toEqual(['t1'])
  })

  it('없는 항목이면 던진다', () => {
    const { uow } = testUow()
    expect(() => itemDrawer(uow, 'nope')).toThrow()
  })
})

describe('dropItem — 폐기는 삭제가 아니다 (ADR-014 §1·ADR-027 §2)', () => {
  it('목록에서 빠지되 그 소진이 주간 총 소진에 남아 기타 행으로 흡수된다 (A24)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK) // 세션 FK
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      r.sessions.insert({
        id: 's1',
        startedAt: '2026-08-04T01:00:00.000Z',
        endedAt: '2026-08-04T01:25:00.000Z',
        durationSec: 1500,
        kind: 'focus',
        taskId: 't1',
        localDate: '2026-08-04',
        localWeek: WEEK
      })
    })

    expect(dropItem(uow, id).itemWeek).toBe(WEEK)
    uow.run((r) => {
      expect(r.weekItems.listForWeek(WEEK)).toHaveLength(0) // 목록에서 빠졌다
      expect(r.weekItems.weekTotalSpent(WEEK)).toBe(1) // 총 소진은 줄지 않는다
      expect(otherRowSpent(1, r.weekItems.listForWeek(WEEK))).toBe(1) // 기타 행이 받는다
      expect(r.weekItems.childTasks(id, '2026-08-04')).toHaveLength(1) // 조각도 남았다
    })
  })
})

describe('setItemCompleted (R25·R27·R28)', () => {
  it('완료 후 세션이 더 붙어도 completed_at 이 변하지 않는다 (A37)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))

    const at = setItemCompleted(uow, id, true).completedAt
    expect(at).not.toBeNull()

    uow.run((r) => {
      for (let i = 0; i < 5; i++) {
        r.sessions.insert({
          id: `s${i}`,
          startedAt: '2026-08-04T01:00:00.000Z',
          endedAt: '2026-08-04T01:25:00.000Z',
          durationSec: 1500,
          kind: 'focus',
          taskId: 't1',
          localDate: '2026-08-04',
          localWeek: WEEK
        })
      }
    })

    const row = uow.run((r) => r.weekItems.listForWeek(WEEK)[0])
    expect(row.spentPomos).toBe(5) // 소진은 계속 오른다
    expect(row.completedAt).toBe(at) // 완료 시각은 그대로다
  })

  it('완료를 해제하면 NULL 로 돌아간다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    setItemCompleted(uow, id, true)
    expect(setItemCompleted(uow, id, false).completedAt).toBeNull()
  })
})

describe('pullFromDrawer — R7·R27 을 서비스에서 강제한다', () => {
  it('완료된 항목에서는 pull 할 수 없다 (R27)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
    setItemCompleted(uow, id, true)

    expect(() => pullFromDrawer(uow, { weekItemId: id, taskIds: ['t1'], newTask: null })).toThrow()
  })

  it('완료된 조각은 pull 하지 않는다 (R7)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      r.tasks.toggleComplete('t1')
    })
    expect(() => pullFromDrawer(uow, { weekItemId: id, taskIds: ['t1'], newTask: null })).toThrow()
  })

  it('다른 항목의 조각을 끼워 넣을 수 없다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const { createdIds } = uow.run((r) =>
      r.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: 'A', estPomos: 1, days: [] },
          { id: null, title: 'B', estPomos: 1, days: [] }
        ]
      })
    )
    uow.run((r) => r.tasks.create({ id: 'tb', weekItemId: createdIds[1], title: 'B 의 조각' }))
    expect(() =>
      pullFromDrawer(uow, { weekItemId: createdIds[0], taskIds: ['tb'], newTask: null })
    ).toThrow()
  })
})

describe('weekSummary — 한 화면 = 한 응답', () => {
  it('등식이 성립한다: Σ(보이는 항목) + 기타 행 = 총 소진 (성공 지표)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 4, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      const s = (sid: string, taskId: string | null) => ({
        id: sid,
        startedAt: '2026-08-04T01:00:00.000Z',
        endedAt: '2026-08-04T01:25:00.000Z',
        durationSec: 1500,
        kind: 'focus' as const,
        taskId,
        localDate: '2026-08-04',
        localWeek: WEEK
      })
      r.sessions.insert(s('s1', 't1'))
      r.sessions.insert(s('s2', null))
      r.sessions.insert(s('s3', null))
    })

    const summary = weekSummary(uow, WEEK)
    expect(summary.totalSpent).toBe(3)
    expect(summary.items).toHaveLength(1)
    expect(summary.otherRow).toEqual({ visible: true, spentPomos: 2 })
    expect(summary.items.reduce((n, i) => n + i.spentPomos, 0) + summary.otherRow.spentPomos).toBe(
      summary.totalSpent
    )
  })

  it('폐기 항목의 소진만 있는 주에도 기타 행이 보인다 (A24 · ADR-027 §3 세 번째 갈래)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      for (let i = 0; i < 3; i++) {
        r.sessions.insert({
          id: `s${i}`,
          startedAt: '2026-08-04T01:00:00.000Z',
          endedAt: '2026-08-04T01:25:00.000Z',
          durationSec: 1500,
          kind: 'focus',
          taskId: 't1',
          localDate: '2026-08-04',
          localWeek: WEEK
        })
      }
      r.weekItems.confirmPlan({ week: WEEK, items: [] }) // 폐기
    })

    const summary = weekSummary(uow, WEEK)
    expect(summary.items).toHaveLength(0)
    // 미분류 세션도 부모 없는 조각도 없지만 차액이 3 이므로 행을 보여야 한다.
    expect(summary.otherRow).toEqual({ visible: true, spentPomos: 3 })
  })

  it('세션도 조각도 없으면 기타 행을 숨긴다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    expect(weekSummary(uow, WEEK).otherRow.visible).toBe(false)
  })

  it('weeks 행이 없으면 budget 이 null 이다 (기록 없음)', () => {
    const { uow } = testUow()
    expect(weekSummary(uow, WEEK).budget).toBeNull()
  })
})

describe('planDraft — 플래너 진입 프리필 (R16)', () => {
  it('활성 항목만 초안에 싣는다 — 폐기·시스템 항목은 빠진다', () => {
    const { uow } = testUow()
    const { createdIds } = uow.run((r) => {
      r.weekItems.ensureSystemItem(WEEK) // 기타 항목 — 초안에 나오면 안 된다
      return r.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '남길 것', estPomos: 4, days: [1, 3] },
          { id: null, title: '보낼 것', estPomos: 2, days: [] }
        ]
      })
    })
    uow.run((r) =>
      r.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '남길 것', estPomos: 4, days: [1, 3] }]
      })
    )

    const draft = planDraft(uow, WEEK)
    expect(draft.items).toEqual([
      { id: createdIds[0], title: '남길 것', estPomos: 4, days: [1, 3] }
    ])
  })

  it('capacity 미설정이면 prefill 이 null 이라 플래너 입력이 빈 채로 열린다 (A5)', () => {
    const { uow } = testUow() // seedSettings 는 weekly_capacity 를 넣지 않는다
    const draft = planDraft(uow, WEEK)
    expect(draft.prefill).toBeNull()
    expect(draft.budget).toBeNull() // 아직 weeks 행이 없다 = 기록 없음
  })

  it('확정된 예산은 budget 으로, 프리필 후보는 prefill 로 따로 실린다', () => {
    const { uow } = testUow()
    confirmWeekPlan(uow, { week: WEEK, budget: 18, items: [] })
    const draft = planDraft(uow, WEEK)
    expect(draft.budget).toBe(18) // 이미 정한 값
    expect(draft.prefill).toBeNull() // capacity 는 여전히 미설정
  })
})
