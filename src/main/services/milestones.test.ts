import { afterEach, describe, expect, it, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { testUow } from '../db/repositories/test-helpers'
import { displayMode, isEditable, monthMilestones } from './milestones'
import type { MilestoneRow, Repositories, UnitOfWork } from './ports'

afterEach(() => vi.useRealTimers())

// 표시 모드는 DB 를 타지 않는 **순서 판정**이라 순수 함수로 직접 검증한다.
// 순서가 이 기능에서 가장 틀리기 쉬운 부분이고, 여섯 갈래가 상호 배타여야 한다 (R20).

describe('displayMode — 5분기, 위에서 아래로 처음 참인 행 (R20 · A2)', () => {
  const TODAY = '2026-08'

  it('미래 달은 얼마나 멀든 선행 편집이다 — 날짜 제한이 없다', () => {
    expect(displayMode('2026-09', TODAY, 0)).toBe('lead-edit')
    expect(displayMode('2026-10', TODAY, 0)).toBe('lead-edit')
    expect(displayMode('2027-01', TODAY, 3)).toBe('lead-edit')
  })

  it('이번 달은 0건이면 빈 상태, 1건 이상이면 편집이다', () => {
    expect(displayMode(TODAY, TODAY, 0)).toBe('current-empty')
    expect(displayMode(TODAY, TODAY, 1)).toBe('edit')
  })

  it('지난달은 0건이면 계획 없던 달, 1건 이상이면 읽기 전용이다', () => {
    expect(displayMode('2026-07', TODAY, 0)).toBe('past-empty')
    expect(displayMode('2026-07', TODAY, 1)).toBe('past')
  })

  it('연 경계에서도 판정이 맞는다 — 사전순 비교가 연도를 그대로 탄다', () => {
    expect(displayMode('2027-01', '2026-12', 0)).toBe('lead-edit')
    expect(displayMode('2027-02', '2026-12', 0)).toBe('lead-edit')
    expect(displayMode('2026-11', '2026-12', 1)).toBe('past')
  })

  it('다섯 갈래가 상호 배타다 — 한 입력이 한 모드만 낸다', () => {
    const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    const modes = months.flatMap((m) => [displayMode(m, TODAY, 0), displayMode(m, TODAY, 2)])
    expect(modes).toEqual([
      'past-empty',
      'past',
      'past-empty',
      'past',
      'current-empty',
      'edit',
      'lead-edit',
      'lead-edit',
      'lead-edit',
      'lead-edit'
    ])
  })
})

describe('isEditable — 지난달과 먼 미래는 잠긴다 (R20 · A6·A20)', () => {
  it('편집이 열리는 모드는 셋뿐이다', () => {
    expect(isEditable('lead-edit')).toBe(true)
    expect(isEditable('current-empty')).toBe(true)
    expect(isEditable('edit')).toBe(true)
    expect(isEditable('past')).toBe(false)
    expect(isEditable('past-empty')).toBe(false)
  })
})

function row(over: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id: 'm1',
    month: '2026-08',
    title: '결과물',
    completedAt: null,
    ...over
  }
}

function fakeUow(o: {
  rows?: MilestoneRow[]
  badge?: { total: number; completed: number }
  rollup?: { milestoneId: string; measuredSec: number }[]
  carry?: MilestoneRow[]
  onRollup?: (month: string, week: string) => void
}): UnitOfWork {
  const rows = o.rows ?? []
  const repos = {
    milestones: {
      listForMonth: () => rows,
      badgeCounts: () => o.badge ?? { total: rows.length, completed: 0 },
      carryCandidates: () => o.carry ?? [],
      rollup: (month: string, week: string) => {
        o.onRollup?.(month, week)
        return o.rollup ?? []
      }
    }
  } as unknown as Repositories

  return { run: <T>(fn: (r: Repositories) => T) => fn(repos) } as UnitOfWork
}

/** 로컬 시각을 고정한다 — 서비스가 `calendarKeys()` 로 오늘을 직접 읽기 때문이다. */
function freezeAt(y: number, m: number, d: number) {
  vi.useFakeTimers({ now: new Date(y, m - 1, d, 12, 0, 0) })
}

describe('monthMilestones — 배지는 지난달 카드의 것이다 (R21 · A22)', () => {
  it('지난달 1건 이상이면 배지를 싣는다', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(
      fakeUow({
        rows: [row({ month: '2026-07' })],
        badge: { total: 3, completed: 1 }
      }),
      '2026-07'
    )
    expect(res.mode).toBe('past')
    expect(res.badge).toEqual({ total: 3, completed: 1 })
  })

  it('0건인 달은 배지가 null 이다 — 0/0 달성을 만들지 않는다 (A22)', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(fakeUow({ rows: [], badge: { total: 0, completed: 0 } }), '2026-07')
    expect(res.mode).toBe('past-empty')
    expect(res.badge).toBeNull()
  })

  it('이번 달 카드에는 배지가 없다 — 배지는 끝난 달의 스냅샷이다', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(
      fakeUow({ rows: [row()], badge: { total: 1, completed: 0 } }),
      '2026-08'
    )
    expect(res.mode).toBe('edit')
    expect(res.badge).toBeNull()
  })
})

describe('monthMilestones — 이번 주 롤업은 달을 가리지 않는다 (R17 · ADR-035)', () => {
  /**
   * 롤업의 대상 주는 **언제나 오늘이 속한 주**다. 그 주가 어느 달에 귀속되는지(R18)는
   * 카드의 숫자를 가르지 않는다 — 가르는 것은 저장소 조회가 이미 하는 "그 Milestone 에
   * 연결됐는가" 하나다. 한 Sprint 는 Milestone 하나에만 연결되므로 두 카드에 겹쳐 뜨지 않는다.
   */
  it('이번 달 카드는 이번 주 롤업을 조회해 붙인다', () => {
    freezeAt(2026, 8, 4)
    const onRollup = vi.fn()
    const res = monthMilestones(
      fakeUow({
        rows: [row()],
        badge: { total: 1, completed: 0 },
        rollup: [{ milestoneId: 'm1', measuredSec: 4500 }],
        onRollup
      }),
      '2026-08'
    )
    expect(onRollup).toHaveBeenCalledWith('2026-08', '2026-08-03')
    expect(res.items[0].rollup).toEqual({ measuredSec: 4500 })
  })

  /**
   * 예전 A17 — 9/1~9/6 의 진행 중인 주는 8월에 귀속되지만, 그 주에 9월 Milestone 에 연결된
   * Sprint 가 있으면 그 시간은 9월 카드에 뜬다. 안내 문구(`… 8월에 속한 주예요`)로 숫자를
   * 가리던 분기가 사라졌다.
   */
  it('달 전환 직후에도 이번 달 카드가 이번 주 롤업을 붙인다', () => {
    freezeAt(2026, 9, 2) // 진행 중인 주는 2026-08-31 시작
    const onRollup = vi.fn()
    const res = monthMilestones(
      fakeUow({
        rows: [row({ month: '2026-09' })],
        badge: { total: 1, completed: 0 },
        rollup: [{ milestoneId: 'm1', measuredSec: 1500 }],
        onRollup
      }),
      '2026-09'
    )
    expect(onRollup).toHaveBeenCalledWith('2026-09', '2026-08-31')
    expect(res.items[0].rollup).toEqual({ measuredSec: 1500 })
  })

  it('미래 달 카드도 이번 주 롤업을 붙인다 — 다음 달 Milestone 에 건 Sprint', () => {
    freezeAt(2026, 9, 29)
    const onRollup = vi.fn()
    const res = monthMilestones(
      fakeUow({
        rows: [row({ month: '2026-10' })],
        badge: { total: 1, completed: 0 },
        rollup: [{ milestoneId: 'm1', measuredSec: 7200 }],
        onRollup
      }),
      '2026-10'
    )
    expect(res.mode).toBe('lead-edit')
    expect(onRollup).toHaveBeenCalledWith('2026-10', '2026-09-28')
    expect(res.items[0].rollup).toEqual({ measuredSec: 7200 })
  })

  it('이번 주에 연결된 Sprint 가 없는 Milestone 은 롤업이 없다 — 0 과 다르다', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(
      fakeUow({ rows: [row()], badge: { total: 1, completed: 0 }, rollup: [] }),
      '2026-08'
    )
    expect(res.items[0].rollup).toBeNull()
  })

  it('Milestone 이 0건인 달은 조회하지 않는다', () => {
    freezeAt(2026, 8, 4)
    const onRollup = vi.fn()
    monthMilestones(fakeUow({ rows: [], badge: { total: 0, completed: 0 }, onRollup }), '2026-12')
    expect(onRollup).not.toHaveBeenCalled()
  })

  it('응답에 롤업 주를 따로 싣지 않는다 — 늘 이번 주라 정보가 없다', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(fakeUow({ rows: [row()] }), '2026-08')
    expect(res).not.toHaveProperty('rollupWeek')
  })
})

/**
 * 실제 DB 로 재현한 버그의 회귀 테스트 (2026-09-24 decision-log · A13).
 *
 * 8월 Milestone 에 걸린 Sprint 가 정산에서 9/7 주로 이월된 뒤 9/8 에 집중하면, 저장소는 그
 * 시간을 세는데 8월 카드는 "이번 주가 8월에 귀속되지 않는다"며 숫자를 버렸고 9월 카드에는
 * 그 Milestone 이 없었다 — 시간이 **어느 카드에도** 뜨지 않았다. 저장소 테스트만 있어
 * 서비스의 게이트가 이 약속을 깨는 것을 잡지 못했다.
 */
describe('monthMilestones — 이월로 달을 넘긴 연결의 시간이 사라지지 않는다 (A13)', () => {
  it('지난 달 Milestone 카드에 이번 주 시간이 뜬다', () => {
    freezeAt(2026, 9, 8)
    const { uow } = testUow()
    const m = uow.run((repos) => {
      const id = uuidv7()
      repos.milestones.create({ id, month: '2026-08', title: '8월 결과물', sortOrder: 0 })
      const [item] = repos.weekItems.confirmPlan({
        week: '2026-09-07',
        items: [{ id: null, title: '이월된 Sprint', days: [] }]
      }).createdIds
      repos.milestones.setWeekItemMilestone(item, id)
      const task = uuidv7()
      repos.tasks.create({ id: task, weekItemId: item, title: '조각' })
      repos.sessions.insert({
        id: uuidv7(),
        startedAt: '2026-09-08T01:00:00.000Z',
        endedAt: '2026-09-08T01:25:00.000Z',
        durationSec: 1500,
        kind: 'focus',
        taskId: task,
        localDate: '2026-09-08',
        localWeek: '2026-09-07'
      })
      return id
    })

    const aug = monthMilestones(uow, '2026-08')
    expect(aug.mode).toBe('past')
    expect(aug.items.find((i) => i.id === m)?.rollup).toEqual({ measuredSec: 1500 })
  })
})

describe('monthMilestones — 제목 복사 후보 (R22 · A23)', () => {
  it('이번 달 빈 상태에서만 직전 달 후보를 싣는다', () => {
    freezeAt(2026, 8, 4)
    const carry = [row({ id: 'm-prev', month: '2026-07', title: '남은 것' })]
    const res = monthMilestones(
      fakeUow({ rows: [], badge: { total: 0, completed: 0 }, carry }),
      '2026-08'
    )
    expect(res.mode).toBe('current-empty')
    expect(res.carryCandidates.map((c) => c.title)).toEqual(['남은 것'])
  })

  it('이번 달에 이미 마일스톤이 있으면 후보를 싣지 않는다', () => {
    freezeAt(2026, 8, 4)
    const carry = [row({ id: 'm-prev', month: '2026-07' })]
    const res = monthMilestones(
      fakeUow({ rows: [row()], badge: { total: 1, completed: 0 }, carry }),
      '2026-08'
    )
    expect(res.mode).toBe('edit')
    expect(res.carryCandidates).toEqual([])
  })
})
