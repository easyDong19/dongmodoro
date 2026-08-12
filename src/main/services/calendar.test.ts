import { describe, expect, it } from 'vitest'
import { dayRecord, monthCalendar, studyDays } from './calendar'
import type { Repositories, UnitOfWork } from './ports'

// SQL 이 아니라 **판정**을 검증한다 — 술어가 한 곳인지, 예외가 의도한 그 자리인지.
// 범위 조회 자체는 db/repositories/calendar.test.ts 가 실 SQLite 로 덮는다.

type TaskStub = { taskId: string; title: string; completedAt?: string | null }

function fakeUow(o: {
  focusByDate?: Record<string, number>
  pullDates?: string[]
  pulledOn?: Record<string, TaskStub[]>
  sessionOn?: Record<string, TaskStub[]>
  studiedDays?: number
}): UnitOfWork {
  const withNull = (t: TaskStub) => ({ ...t, completedAt: t.completedAt ?? null })
  const repos = {
    sessions: { countFocusOn: (d: string) => o.focusByDate?.[d] ?? 0 },
    calendar: {
      focusCountsByDate: (from: string, to: string) =>
        Object.entries(o.focusByDate ?? {})
          .filter(([d]) => d >= from && d <= to)
          .map(([dayKey, focusCount]) => ({ dayKey, focusCount })),
      pullDatesIn: (from: string, to: string) =>
        (o.pullDates ?? []).filter((d) => d >= from && d <= to),
      pulledTasksOn: (d: string) => (o.pulledOn?.[d] ?? []).map(withNull),
      sessionTasksOn: (d: string) => (o.sessionOn?.[d] ?? []).map(withNull),
      studiedDayCount: () => o.studiedDays ?? 0
    }
  } as unknown as Repositories

  return { run: <T>(fn: (r: Repositories) => T) => fn(repos) } as UnitOfWork
}

function dayOf(cal: ReturnType<typeof monthCalendar>, dayKey: string) {
  const found = cal.days.find((d) => d.dayKey === dayKey)
  if (found === undefined) throw new Error(`no such day in grid: ${dayKey}`)
  return found
}

describe('monthCalendar — 기록 있음 술어와 점 등급 (R5·R6·R11)', () => {
  it('focus 3회는 기본 점, 4회는 진한 점 (A6)', () => {
    const cal = monthCalendar(
      fakeUow({ focusByDate: { '2026-08-04': 3, '2026-08-05': 4 } }),
      '2026-08'
    )
    expect(dayOf(cal, '2026-08-04').dotLevel).toBe('basic')
    expect(dayOf(cal, '2026-08-05').dotLevel).toBe('strong')
  })

  it('focus 0 이고 pull 행도 없으면 기록 없음 (A6)', () => {
    const cal = monthCalendar(fakeUow({}), '2026-08')
    expect(dayOf(cal, '2026-08-04').hasRecord).toBe(false)
  })

  /**
   * A5 — 이 테스트가 리뷰 케이스 6 의 재발 방지선이다. 타이머를 한 번도 돌리지 않고
   * 조각만 체크한 날이 점 없음으로 나오면, 캘린더와 날짜 패널이 같은 날짜에 대해
   * 서로 반대로 말하게 된다.
   */
  it('focus 0 + 조각만 있는 날은 점 있음 · 기본 등급이다 (A5)', () => {
    const cal = monthCalendar(fakeUow({ pullDates: ['2026-08-04'] }), '2026-08')
    const day = dayOf(cal, '2026-08-04')
    expect(day.hasRecord).toBe(true)
    expect(day.dotLevel).toBe('basic')
    expect(day.focusCount).toBe(0)
  })

  it('등급 계산에 조각 수가 들어가지 않는다 — pull 이 아무리 많아도 기본 점이다 (R6)', () => {
    const cal = monthCalendar(fakeUow({ pullDates: ['2026-08-04'] }), '2026-08')
    expect(dayOf(cal, '2026-08-04').dotLevel).toBe('basic')
  })

  it('그리드가 그 달만 담고 앞 빈 칸 수를 함께 준다 (R7)', () => {
    const cal = monthCalendar(fakeUow({}), '2026-07')
    expect(cal.leadingBlanks).toBe(2) // 2026-07-01 은 수요일
    expect(cal.days).toHaveLength(31)
    expect(cal.days.at(-1)?.dayKey).toBe('2026-07-31')
  })

  /**
   * A18 — 오늘보다 뒤인 셀에 점이 찍히는 것은 버그가 아니다. 점은 기록 당시의 사실이고
   * 오늘 표시는 현재 시각의 사실이며, 서비스는 미래를 특별 취급하지 않는다 (R10).
   */
  it('미래 날짜를 특별 취급하지 않는다 (R10 · A18)', () => {
    const cal = monthCalendar(fakeUow({ focusByDate: { '2026-08-31': 2 } }), '2026-08')
    expect(dayOf(cal, '2026-08-31').hasRecord).toBe(true)
  })
})

describe('dayRecord — 두 원천의 합집합 (R18)', () => {
  it('pull 만 있는 조각과 세션만 있는 조각이 모두 나온다', () => {
    const rec = dayRecord(
      fakeUow({
        pulledOn: { '2026-08-04': [{ taskId: 't1', title: '가져온 조각' }] },
        sessionOn: { '2026-08-04': [{ taskId: 't2', title: '세션 조각' }] },
        focusByDate: { '2026-08-04': 1 }
      }),
      '2026-08-04'
    )
    expect(rec.tasks.map((t) => t.title).sort()).toEqual(['가져온 조각', '세션 조각'])
  })

  it('두 원천에 다 있는 조각은 한 행이고 출처가 둘 다로 표시된다', () => {
    const rec = dayRecord(
      fakeUow({
        pulledOn: { '2026-08-04': [{ taskId: 't1', title: '설계 문서' }] },
        sessionOn: { '2026-08-04': [{ taskId: 't1', title: '설계 문서' }] },
        focusByDate: { '2026-08-04': 2 }
      }),
      '2026-08-04'
    )
    expect(rec.tasks).toEqual([
      { taskId: 't1', title: '설계 문서', completedAt: null, pulled: true, hadSession: true }
    ])
  })

  /**
   * A10 — 자유 집중 3회 후 각각 이름을 붙인 날. pull 행이 0건이므로 원천 1만 보면
   * 사용자가 붙인 이름 세 개가 패널에서 사라진다.
   */
  it('pull 행 0건인 사후 캡처 3건이 모두 나오고 출처가 세션이다 (A10)', () => {
    const rec = dayRecord(
      fakeUow({
        sessionOn: {
          '2026-08-04': [
            { taskId: 't1', title: '자유 집중 1' },
            { taskId: 't2', title: '자유 집중 2' },
            { taskId: 't3', title: '자유 집중 3' }
          ]
        },
        focusByDate: { '2026-08-04': 3 }
      }),
      '2026-08-04'
    )
    expect(rec.tasks).toHaveLength(3)
    expect(rec.tasks.every((t) => t.hadSession && !t.pulled)).toBe(true)
  })

  /**
   * A12 — 8/1 에 가져와 8/5 에 끝낸 조각. 완료 표시는 현재 상태이며, 로컬 날짜 비교로
   * 미완료를 만들지 않는다 (R19 — 그렇게 하면 타임존을 옮겼을 때 표시가 뒤집힌다).
   */
  it('나중에 완료한 조각도 그 날짜 패널에서 완료로 보인다 (A12)', () => {
    const rec = dayRecord(
      fakeUow({
        pulledOn: {
          '2026-08-01': [
            { taskId: 't1', title: '설계 문서', completedAt: '2026-08-05T02:00:00.000Z' }
          ]
        }
      }),
      '2026-08-01'
    )
    expect(rec.tasks[0].completedAt).toBe('2026-08-05T02:00:00.000Z')
  })

  it('빈 상태 판정이 점과 같은 술어를 쓴다 — 세션도 pull 도 없으면 기록 없음 (A14)', () => {
    const rec = dayRecord(fakeUow({}), '2026-08-04')
    expect(rec.hasRecord).toBe(false)
    expect(rec.tasks).toEqual([])
  })

  it('세션만 있고 pull 이 없어도 기록 있음이다', () => {
    const rec = dayRecord(fakeUow({ focusByDate: { '2026-08-04': 1 } }), '2026-08-04')
    expect(rec.hasRecord).toBe(true)
  })
})

describe('studyDays — R5 와 갈리는 유일한 지점 (R24 · A23)', () => {
  it('완료 focus 가 있는 날만 센다 — 조각만 체크한 날은 N 에 들어가지 않는다 (A23)', () => {
    // 리포지토리가 `local_week` 로 focus 세션만 세므로, pull 만 있는 날은 애초에
    // 이 값에 들어올 수 없다. 서비스가 그 값을 pull 로 보정하지 않는 것이 요점이다.
    const uow = fakeUow({ pullDates: ['2026-08-04'], studiedDays: 0 })
    expect(studyDays(uow, '2026-08-03')).toEqual({ week: '2026-08-03', days: 0 })
  })

  it('사이가 비어도 각각 센다 — 연속 일수가 아니다 (A21)', () => {
    expect(studyDays(fakeUow({ studiedDays: 2 }), '2026-08-03').days).toBe(2)
  })
})
