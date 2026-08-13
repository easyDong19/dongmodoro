import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork, WeekSnapshot } from '../../services/ports'
import { globalBaseline, writeBaseline } from '../../services/baseline'
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

function seededUow(): UnitOfWork {
  const uow = drizzleUowOnMemoryDb()
  seedSettings(uow)
  return uow
}

const WEEK = '2026-08-03'
const NEXT_WEEK = '2026-08-10'

describe('globalBaseline — 길이의 유일한 저장소 (ADR-029 §2)', () => {
  it('시딩된 전역값을 그대로 읽는다', () => {
    expect(seededUow().run(globalBaseline)).toEqual({
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15
    })
  })

  /**
   * 옛 `유효 베이스라인(week)` 계약은 그 주 `weeks` 스냅샷을 전역값보다 먼저 읽었고,
   * 그래서 주중에 길이를 바꾸면 타이머가 이전 길이로 계속 돌았다 — 사용자에게 "저장이
   * 안 된다"로 읽힌 동작이다 (ADR-029 Context). 폴백이 되살아나면 이 테스트가 깨진다.
   */
  it('그 주에 스냅샷이 있어도 전역값이 이긴다 — 폴백이 없다', () => {
    const uow = seededUow()
    uow.run((repos) => repos.weeks.ensure(WEEK, snapshot({ focusMin: 50 })))

    expect(uow.run(globalBaseline).focusMin).toBe(25)
  })
})

describe('weeks.ensure — 행 생성 (weekly-review R37)', () => {
  /**
   * 행 생성 경로는 남아 있다 — `sessions.local_week` 가 `weeks.week` 를 FK 로 참조하기
   * 때문이다 (ADR-019 §6). 다만 채우는 값은 길이 3종뿐이고 계획 의사는 항상 NULL 이다
   * (ADR-030 — 가용량·예산은 폐기된 통화).
   */
  it('계획 의사 컬럼을 NULL 로 둔다', () => {
    const uow = seededUow()
    uow.run((repos) => {
      repos.weeks.ensure(WEEK, snapshot())
      expect(repos.weeks.plan(WEEK)).toEqual({ capacity: null, budget: null, plannedAt: null })
    })
  })

  it('이미 있는 행은 덮어쓰지 않는다 — 멱등하다', () => {
    const uow = seededUow()
    uow.run((repos) => {
      repos.weeks.ensure(WEEK, snapshot({ focusMin: 25 }))
      repos.weeks.ensure(WEEK, snapshot({ focusMin: 50 }))

      expect(repos.weeks.baseline(WEEK)?.focusMin).toBe(25)
    })
  })
})

describe('writeBaseline — 길이 3종만 갱신한다 (ADR-029 §1)', () => {
  const form = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

  it('저장된 값을 그대로 돌려준다 — 화면이 추측하지 않는다', () => {
    expect(writeBaseline(seededUow(), { ...form, focusMin: 50 })).toEqual({
      focusMin: 50,
      shortBreakMin: 5,
      longBreakMin: 15
    })
  })

  /**
   * 가용량은 폐기된 통화다 (ADR-030). 이 경로가 되살아나면 Task 5 의 `settings` 행
   * DELETE 뒤에 아무도 읽지 않는 키가 다시 생긴다.
   */
  it('`weekly_capacity` 를 쓰지 않는다', () => {
    const uow = seededUow()
    writeBaseline(uow, { ...form, focusMin: 50 })

    expect(uow.run((repos) => repos.settings.get('weekly_capacity'))).toBeNull()
  })

  /**
   * ADR-029 §1 의 본체 — 저장이 곧 효력이다. 어느 주에 스냅샷이 있든 없든 다음에 읽히는
   * 값은 방금 저장한 값 하나뿐이다.
   */
  it('스냅샷이 있는 주가 섞여 있어도 바뀐 값이 즉시 읽힌다', () => {
    const uow = seededUow()
    uow.run((repos) => {
      repos.weeks.ensure(WEEK, snapshot())
      repos.weeks.ensure(NEXT_WEEK, snapshot())
    })

    writeBaseline(uow, { ...form, focusMin: 50 })

    expect(uow.run(globalBaseline).focusMin).toBe(50)
  })
})
