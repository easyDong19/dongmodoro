import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { testUow } from './test-helpers'
import type { Repositories } from '../../services/ports'

// 2026-08-03(월) ~ 08-09(일) 한 주. 8/31 주는 9/6 까지 이어지므로 달 경계 테스트에 쓴다.
const W1 = '2026-08-03'
const W_AUG_LAST = '2026-08-31'

function session(
  id: string,
  taskId: string | null,
  localDate: string,
  localWeek: string,
  kind: 'focus' | 'short' | 'long' = 'focus'
) {
  return {
    id,
    startedAt: `${localDate}T01:00:00.000Z`,
    endedAt: `${localDate}T01:25:00.000Z`,
    durationSec: 1500,
    kind,
    taskId,
    localDate,
    localWeek
  }
}

/** 조각 하나를 만들어 id 를 돌려준다. task 는 부모 할당이 있어야 하므로 시스템 항목에 매단다. */
function makeTask(repos: Repositories, week: string, title: string): string {
  const weekItemId = repos.weekItems.ensureSystemItem(week)
  const id = uuidv7()
  repos.tasks.create({ id, weekItemId, title })
  return id
}

describe('calendar.focusCountsByDate — 범위 조회만 (R3 · A3)', () => {
  it('날짜별 focus 세션 수를 센다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('s1', null, '2026-08-04', W1))
      repos.sessions.insert(session('s2', null, '2026-08-04', W1))
      repos.sessions.insert(session('s3', null, '2026-08-06', W1))

      expect(repos.calendar.focusCountsByDate('2026-08-01', '2026-08-31')).toEqual([
        { dayKey: '2026-08-04', focusCount: 2 },
        { dayKey: '2026-08-06', focusCount: 1 }
      ])
    })
  })

  it('휴식 세션은 세지 않는다 (R12 · A7)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      for (let i = 0; i < 5; i++) {
        repos.sessions.insert(session(`b${i}`, null, '2026-08-04', W1, 'short'))
      }
      repos.sessions.insert(session('b5', null, '2026-08-04', W1, 'long'))

      expect(repos.calendar.focusCountsByDate('2026-08-01', '2026-08-31')).toEqual([])
    })
  })

  it('미분류 집중(task 연결 없음)도 센다 (R13 · A8)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('s1', null, '2026-08-04', W1))
      expect(repos.calendar.focusCountsByDate('2026-08-01', '2026-08-31')).toEqual([
        { dayKey: '2026-08-04', focusCount: 1 }
      ])
    })
  })

  it('범위 밖 날짜를 담지 않는다 — 경계는 양끝 포함이다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('s1', null, '2026-07-31', '2026-07-27'))
      repos.sessions.insert(session('s2', null, '2026-08-01', '2026-07-27'))
      repos.sessions.insert(session('s3', null, '2026-08-09', W1))

      const rows = repos.calendar.focusCountsByDate('2026-08-01', '2026-08-31')
      expect(rows.map((r) => r.dayKey)).toEqual(['2026-08-01', '2026-08-09'])
    })
  })

  /**
   * A1 — 23:50 시작 → 다음 날 00:15 종료. 귀속은 **시작일**이며, 그 판정은 기록 시점에
   * 이미 끝나 `local_date` 에 박제돼 있다. 조회가 `ended_at` 을 보지 않는다는 것이 요점이다.
   */
  it('자정을 걸친 세션은 시작일에만 잡힌다 (A1)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert({
        id: 's1',
        startedAt: '2026-08-04T14:50:00.000Z',
        endedAt: '2026-08-04T15:15:00.000Z',
        durationSec: 1500,
        kind: 'focus',
        taskId: null,
        localDate: '2026-08-04',
        localWeek: W1
      })

      const rows = repos.calendar.focusCountsByDate('2026-08-01', '2026-08-31')
      expect(rows).toEqual([{ dayKey: '2026-08-04', focusCount: 1 }])
    })
  })
})

describe('calendar.pullDatesIn', () => {
  it('pull 행이 있는 날짜만 돌려준다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const t = makeTask(repos, W1, '설계 문서')
      repos.today.pull(t, '2026-08-04')
      repos.today.pull(t, '2026-08-06')

      expect(repos.calendar.pullDatesIn('2026-08-01', '2026-08-31').sort()).toEqual([
        '2026-08-04',
        '2026-08-06'
      ])
    })
  })

  it('같은 날 여러 조각을 pull 해도 날짜는 하나다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.today.pull(makeTask(repos, W1, 'a'), '2026-08-04')
      repos.today.pull(makeTask(repos, W1, 'b'), '2026-08-04')

      expect(repos.calendar.pullDatesIn('2026-08-01', '2026-08-31')).toEqual(['2026-08-04'])
    })
  })
})

describe('calendar.pulledTasksOn — 원천 1 (R18)', () => {
  it('8/1 에 pull 한 조각을 8/3 에 다시 pull 해도 8/1 에 남는다 (A9)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const t = makeTask(repos, W1, '설계 문서')
      repos.today.pull(t, '2026-08-01')
      repos.today.pull(t, '2026-08-03')

      expect(repos.calendar.pulledTasksOn('2026-08-01').map((r) => r.title)).toEqual(['설계 문서'])
      expect(repos.calendar.pulledTasksOn('2026-08-03').map((r) => r.title)).toEqual(['설계 문서'])
    })
  })

  /**
   * A11 — 치움 표시(`removed_at`)는 "지금 오늘 목록에 없다"는 사실이지 "그날 목록에
   * 없었다"가 아니다. 거르면 그날의 사실이 사라진다.
   */
  it('그날 세션이 있는 조각을 × 로 빼도 그 날짜에 남는다 (A11)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const t = makeTask(repos, W1, '설계 문서')
      repos.today.pull(t, '2026-08-04')
      repos.sessions.insert(session('s1', t, '2026-08-04', W1))

      expect(repos.today.remove(t, '2026-08-04')).toBe('marked')
      expect(repos.calendar.pulledTasksOn('2026-08-04').map((r) => r.title)).toEqual(['설계 문서'])
    })
  })

  it('삭제된 조각은 제외한다', () => {
    const { uow, db } = testUow()
    uow.run((repos) => {
      const t = makeTask(repos, W1, '설계 문서')
      repos.today.pull(t, '2026-08-04')
      // 물리 삭제가 아니라 soft delete 다 (ADR-014 §1) — 포트에 그 경로가 없어 직접 쓴다.
      db.run(sql`UPDATE tasks SET deleted_at = '2026-08-05T00:00:00.000Z'`)
      expect(repos.calendar.pulledTasksOn('2026-08-04')).toEqual([])
    })
  })
})

describe('calendar.sessionTasksOn — 원천 2 (R18)', () => {
  it('그날 세션이 붙은 조각을 준다 — 같은 조각의 세션이 여러 건이어도 한 행이다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const t = makeTask(repos, W1, '설계 문서')
      repos.sessions.insert(session('s1', t, '2026-08-04', W1))
      repos.sessions.insert(session('s2', t, '2026-08-04', W1))

      expect(repos.calendar.sessionTasksOn('2026-08-04').map((r) => r.title)).toEqual(['설계 문서'])
    })
  })

  it('pull 행이 없어도 나온다 — 사후 캡처가 이 경로다 (A10)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      const t = makeTask(repos, W1, '자유 집중 1')
      repos.sessions.insert(session('s1', t, '2026-08-04', W1))

      expect(repos.calendar.pulledTasksOn('2026-08-04')).toEqual([])
      expect(repos.calendar.sessionTasksOn('2026-08-04').map((r) => r.title)).toEqual([
        '자유 집중 1'
      ])
    })
  })

  it('미분류 집중은 조각이 없으므로 목록에 없다 — 점에는 반영되지만 목록에는 행이 없다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('s1', null, '2026-08-04', W1))
      expect(repos.calendar.sessionTasksOn('2026-08-04')).toEqual([])
      expect(repos.calendar.focusCountsByDate('2026-08-01', '2026-08-31')).toEqual([
        { dayKey: '2026-08-04', focusCount: 1 }
      ])
    })
  })
})

describe('calendar.studiedDayCount — 주 단위 (R24)', () => {
  it('서로 다른 날짜 수를 센다 — 같은 날 여러 번은 1일이다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('s1', null, '2026-08-03', W1))
      repos.sessions.insert(session('s2', null, '2026-08-03', W1))
      repos.sessions.insert(session('s3', null, '2026-08-09', W1))

      expect(repos.calendar.studiedDayCount(W1)).toBe(2)
    })
  })

  it('휴식만 있는 날은 세지 않는다', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('b1', null, '2026-08-03', W1, 'short'))
      expect(repos.calendar.studiedDayCount(W1)).toBe(0)
    })
  })

  /**
   * A21 의 앞절 — 일요일과 그 다음 월요일은 **서로 다른 주**다. `local_week` 로 세므로
   * 주 경계가 날짜 범위 계산 없이 갈린다.
   */
  it('일요일과 그 다음 월요일은 다른 주로 갈린다 (A21)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('s1', null, '2026-08-09', W1)) // 일
      repos.sessions.insert(session('s2', null, '2026-08-10', '2026-08-10')) // 다음 월

      expect(repos.calendar.studiedDayCount(W1)).toBe(1)
      expect(repos.calendar.studiedDayCount('2026-08-10')).toBe(1)
    })
  })

  it('달을 넘긴 주도 한 주로 센다 — 주는 쪼개지지 않는다 (R18)', () => {
    const { uow } = testUow()
    uow.run((repos) => {
      repos.sessions.insert(session('s1', null, '2026-08-31', W_AUG_LAST))
      repos.sessions.insert(session('s2', null, '2026-09-02', W_AUG_LAST))

      expect(repos.calendar.studiedDayCount(W_AUG_LAST)).toBe(2)
    })
  })
})

/**
 * A3 — "캘린더 월 조회 쿼리가 `local_date` 범위 조건만 쓰며, 술어에 날짜 함수를 씌우지
 * 않는다." 주석으로 다짐하는 대신 **생성된 SQL 을 직접 본다.**
 *
 * 이 검사가 지키는 것은 성능이 아니라 정확성이다. 술어에 `date()`·`strftime()` 을 씌우면
 * 조회 시점에 날짜를 파생하게 되고(ADR-009 §2 금지), 사용자가 타임존을 옮긴 뒤 과거
 * 캘린더 점이 이동한다 (A2).
 */
describe('calendar 쿼리에 날짜 함수가 없다 (A3)', () => {
  const DATE_FN = /\b(strftime|julianday|datetime|unixepoch)\s*\(|\bdate\s*\(/i

  function captureSql(run: (repos: Repositories) => void): string[] {
    const captured: string[] = []
    const { uow } = testUow({ logQuery: (q) => captured.push(q) })
    captured.length = 0 // 마이그레이션·시딩 쿼리는 검사 대상이 아니다
    uow.run(run)
    return captured
  }

  it('월 조회 3종의 SQL 에 날짜 함수가 0건이다', () => {
    const queries = captureSql((repos) => {
      repos.calendar.focusCountsByDate('2026-08-01', '2026-08-31')
      repos.calendar.pullDatesIn('2026-08-01', '2026-08-31')
      repos.calendar.studiedDayCount('2026-08-03')
    })

    expect(queries.length).toBeGreaterThan(0)
    expect(queries.filter((q) => DATE_FN.test(q))).toEqual([])
  })

  it('날짜 패널 조회 2종도 마찬가지다', () => {
    const queries = captureSql((repos) => {
      repos.calendar.pulledTasksOn('2026-08-04')
      repos.calendar.sessionTasksOn('2026-08-04')
    })

    expect(queries.length).toBeGreaterThan(0)
    expect(queries.filter((q) => DATE_FN.test(q))).toEqual([])
  })
})
