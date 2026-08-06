import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork } from '../../services/ports'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

/**
 * 테스트 대역은 **인메모리 실 SQLite 하나**다 (ADR-023 §3). 페이크를 두지 않는 이유는
 * 여기 세우는 비용이 0.54ms 라 아껴줄 시간이 없고, `Map` 페이크가 CHECK 44개를 재현하지
 * 못해 아래 제약 검증 테스트를 스위트에서 밀어내기 때문이다.
 */
function drizzleUowOnMemoryDb(): UnitOfWork {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  return makeDrizzleUow(db)
}

/**
 * 두 번째 구현체가 실제로 필요해지는 날(ADR-023 §4 의 재개 조건) 이 함수를 한 번 더
 * 호출하면 그대로 계약 테스트가 된다.
 */
function suite(name: string, make: () => UnitOfWork): void {
  describe(`SettingsRepository — ${name}`, () => {
    it('returns null for a missing key', () => {
      const uow = make()
      expect(uow.run((r) => r.settings.get('nope'))).toBeNull()
    })

    it('set then get round-trips, and set overwrites', () => {
      const uow = make()
      uow.run((r) => r.settings.set('focus_min', '25'))
      expect(uow.run((r) => r.settings.get('focus_min'))).toBe('25')
      uow.run((r) => r.settings.set('focus_min', '50'))
      expect(uow.run((r) => r.settings.get('focus_min'))).toBe('50')
    })

    it('commits every write when work returns', () => {
      const uow = make()
      uow.run((r) => {
        r.settings.set('a', '1')
        r.settings.set('b', '2')
      })
      expect(uow.run((r) => [r.settings.get('a'), r.settings.get('b')])).toEqual(['1', '2'])
    })

    it('rolls back every write when work throws', () => {
      const uow = make()
      uow.run((r) => r.settings.set('kept', '1'))
      expect(() =>
        uow.run((r) => {
          r.settings.set('kept', '"changed"') // value 는 JSON 이다 — 맨 문자열은 CHECK 에 걸린다
          r.settings.set('added', '1')
          throw new Error('boom')
        })
      ).toThrow('boom')
      expect(uow.run((r) => r.settings.get('kept'))).toBe('1')
      expect(uow.run((r) => r.settings.get('added'))).toBeNull()
    })

    it('returns the value work produced', () => {
      const uow = make()
      expect(uow.run(() => 42)).toBe(42)
    })

    it('refuses to nest (ADR-023 — one use case, one transaction)', () => {
      const uow = make()
      expect(() => uow.run(() => uow.run(() => 1))).toThrow(/nest/i)
    })
  })
}

suite('drizzle', drizzleUowOnMemoryDb)

/**
 * 실 DB 라서 쓸 수 있는 테스트. 페이크를 뒀다면 두 구현체의 공통분모 밖이라 계약
 * 스위트에서 빠졌을 것들이다 (ADR-023 Consequences).
 */
describe('SettingsRepository — 실 DB 제약', () => {
  it('rejects a non-JSON value (settings_value_json)', () => {
    const uow = drizzleUowOnMemoryDb()
    expect(() => uow.run((r) => r.settings.set('k', 'not json'))).toThrow(/CHECK/)
  })

  it('accepts a JSON scalar — settings.value is JSON, not an object (ADR-018 §5)', () => {
    const uow = drizzleUowOnMemoryDb()
    uow.run((r) => r.settings.set('k', 'null'))
    expect(uow.run((r) => r.settings.get('k'))).toBe('null')
  })

  it('stamps updated_at in the instant format on write', () => {
    const uow = drizzleUowOnMemoryDb()
    uow.run((r) => r.settings.set('k', '{}'))
    const stamped = uow.run((r) => r.settings.updatedAt('k'))
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
