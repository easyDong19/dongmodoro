import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork, WeekSnapshot } from '../../services/ports'
import {
  baselineBasis,
  baselineForm,
  effectiveBaseline,
  effectiveBudget,
  writeBaseline
} from '../../services/baseline'
import { seedSettings } from '../../services/seed'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

function drizzleUowOnMemoryDb(): UnitOfWork {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  return makeDrizzleUow(db)
}

describe('effectiveBaseline (pomo-baseline R10·R13)', () => {
  it('falls back to settings (25/5/15) when there is no weeks snapshot', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    const result = uow.run((repos) => effectiveBaseline(repos, '2026-08-03'))
    expect(result).toEqual({ focusMin: 25, shortBreakMin: 5, longBreakMin: 15 })
  })

  it('uses the weeks snapshot when present, even if settings differ', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    const week = '2026-08-03'
    uow.run((repos) => repos.weeks.ensure(week, snapshot({ focusMin: 50 })))
    const result = uow.run((repos) => effectiveBaseline(repos, week))
    expect(result).toEqual({ focusMin: 50, shortBreakMin: 5, longBreakMin: 15 })
  })
})

function snapshot(over: Partial<WeekSnapshot> = {}): WeekSnapshot {
  return {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    capacity: null,
    budget: null,
    ...over
  }
}

describe('weeks.ensure — 스냅샷 5종 박제 (weekly-review R37 · ADR-013 §2)', () => {
  const WEEK = '2026-08-03'

  it('가용량·예산까지 함께 박제한다', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    uow.run((repos) => {
      repos.weeks.ensure(WEEK, snapshot({ capacity: [4, 4, 4, 4, 4, 0, 0], budget: 20 }))
      expect(repos.weeks.plan(WEEK)).toEqual({
        capacity: [4, 4, 4, 4, 4, 0, 0],
        budget: 20,
        plannedAt: null // 정한 것이 아니라 해석된 값이다 — 계획 확정 시각이 아니다
      })
    })
  })

  it('가용량이 미설정이면 두 컬럼을 NULL 로 둔다 (ADR-018 §1)', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    uow.run((repos) => {
      repos.weeks.ensure(WEEK, snapshot())
      expect(repos.weeks.plan(WEEK)).toEqual({ capacity: null, budget: null, plannedAt: null })
    })
  })

  /**
   * A17. 이 규칙 하나가 "지각 정산이 진행 중인 주의 단위를 바꾼다"는 결함을 스키마
   * 레벨에서 닫는다 (ADR-013 §3). 확정이 기존 행에서 건드리는 것은 `settled_at` 뿐이다.
   */
  it('이미 있는 행의 스냅샷 컬럼은 어떤 값으로도 덮어쓰지 않는다', () => {
    const uow = drizzleUowOnMemoryDb()
    seedSettings(uow)
    uow.run((repos) => {
      repos.weeks.ensure(
        WEEK,
        snapshot({ focusMin: 25, capacity: [1, 1, 1, 1, 1, 1, 1], budget: 7 })
      )
      repos.weeks.ensure(
        WEEK,
        snapshot({ focusMin: 50, capacity: [9, 9, 9, 9, 9, 9, 9], budget: 63 })
      )

      expect(repos.weeks.baseline(WEEK)?.focusMin).toBe(25)
      expect(repos.weeks.plan(WEEK)).toMatchObject({ capacity: [1, 1, 1, 1, 1, 1, 1], budget: 7 })
    })
  })
})

/** 주 시작은 월요일 (ADR-010). 계획 대상 주 = `weekOf(오늘 + 1)` 이라 화요일의 대상은 그 주다. */
const NEXT_WEEK = '2026-08-10'
const TUESDAY = '2026-08-04'

function seededUow(): UnitOfWork {
  const uow = drizzleUowOnMemoryDb()
  seedSettings(uow)
  return uow
}

const form = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, capacity: null }

describe('writeBaseline — 전역값만 갱신한다 (pomo-baseline R21·R22)', () => {
  const WEEK = '2026-08-03'

  /**
   * A9. 폼을 열었다 저장하는 것만으로 `weekly_capacity` 가 생기면, "아직 정하지 않았다"가
   * 영구히 "예산 0 으로 하겠다"로 바뀐다. 두 상태를 구분하는 것이 R8 의 전부다.
   */
  it('길이만 바꾸면 가용량은 미설정으로 남는다', () => {
    const uow = seededUow()
    writeBaseline(uow, { ...form, focusMin: 50 })

    expect(uow.run(baselineForm)).toEqual({
      focusMin: 50,
      shortBreakMin: 5,
      longBreakMin: 15,
      capacity: null
    })
  })

  it('가용량을 처음 정하면 그대로 저장되고, 인덱스 0 이 월요일이다', () => {
    const uow = seededUow()
    const capacity = [4, 2, 4, 2, 4, 0, 8]
    writeBaseline(uow, { ...form, capacity })

    expect(uow.run(baselineForm).capacity).toEqual(capacity)
  })

  it('저장된 값을 그대로 돌려준다 — 화면이 추측하지 않는다', () => {
    const uow = seededUow()
    expect(writeBaseline(uow, { ...form, focusMin: 50, capacity: [1, 1, 1, 1, 1, 1, 1] })).toEqual({
      focusMin: 50,
      shortBreakMin: 5,
      longBreakMin: 15,
      capacity: [1, 1, 1, 1, 1, 1, 1]
    })
  })

  /**
   * A17 — **이 기능의 존재 이유다.** 편집이 진행 중인 주에 스며들면 게이지가 이유 없이
   * 움직이고, 화면에 적어 둔 `바꾼 길이는 다음 주부터 적용돼요` 가 거짓말이 된다.
   */
  it('이미 스냅샷이 있는 주의 유효 베이스라인은 변하지 않는다', () => {
    const uow = seededUow()
    uow.run((repos) => repos.weeks.ensure(WEEK, snapshot()))

    writeBaseline(uow, { ...form, focusMin: 50 })

    expect(uow.run((repos) => effectiveBaseline(repos, WEEK))).toEqual({
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15
    })
  })

  /** A18. 효력이 영영 없으면 편집은 아무 의미가 없다 — 다음 주에는 반드시 보여야 한다. */
  it('아직 스냅샷이 없는 다음 주에는 바뀐 값이 읽힌다', () => {
    const uow = seededUow()
    uow.run((repos) => repos.weeks.ensure(WEEK, snapshot()))

    writeBaseline(uow, { ...form, focusMin: 50 })

    expect(uow.run((repos) => effectiveBaseline(repos, NEXT_WEEK)).focusMin).toBe(50)
  })

  /**
   * A20. 예산이 조회 시점에 `sum(capacity)` 로 파생됐다면 이 테스트가 깨진다 — 9월에
   * 가용량을 낮추는 순간 8월 첫 주의 예산 표시가 24 → 10 으로 바뀐다.
   */
  it('가용량을 낮춰도 이미 박제된 과거 주의 예산이 변하지 않는다', () => {
    const uow = seededUow()
    uow.run((repos) =>
      repos.weeks.ensure(WEEK, snapshot({ capacity: [4, 4, 4, 4, 4, 4, 0], budget: 24 }))
    )

    writeBaseline(uow, { ...form, capacity: [2, 2, 2, 2, 2, 0, 0] })

    expect(uow.run((repos) => effectiveBudget(repos, WEEK))).toBe(24)
  })
})

describe('baselineBasis — 시간 비교의 기준 개수 (pomo-baseline R26)', () => {
  const WEEK = '2026-08-03'

  it('계획 대상 주에 예산이 있으면 그 값을 쓴다', () => {
    const uow = seededUow()
    uow.run((repos) =>
      repos.weeks.ensure(WEEK, snapshot({ capacity: [3, 3, 3, 3, 3, 0, 0], budget: 15 }))
    )
    writeBaseline(uow, { ...form, capacity: [9, 9, 9, 9, 9, 9, 9] })

    expect(uow.run((repos) => baselineBasis(repos, TUESDAY))).toEqual({
      basisPomos: 15,
      basisSource: 'budget'
    })
  })

  it('예산이 없으면 가용량 합으로 내려간다', () => {
    const uow = seededUow()
    writeBaseline(uow, { ...form, capacity: [4, 2, 4, 2, 4, 0, 8] })

    expect(uow.run((repos) => baselineBasis(repos, TUESDAY))).toEqual({
      basisPomos: 24,
      basisSource: 'capacity'
    })
  })

  /** A25. 기준이 없는 것은 오류가 아니다 — 화면이 비교를 통째로 생략할 뿐이다. */
  it('둘 다 없으면 기준이 없다고 답한다', () => {
    const uow = seededUow()

    expect(uow.run((repos) => baselineBasis(repos, TUESDAY))).toEqual({
      basisPomos: null,
      basisSource: null
    })
  })
})
