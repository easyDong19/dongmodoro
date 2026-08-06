/**
 * 서비스가 저장소에 요구하는 것 (ADR-015 §1, 근거는 ADR-023 §1).
 *
 * 이 파일은 DB 라이브러리를 import 하지 않는다 — eslint 의 `DB_IMPORT_PATTERN` 이
 * `src/main/db/` 밖에서의 import 를 막는다. 다만 린트가 막는 것은 **import 뿐**이라,
 * `snake_case` 컬럼명·DB nullability·JSON 문자열이 서비스 로직으로 새는 것은 여기
 * 반환 타입이 막아야 한다. 두 장치의 축이 다르다.
 *
 * ⚠️ **포트는 유스케이스 단위로 정의한다** (ADR-015 §1 — consumer-defined).
 * 테이블 모양을 그대로 비추는 `findAll`/`insert`/`update` 류는 인터페이스만 씌운 직접
 * 호출이라 금지다. 아래 `SettingsRepository` 는 그 원칙을 **보여주지 못한다** —
 * `settings` 는 key-value 테이블이라 CRUD 가 곧 유스케이스인 예외다.
 * 실제 도메인 포트를 만들 때 이 모양을 복사하지 말 것:
 *
 *   ❌ findAll(): WeekItemRow[] / update(id, patch)
 *   ⭕ listForPlanner(week): PlannerRow[] / carryOverUnfinished(from, to): void
 */

export interface SettingsRepository {
  /** 없으면 `null`. 값은 JSON 문자열이다 (ADR-018 §5 — 스칼라도 JSON 이다). */
  get(key: string): string | null
  set(key: string, value: string): void
  /** 순간(UTC ISO). 마지막 쓰기 시각. 없으면 `null`. */
  updatedAt(key: string): string | null
}

export interface Repositories {
  settings: SettingsRepository
}

/**
 * 유스케이스 하나 = 트랜잭션 하나(ADR-007)를 포트 세계에서 표현한다. 서비스가 `db` 를
 * 모르면서 원자성을 얻는 장치다.
 *
 * **`work` 도 반환도 동기다** (ADR-015 §3, 근거 보강 ADR-023 §2).
 * - 콜백이 동기여야 하는 이유: better-sqlite3 트랜잭션이 동기다. async 콜백을 넘기면
 *   `drizzle-orm#2275` 에 따라 **트랜잭션이 커밋된 뒤 본문이 실행된다** — 조용한 데이터
 *   무결성 버그다. better-sqlite3 자체도 `Transaction function cannot return a promise`
 *   를 던진다.
 * - 반환까지 동기인 이유: 비동기 저장소로 가는 경로(PowerSync·Triplit·RxDB·Turso)는
 *   전부 이 계층을 통째로 교체하므로, 미리 `Promise` 로 감싸도 얻는 것이 없다.
 *   측정상 오버헤드도 논점이 아니다 (0.404µs → 0.458µs).
 *
 * **중첩할 수 없다.** 유스케이스 하나가 트랜잭션 하나이므로 중첩할 이유가 없고,
 * 허용하면 안쪽 `run` 이 끝날 때 바깥 것까지 커밋되는 것처럼 보이는 혼동이 생긴다.
 */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => T): T
}
