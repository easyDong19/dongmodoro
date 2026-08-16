import { describe, expect, it } from 'vitest'
import { localKeys } from '../../shared/time'
import { testUow } from '../db/repositories/test-helpers'
import {
  addTaskToItem,
  confirmWeekPlan,
  dropItem,
  itemDrawer,
  otherRowMeasuredSec,
  planDraft,
  pullFromDrawer,
  setItemCompleted,
  setItemMilestone,
  weekSummary
} from './week-plan'

const WEEK = '2026-08-03'

describe('otherRowMeasuredSec (ADR-027 §1 + ADR-031 §2)', () => {
  it('주 총 측정 시간에서 보이는 항목의 합을 뺀 값이다', () => {
    expect(otherRowMeasuredSec(5400, [{ measuredSec: 3000 }])).toBe(2400)
  })

  it('보이는 항목이 없으면 주 총 측정 시간 전부가 기타 행이다', () => {
    expect(otherRowMeasuredSec(1200, [])).toBe(1200)
  })
})

describe('confirmWeekPlan', () => {
  /**
   * 확정이 만드는 것은 **항목뿐이다.** 예산·가용량이 폐기돼(ADR-030 §4) 껍데기만
   * 남았던 `weeks` 행 생성 경로는 0001 마이그레이션과 함께 걷혔다. 빈 목록으로 다시
   * 확정해도 항목이 비워질 뿐 다른 부수효과가 없다.
   */
  it('빈 목록으로 다시 확정하면 항목만 비워진다', () => {
    const { uow } = testUow()
    confirmWeekPlan(uow, { week: WEEK, items: [{ id: null, title: 'A', days: [] }] })
    expect(uow.run((r) => r.weekItems.listForWeek(WEEK))).toHaveLength(1)

    confirmWeekPlan(uow, { week: WEEK, items: [] })
    expect(uow.run((r) => r.weekItems.listForWeek(WEEK))).toHaveLength(0)
  })

  it('항목이 몇 개든 확정은 성공한다 — 막는 경로가 없다', () => {
    const { uow } = testUow()
    const result = confirmWeekPlan(uow, { week: WEEK, items: [{ id: null, title: 'A', days: [] }] })
    expect(result.week).toBe(WEEK)
    expect(uow.run((r) => r.weekItems.listForWeek(WEEK))).toHaveLength(1)
  })
})

// 아래 유스케이스들은 `localKeys()` 로 오늘 날짜를 스스로 읽는다. 테스트가 날짜를
// 하드코딩하지 않는 이유다 — 어느 날 돌려도 통과해야 한다.
describe('itemDrawer', () => {
  it('폐기된 항목도 열린다 — header 는 listForWeek 밖을 본다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
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
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
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
      expect(r.weekItems.weekTotalMeasuredSec(WEEK)).toBe(1500) // 주 총합은 줄지 않는다
      // 기타 행이 받는다
      expect(otherRowMeasuredSec(1500, r.weekItems.listForWeek(WEEK))).toBe(1500)
      expect(r.weekItems.childTasks(id, '2026-08-04')).toHaveLength(1) // 조각도 남았다
    })
  })
})

describe('setItemCompleted (R25·R27·R28)', () => {
  it('완료 후 세션이 더 붙어도 completed_at 이 변하지 않는다 (A37)', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
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
    expect(row.measuredSec).toBe(7500) // 측정 시간은 계속 오른다
    expect(row.completedAt).toBe(at) // 완료 시각은 그대로다
  })

  it('완료를 해제하면 NULL 로 돌아간다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
        }).createdIds[0]
    )
    setItemCompleted(uow, id, true)
    expect(setItemCompleted(uow, id, false).completedAt).toBeNull()
  })
})

describe('pullFromDrawer — R7·R27 을 서비스에서 강제한다', () => {
  it('완료된 항목에서는 pull 할 수 없다 (R27)', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
    setItemCompleted(uow, id, true)

    expect(() => pullFromDrawer(uow, { weekItemId: id, taskIds: ['t1'], newTask: null })).toThrow()
  })

  it('완료된 조각은 pull 하지 않는다 (R7)', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
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
    const { createdIds } = uow.run((r) =>
      r.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: 'A', days: [] },
          { id: null, title: 'B', days: [] }
        ]
      })
    )
    uow.run((r) => r.tasks.create({ id: 'tb', weekItemId: createdIds[1], title: 'B 의 조각' }))
    expect(() =>
      pullFromDrawer(uow, { weekItemId: createdIds[0], taskIds: ['tb'], newTask: null })
    ).toThrow()
  })
})

describe('addTaskToItem — 쪼개기와 가져오기의 분리 (드로어 다중 추가)', () => {
  const makeItem = (uow: ReturnType<typeof testUow>['uow']) =>
    uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
        }).createdIds[0]
    )

  it('조각을 만들되 오늘 목록에는 넣지 않는다 — pull 은 별도 행위다', () => {
    const { uow } = testUow()
    const id = makeItem(uow)

    const r1 = addTaskToItem(uow, { weekItemId: id, title: '용어 표 검토' })
    const r2 = addTaskToItem(uow, { weekItemId: id, title: '그림 주석 달기' })

    expect(r1.itemWeek).toBe(WEEK)
    expect(r1.taskId).not.toBe(r2.taskId)

    const { localDate } = localKeys()
    const tasks = uow.run((r) => r.weekItems.childTasks(id, localDate))
    expect(tasks.map((t) => t.title)).toEqual(['용어 표 검토', '그림 주석 달기'])
    // 아직 아무것도 오늘로 가지 않았다 — Enter 는 쌓기만 한다.
    expect(tasks.every((t) => !t.inToday)).toBe(true)
  })

  it('만든 조각을 나중에 pullFromDrawer 로 가져올 수 있다', () => {
    const { uow } = testUow()
    const id = makeItem(uow)
    const { taskId } = addTaskToItem(uow, { weekItemId: id, title: '조각' })

    pullFromDrawer(uow, { weekItemId: id, taskIds: [taskId], newTask: null })

    const { localDate } = localKeys()
    const tasks = uow.run((r) => r.weekItems.childTasks(id, localDate))
    expect(tasks.find((t) => t.taskId === taskId)?.inToday).toBe(true)
  })

  it('완료된 항목에는 조각을 추가할 수 없다 (R27 과 같은 가드)', () => {
    const { uow } = testUow()
    const id = makeItem(uow)
    setItemCompleted(uow, id, true)
    expect(() => addTaskToItem(uow, { weekItemId: id, title: '조각' })).toThrow()
  })

  it('빈 제목을 거부한다 — 공백만 있는 제목도 마찬가지다', () => {
    const { uow } = testUow()
    const id = makeItem(uow)
    expect(() => addTaskToItem(uow, { weekItemId: id, title: '   ' })).toThrow()
  })

  it('없는 항목이면 거부한다', () => {
    const { uow } = testUow()
    expect(() => addTaskToItem(uow, { weekItemId: 'ghost', title: '조각' })).toThrow()
  })
})

describe('weekSummary — 한 화면 = 한 응답', () => {
  it('등식이 성립한다: Σ(보이는 항목) + 기타 행 = 주 총 측정 시간 (성공 지표)', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
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
    expect(summary.totalMeasuredSec).toBe(4500)
    expect(summary.items).toHaveLength(1)
    expect(summary.otherRow).toEqual({ visible: true, measuredSec: 3000 })
    // 항등식은 **초에서** 성립한다 (ADR-031 §2) — 반올림은 표시 직전 한 번뿐이므로
    // 이 등식은 분으로 접기 전 단계에서 참이어야 한다.
    expect(
      summary.items.reduce((n, i) => n + i.measuredSec, 0) + summary.otherRow.measuredSec
    ).toBe(summary.totalMeasuredSec)
  })

  it('폐기 항목의 집중만 있는 주에도 기타 행이 보인다 (A24 · ADR-027 §3 세 번째 갈래)', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', days: [] }]
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
    // 미분류 세션도 부모 없는 조각도 없지만, 목록으로 설명되지 않는 집중이 있으므로 뜬다.
    expect(summary.otherRow).toEqual({ visible: true, measuredSec: 4500 })
  })

  /**
   * 표시 조건 ③ 이 **크기가 아니라 존재**를 보는 이유의 회귀 (ux-spec §3.4).
   * `duration_sec = 0` 세션만 붙은 항목을 폐기하면 차액이 0 초라, 차액 크기로 판정하던
   * 옛 규칙에서는 행이 사라지고 실재한 집중이 화면에서 증발했다 (PRD A24).
   */
  it('0초 세션만 붙은 항목을 폐기해도 기타 행이 보인다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({ week: WEEK, items: [{ id: null, title: 'A', days: [] }] })
          .createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      r.sessions.insert({
        id: 's1',
        startedAt: '2026-08-04T01:00:00.000Z',
        endedAt: '2026-08-04T01:00:00.000Z',
        durationSec: 0,
        kind: 'focus',
        taskId: 't1',
        localDate: '2026-08-04',
        localWeek: WEEK
      })
    })

    // 아직 목록에 보이므로 기타 행은 필요 없다.
    expect(weekSummary(uow, WEEK).otherRow.visible).toBe(false)

    dropItem(uow, id)
    expect(weekSummary(uow, WEEK).otherRow).toEqual({ visible: true, measuredSec: 0 })
  })

  it('세션도 조각도 없으면 기타 행을 숨긴다', () => {
    const { uow } = testUow()
    expect(weekSummary(uow, WEEK).otherRow.visible).toBe(false)
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
          { id: null, title: '남길 것', days: [1, 3] },
          { id: null, title: '보낼 것', days: [] }
        ]
      })
    })
    uow.run((r) =>
      r.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '남길 것', days: [1, 3] }]
      })
    )

    const draft = planDraft(uow, WEEK)
    expect(draft.items).toEqual([{ id: createdIds[0], title: '남길 것', days: [1, 3] }])
  })

  /** 초안에 담기는 것은 주 키와 항목 목록뿐이다 — 프리필할 숫자가 없다 (ADR-030 §3). */
  it('숫자 필드를 싣지 않는다', () => {
    const { uow } = testUow()
    expect(Object.keys(planDraft(uow, WEEK)).sort()).toEqual(['items', 'week'])
  })
})

describe('setItemMilestone — 후보 제한을 서비스가 강제한다 (milestones R14 · A12)', () => {
  const AUG_WEEK = '2026-08-03'
  const SEP_WEEK = '2026-09-07'

  function makeMilestone(uow: ReturnType<typeof testUow>['uow'], month: string, title: string) {
    return uow.run((repos) => {
      const id = `ms-${month}-${title}`
      repos.milestones.create({
        id,
        month,
        title,
        sortOrder: repos.milestones.nextSortOrder(month)
      })
      return id
    })
  }

  function makeItem(uow: ReturnType<typeof testUow>['uow'], week: string) {
    return uow.run(
      (repos) =>
        repos.weekItems.confirmPlan({
          week,
          items: [{ id: null, title: '할당', days: [] }]
        }).createdIds[0]
    )
  }

  it('그 주가 귀속된 달의 마일스톤에는 연결된다', () => {
    const { uow } = testUow()
    const m = makeMilestone(uow, '2026-08', 'aug')
    const item = makeItem(uow, AUG_WEEK)

    expect(setItemMilestone(uow, { weekItemId: item, milestoneId: m })).toEqual({
      itemWeek: AUG_WEEK
    })
    expect(uow.run((r) => r.milestones.linkedMilestone(item)?.id)).toBe(m)
  })

  /**
   * A12 — 화면이 후보를 좁히는 것만으로는 IPC 를 직접 부르는 경로가 열린다.
   * 8월 주의 할당을 9월 마일스톤에 매달 수 있으면 그 롤업이 임의의 달에서 올라와
   * 월 레이어의 경계가 사라진다.
   */
  it('다른 달 마일스톤에 새로 매달면 거부한다 (A12)', () => {
    const { uow } = testUow()
    const sep = makeMilestone(uow, '2026-09', 'sep')
    const item = makeItem(uow, AUG_WEEK)

    expect(() => setItemMilestone(uow, { weekItemId: item, milestoneId: sep })).toThrow(
      /not a candidate/
    )
    expect(uow.run((r) => r.milestones.linkedMilestone(item))).toBeNull()
  })

  it('보관된 마일스톤에도 새로 매달 수 없다 (R14)', () => {
    const { uow } = testUow()
    const m = makeMilestone(uow, '2026-08', 'archived')
    uow.run((r) => r.milestones.archive(m, '2026-08-20T00:00:00.000Z'))
    const item = makeItem(uow, AUG_WEEK)

    expect(() => setItemMilestone(uow, { weekItemId: item, milestoneId: m })).toThrow(
      /not a candidate/
    )
  })

  /**
   * R18 — 주는 쪼개지지 않는다. 8/31 주는 9/6 까지 이어지지만 전체가 8월에 귀속되므로,
   * 그 주의 할당은 8월 마일스톤에 연결된다.
   */
  it('달을 넘긴 주의 할당은 주 키의 달을 따른다 (R18)', () => {
    const { uow } = testUow()
    const aug = makeMilestone(uow, '2026-08', 'aug')
    const item = makeItem(uow, '2026-08-31')

    expect(setItemMilestone(uow, { weekItemId: item, milestoneId: aug }).itemWeek).toBe(
      '2026-08-31'
    )
  })

  it('해제는 언제나 허용된다 — 타월 연결도 끊을 수 있어야 한다 (R13·R15)', () => {
    const { uow } = testUow()
    const aug = makeMilestone(uow, '2026-08', 'aug')
    const item = makeItem(uow, SEP_WEEK)
    // 이월 승계가 만드는 것과 같은 타월 연결을 저장소로 직접 만든다.
    uow.run((r) => r.milestones.setWeekItemMilestone(item, aug))

    expect(setItemMilestone(uow, { weekItemId: item, milestoneId: null })).toEqual({
      itemWeek: SEP_WEEK
    })
    expect(uow.run((r) => r.milestones.linkedMilestone(item))).toBeNull()
  })

  it('없는 할당이면 throw 한다', () => {
    const { uow } = testUow()
    expect(() => setItemMilestone(uow, { weekItemId: 'nope', milestoneId: null })).toThrow(
      /not found/
    )
  })
})

describe('itemDrawer — 후보를 서버가 좁혀 보낸다 (R14 · A12)', () => {
  it('그 주가 귀속된 달의 미보관 마일스톤만 후보다', () => {
    const { uow } = testUow()
    const item = uow.run(
      (repos) =>
        repos.weekItems.confirmPlan({
          week: '2026-08-03',
          items: [{ id: null, title: '할당', days: [] }]
        }).createdIds[0]
    )
    uow.run((repos) => {
      repos.milestones.create({ id: 'aug', month: '2026-08', title: '8월', sortOrder: 0 })
      repos.milestones.create({ id: 'sep', month: '2026-09', title: '9월', sortOrder: 0 })
      repos.milestones.create({ id: 'arch', month: '2026-08', title: '보관', sortOrder: 1 })
      repos.milestones.archive('arch', '2026-08-20T00:00:00.000Z')
    })

    const drawer = itemDrawer(uow, item)
    expect(drawer.milestoneCandidates.map((m) => m.id)).toEqual(['aug'])
    expect(drawer.milestone).toBeNull()
  })
})
