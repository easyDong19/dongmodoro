import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork } from '../../services/ports'
import { seedSettings } from '../../services/seed'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

export const TEST_BASELINE = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

/**
 * 인메모리 실 SQLite (ADR-023 §3) + FK ON + 마이그레이션 + **설정 시딩**.
 *
 * `seedSettings` 를 포함하는 이유: `effectiveBaseline`(services/baseline.ts)이 그 주
 * `weeks` 스냅샷이 없을 때 settings 의 `focus_min` 을 읽고 **없으면 throw** 한다.
 * 시딩 없이 `confirmWeekPlan` 을 부르면 `missing required setting 'focus_min'` 으로 죽는다.
 *
 * 기존 테스트 3개(`seed.test.ts`·`settings.test.ts`·`today.test.ts`)는 각자 로컬
 * 헬퍼를 갖고 있고 여기로 옮기지 않았다 — 옮기면 M3a 가 M2 테스트까지 건드린다.
 */
export function testUow(): { uow: UnitOfWork; db: ReturnType<typeof drizzle> } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  const uow = makeDrizzleUow(db)
  seedSettings(uow)
  return { uow, db }
}

/**
 * `sessions.local_week` 는 `weeks.week` 를 참조하는 FK 다 (schema.ts, ADR-019 §4).
 * 세션을 넣기 전에 그 주 행이 없으면 `FOREIGN KEY constraint failed` 로 죽는다.
 * **주 경계를 넘기는 테스트(A10)는 두 주를 모두 만들어야 한다.**
 */
export function ensureWeeks(uow: UnitOfWork, ...weekKeys: readonly string[]): void {
  uow.run((repos) => {
    for (const week of weekKeys) repos.weeks.ensure(week, TEST_BASELINE)
  })
}
