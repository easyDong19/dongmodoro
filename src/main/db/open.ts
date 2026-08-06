import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { CorruptError, isCorruptionCode } from './errors'

export type OpenedDb = {
  db: BetterSQLite3Database
  sqlite: Database.Database
}

/**
 * DB 파일을 열고 PRAGMA 세트를 건다 (ADR-011 §7).
 *
 * `foreign_keys` 는 better-sqlite3 13 에서 이미 기본값이 1 이지만(ADR-019 §9 실측 —
 * ADR-011 §7 의 "기본 OFF" 는 사실이 아니다) **명시하는 결정은 유지한다.** 버전에 따라
 * 달라질 수 있는 것에 FK 강제를 의존시키지 않는다.
 *
 * 크게 손상된 파일은 `integrity_check` 까지 가지도 못하고 **여기서** 터진다 — `new Database()`
 * 는 지연 열기라 조용히 지나가고 첫 PRAGMA 가 `SQLITE_CORRUPT` 를 던진다(실측). 그래서
 * 손상 판정이 migrate 뿐 아니라 이 함수에도 있어야 한다 (ADR-020 §4).
 */
export function openDb(dbPath: string): OpenedDb {
  const sqlite = new Database(dbPath)
  try {
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('busy_timeout = 5000')
  } catch (e) {
    sqlite.close()
    if (isCorruptionCode(e)) {
      throw new CorruptError(
        `Cannot open the database: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e }
      )
    }
    throw e
  }
  return { db: drizzle(sqlite), sqlite }
}

/**
 * 종료 시 WAL 을 메인 파일로 접고 닫는다 (ADR-020 §5).
 *
 * 정상 종료에서 `-wal` 이 비면 다음 시작이 빨라지고, 강제 종료로 남은 `-wal` 과 구분된다.
 * 강제 종료를 막지는 않는다 — WAL 저널이 그 경우를 위해 존재하며 다음 시작 시 SQLite 가
 * 복구한다. 이미 닫힌 핸들에 다시 불려도 조용히 넘어간다(`before-quit` 이 두 번 도는
 * 경로가 있어도 종료를 막지 않기 위해서다).
 *
 * 체크포인트 실패가 종료를 막지 않는다 — 손상된 DB 를 안내하고 끄는 경로에서도 이 함수가
 * 불리는데, 여기서 던지면 `before-quit` 이 죽어 사용자가 앱을 닫지 못한다.
 */
export function closeDb(sqlite: Database.Database): void {
  if (!sqlite.open) return
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.warn('[db] checkpoint on close failed, closing anyway:', e)
  }
  sqlite.close()
}
