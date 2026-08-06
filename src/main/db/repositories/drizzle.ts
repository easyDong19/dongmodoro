import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { settings } from '../schema'
import type { Repositories, UnitOfWork } from '../../services/ports'

/** Drizzle 의 트랜잭션 핸들. `db` 와 같은 질의 API 를 갖지만 타입이 다르다. */
type Tx = Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0]

function makeRepos(tx: Tx): Repositories {
  return {
    settings: {
      get: (key) =>
        tx.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
          ?.value ?? null,

      set: (key, value) => {
        // updated_at 은 스키마의 $onUpdate 가 갱신하지만, 그것은 UPDATE 경로에만 걸린다.
        // upsert 의 INSERT 분기와 충돌 분기 양쪽에서 값을 주어야 두 경로가 같아진다.
        tx.insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } })
          .run()
      },

      updatedAt: (key) =>
        tx
          .select({ updatedAt: settings.updatedAt })
          .from(settings)
          .where(eq(settings.key, key))
          .get()?.updatedAt ?? null
    }
  }
}

/**
 * Drizzle/better-sqlite3 위의 UnitOfWork 구현체 (ADR-015 §3).
 *
 * `db.transaction()` 에 넘기는 콜백은 동기다 — async 콜백은 `drizzle-orm#2275` 때문에
 * 트랜잭션이 커밋된 뒤에 실행된다. 포트가 동기인 이유가 이것이다.
 *
 * 중첩은 막는다. better-sqlite3 는 savepoint 로 중첩을 지원하지만, 유스케이스 하나가
 * 트랜잭션 하나(ADR-007)이므로 중첩은 호출 실수를 뜻한다. 조용히 동작하게 두면 안쪽
 * `run` 이 끝날 때 커밋된 것으로 오해하기 쉽다.
 */
export function makeDrizzleUow(db: BetterSQLite3Database): UnitOfWork {
  let inTransaction = false
  return {
    run: (work) => {
      if (inTransaction) {
        throw new Error(
          'UnitOfWork.run cannot nest — one use case is one transaction (ADR-007). ' +
            'Pass the existing repos down instead of opening another unit of work.'
        )
      }
      inTransaction = true
      try {
        return db.transaction((tx) => work(makeRepos(tx)))
      } finally {
        inTransaction = false
      }
    }
  }
}
