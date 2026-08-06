/**
 * 시작 실패의 세 갈래 (ADR-020 §4). 셋 다 안내 후 `app.quit()` 이며 창을 띄우지 않는다 —
 * DB 없이 뜬 창은 기능이 없는데 사용자는 앱이 정상이라고 오해한다.
 */

/** DB 세대가 앱보다 높다 — 구버전 앱이 신버전 데이터를 깎지 않도록 열지 않는다. */
export class DowngradeError extends Error {}

/**
 * 파일이 성하지 않다. 손상은 **두 시점**에서 드러난다.
 * - `openDb` 가 PRAGMA 를 걸 때 (`SQLITE_CORRUPT`·`SQLITE_NOTADB`)
 * - 열리긴 했지만 `PRAGMA integrity_check` 가 진단을 낼 때
 *
 * 사용자에게는 같은 상황이므로 한 타입으로 모은다.
 */
export class CorruptError extends Error {}

/** 마이그레이션 실행 실패. 백업을 자동 복원하지 않는다 (ADR-020 §4). */
export class MigrationError extends Error {}

/** better-sqlite3 의 SqliteError 는 `code` 로 원인을 구분한다. */
function sqliteCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e
    ? String((e as { code: unknown }).code)
    : undefined
}

/**
 * 열기 실패가 손상인지 판정한다.
 *
 * `SQLITE_CANTOPEN`(권한·경로 문제)은 **손상이 아니다.** 백업 폴더를 안내해봐야 도움이
 * 되지 않으므로 그대로 올려보내 "예상 못한 실패" 경로가 받게 한다.
 */
export function isCorruptionCode(e: unknown): boolean {
  const code = sqliteCode(e)
  return code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB'
}
