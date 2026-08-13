import { describe, expect, it } from 'vitest'
import { contracts } from '@shared/ipc/contracts'
import { ensureWeeks, testUow } from '../db/repositories/test-helpers'
import {
  confirmWeekPlan,
  dropItem,
  itemDrawer,
  planDraft,
  pullFromDrawer,
  pullNextFromItem,
  setItemCompleted,
  weekSummary
} from '../services/week-plan'

const WEEK = '2026-08-03'

/**
 * 서비스 반환값이 IPC 계약을 실제로 통과하는지 본다. week-plan.test.ts 는 서비스를
 * 직접 부르므로 이 경계를 건드리지 않는다 — 어긋남은 여기서만 드러난다.
 */
describe('week 계약 왕복', () => {
  it('응답 9종이 전부 계약을 통과한다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)

    const confirmed = confirmWeekPlan(uow, {
      week: WEEK,
      items: [
        { id: null, title: '항목 A', days: [1, 3] },
        { id: null, title: '항목 B', days: [] }
      ]
    })
    expect(contracts.week.confirmPlan.res.parse(confirmed)).toBeTruthy()

    const [idA, idB] = uow.run((r) => r.weekItems.listForWeek(WEEK).map((i) => i.id))

    // 분류 세션 1 + 미분류 1 — 기타 행이 보이는 상태를 만든다
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: idA, title: '조각 1' })
      r.tasks.create({ id: 't2', weekItemId: idA, title: '조각 2' })
      const s = (id: string, taskId: string | null) => ({
        id,
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
    })

    const summary = contracts.week.summary.res.parse(weekSummary(uow, WEEK))
    expect(summary.items).toHaveLength(2)
    expect(summary.otherRow.visible).toBe(true)

    expect(contracts.week.planDraft.res.parse(planDraft(uow, WEEK)).items).toHaveLength(2)
    expect(contracts.week.drawer.res.parse(itemDrawer(uow, idA))).toBeTruthy()

    // pulled 는 nullable 이다 — 값 있는 갈래와 null 갈래를 모두 통과시킨다
    expect(contracts.week.pullNext.res.parse(pullNextFromItem(uow, idA))).toBeTruthy()
    pullNextFromItem(uow, idA)
    expect(contracts.week.pullNext.res.parse(pullNextFromItem(uow, idA)).pulled).toBeNull()

    expect(
      contracts.week.pullFromDrawer.res.parse(
        pullFromDrawer(uow, {
          weekItemId: idB,
          taskIds: [],
          newTask: { title: '새 조각' }
        })
      )
    ).toBeTruthy()

    expect(contracts.week.complete.res.parse(setItemCompleted(uow, idA, true))).toBeTruthy()
    expect(contracts.week.uncomplete.res.parse(setItemCompleted(uow, idA, false))).toBeTruthy()
    expect(contracts.week.drop.res.parse(dropItem(uow, idB))).toBeTruthy()
  })

  it('요청 스키마가 실제 invoke 인자를 받고 범위 밖을 거부한다', () => {
    expect(contracts.week.summary.req.parse([WEEK])).toBeTruthy()
    expect(
      contracts.week.pullFromDrawer.req.parse([
        { weekItemId: 'x', taskIds: ['a'], newTask: { title: 'n' } }
      ])
    ).toBeTruthy()

    const draft = (title: string, days: number[]) => [
      { week: WEEK, items: [{ id: null, title, days }] }
    ]
    expect(contracts.week.confirmPlan.req.safeParse(draft('A', [0, 6])).success).toBe(true)
    expect(contracts.week.confirmPlan.req.safeParse(draft('', [])).success).toBe(false) // 제목 필수
    expect(contracts.week.confirmPlan.req.safeParse(draft('A', [7])).success).toBe(false) // 요일 0~6
    // 개수 필드는 계약 밖이다 — strictObject 가 되살리는 경로를 거부한다 (ADR-030 §1).
    expect(
      contracts.week.confirmPlan.req.safeParse([
        { week: WEEK, items: [{ id: null, title: 'A', estPomos: 3, days: [] }] }
      ]).success
    ).toBe(false)
  })
})
