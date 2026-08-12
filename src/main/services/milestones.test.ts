import { afterEach, describe, expect, it, vi } from 'vitest'
import { displayMode, isEditable, monthMilestones } from './milestones'
import type { MilestoneRow, Repositories, UnitOfWork } from './ports'

afterEach(() => vi.useRealTimers())

// 표시 모드는 DB 를 타지 않는 **순서 판정**이라 순수 함수로 직접 검증한다.
// 순서가 이 기능에서 가장 틀리기 쉬운 부분이고, 여섯 갈래가 상호 배타여야 한다 (R20).

describe('displayMode — 6분기, 위에서 아래로 처음 참인 행 (R20 · A2)', () => {
  const TODAY = '2026-08'

  it('다음다음 달 이후는 먼 미래다', () => {
    expect(displayMode('2026-10', TODAY, 0)).toBe('far-future')
    expect(displayMode('2027-01', TODAY, 3)).toBe('far-future')
  })

  it('다음 달 한 칸은 선행 편집이다 (R6)', () => {
    expect(displayMode('2026-09', TODAY, 0)).toBe('lead-edit')
    expect(displayMode('2026-09', TODAY, 2)).toBe('lead-edit')
  })

  it('이번 달은 0건이면 빈 상태, 1건 이상이면 편집이다', () => {
    expect(displayMode(TODAY, TODAY, 0)).toBe('current-empty')
    expect(displayMode(TODAY, TODAY, 1)).toBe('edit')
  })

  it('지난달은 0건이면 계획 없던 달, 1건 이상이면 읽기 전용이다', () => {
    expect(displayMode('2026-07', TODAY, 0)).toBe('past-empty')
    expect(displayMode('2026-07', TODAY, 1)).toBe('past')
  })

  /**
   * A2 — 판별은 사전순 비교지만 "다음 달"만은 산술이다. 12월에 문자열 비교로만 다음 달을
   * 구하려 하면 `'2026-13'` 같은 것을 만들거나 이듬해 1월을 먼 미래로 오판한다.
   */
  it('연 경계에서 다음 달 판정이 맞는다', () => {
    expect(displayMode('2027-01', '2026-12', 0)).toBe('lead-edit')
    expect(displayMode('2027-02', '2026-12', 0)).toBe('far-future')
    expect(displayMode('2026-11', '2026-12', 1)).toBe('past')
  })

  it('여섯 갈래가 상호 배타다 — 한 입력이 한 모드만 낸다', () => {
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
      'far-future',
      'far-future'
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
    expect(isEditable('far-future')).toBe(false)
  })
})

function row(over: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id: 'm1',
    month: '2026-08',
    title: '결과물',
    completedAt: null,
    archivedAt: null,
    ...over
  }
}

function fakeUow(o: {
  rows?: MilestoneRow[]
  badge?: { total: number; completed: number; archivedCount: number }
  rollup?: { milestoneId: string; spentPomos: number; plannedPomos: number }[]
  carry?: MilestoneRow[]
  archived?: MilestoneRow[]
  onRollup?: (month: string, week: string) => void
}): UnitOfWork {
  const rows = o.rows ?? []
  const repos = {
    milestones: {
      listForMonth: () => rows,
      badgeCounts: () => o.badge ?? { total: rows.length, completed: 0, archivedCount: 0 },
      carryCandidates: () => o.carry ?? [],
      listArchivedForMonth: () => o.archived ?? [],
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
        badge: { total: 3, completed: 1, archivedCount: 2 }
      }),
      '2026-07'
    )
    expect(res.mode).toBe('past')
    expect(res.badge).toEqual({ total: 3, completed: 1, archivedCount: 2 })
  })

  it('0건인 달은 배지가 null 이다 — 0/0 달성을 만들지 않는다 (A22)', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(
      fakeUow({ rows: [], badge: { total: 0, completed: 0, archivedCount: 0 } }),
      '2026-07'
    )
    expect(res.mode).toBe('past-empty')
    expect(res.badge).toBeNull()
  })

  it('이번 달 카드에는 배지가 없다 — 배지는 끝난 달의 스냅샷이다', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(
      fakeUow({ rows: [row()], badge: { total: 1, completed: 0, archivedCount: 0 } }),
      '2026-08'
    )
    expect(res.mode).toBe('edit')
    expect(res.badge).toBeNull()
  })
})

describe('monthMilestones — 롤업 게이팅 (R17·R18 · A17)', () => {
  it('이번 달이고 진행 중인 주가 이 달에 귀속되면 롤업을 붙인다', () => {
    freezeAt(2026, 8, 4) // 그 주는 2026-08-03 시작 → 8월 귀속
    const res = monthMilestones(
      fakeUow({
        rows: [row()],
        badge: { total: 1, completed: 0, archivedCount: 0 },
        rollup: [{ milestoneId: 'm1', spentPomos: 3, plannedPomos: 8 }]
      }),
      '2026-08'
    )
    expect(res.rollupWeek).toBe('2026-08-03')
    expect(res.items[0].rollup).toEqual({ spentPomos: 3, plannedPomos: 8 })
  })

  /**
   * A17 — 9/1~9/6 동안 진행 중인 주는 8/31 시작이라 **8월에 귀속**된다. 그 기간 9월
   * 카드는 롤업 숫자를 렌더하지 않고 사실 문구만 둔다 (R23), 그 신호가 `rollupWeek: null` 이다.
   */
  it('달 전환 직후 9월 카드에는 롤업이 없다 (A17)', () => {
    freezeAt(2026, 9, 2) // 그 주는 2026-08-31 시작 → 8월 귀속
    const res = monthMilestones(
      fakeUow({
        rows: [row({ month: '2026-09' })],
        badge: { total: 1, completed: 0, archivedCount: 0 }
      }),
      '2026-09'
    )
    expect(res.rollupWeek).toBeNull()
    expect(res.items[0].rollup).toBeNull()
  })

  it('같은 순간에 8월 카드에는 그 주 롤업이 그대로 보인다 (R18)', () => {
    freezeAt(2026, 9, 2)
    const res = monthMilestones(
      fakeUow({
        rows: [row()],
        badge: { total: 1, completed: 0, archivedCount: 0 },
        rollup: [{ milestoneId: 'm1', spentPomos: 2, plannedPomos: 4 }]
      }),
      '2026-08'
    )
    // 8월은 지난달이지만 진행 중인 주가 8월에 귀속돼 있으므로 롤업이 붙는다 (R20 순서 5).
    expect(res.mode).toBe('past')
    expect(res.rollupWeek).toBe('2026-08-31')
    expect(res.items[0].rollup).toEqual({ spentPomos: 2, plannedPomos: 4 })
  })

  it('선행 편집(다음 달)에는 귀속 주가 없으므로 롤업 조회조차 하지 않는다', () => {
    freezeAt(2026, 8, 4)
    const onRollup = vi.fn()
    const res = monthMilestones(
      fakeUow({
        rows: [row({ month: '2026-09' })],
        badge: { total: 1, completed: 0, archivedCount: 0 },
        onRollup
      }),
      '2026-09'
    )
    expect(res.mode).toBe('lead-edit')
    expect(res.rollupWeek).toBeNull()
    expect(onRollup).not.toHaveBeenCalled()
  })

  it('먼 미래 달도 롤업을 조회하지 않는다', () => {
    freezeAt(2026, 8, 4)
    const onRollup = vi.fn()
    monthMilestones(
      fakeUow({ rows: [], badge: { total: 0, completed: 0, archivedCount: 0 }, onRollup }),
      '2026-12'
    )
    expect(onRollup).not.toHaveBeenCalled()
  })
})

describe('monthMilestones — 제목 복사 후보 (R22 · A23)', () => {
  it('이번 달 빈 상태에서만 직전 달 후보를 싣는다', () => {
    freezeAt(2026, 8, 4)
    const carry = [row({ id: 'm-prev', month: '2026-07', title: '남은 것' })]
    const res = monthMilestones(
      fakeUow({ rows: [], badge: { total: 0, completed: 0, archivedCount: 0 }, carry }),
      '2026-08'
    )
    expect(res.mode).toBe('current-empty')
    expect(res.carryCandidates.map((c) => c.title)).toEqual(['남은 것'])
  })

  it('이번 달에 이미 마일스톤이 있으면 후보를 싣지 않는다', () => {
    freezeAt(2026, 8, 4)
    const carry = [row({ id: 'm-prev', month: '2026-07' })]
    const res = monthMilestones(
      fakeUow({ rows: [row()], badge: { total: 1, completed: 0, archivedCount: 0 }, carry }),
      '2026-08'
    )
    expect(res.mode).toBe('edit')
    expect(res.carryCandidates).toEqual([])
  })
})

describe('monthMilestones — 보관 목록은 해제의 도달 경로다 (R11 · A20)', () => {
  it('보관이 0건이면 조회하지 않고 빈 배열이다', () => {
    freezeAt(2026, 8, 4)
    const res = monthMilestones(
      fakeUow({
        rows: [row()],
        badge: { total: 1, completed: 0, archivedCount: 0 },
        archived: [row({ id: 'never-read' })]
      }),
      '2026-08'
    )
    expect(res.archivedItems).toEqual([])
  })

  it('보관이 있으면 지난달 카드에서도 목록을 싣는다 — 없으면 해제에 도달할 수 없다', () => {
    freezeAt(2026, 8, 4)
    const archived = [row({ id: 'arch', month: '2026-07', archivedAt: '2026-07-31T00:00:00.000Z' })]
    const res = monthMilestones(
      fakeUow({ rows: [], badge: { total: 1, completed: 0, archivedCount: 1 }, archived }),
      '2026-07'
    )
    expect(res.mode).toBe('past')
    expect(res.archivedItems.map((a) => a.id)).toEqual(['arch'])
  })
})
