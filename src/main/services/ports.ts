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

export type Baseline = { focusMin: number; shortBreakMin: number; longBreakMin: number }

export type WeekPlan = {
  /** NULL = "기록 없음". 0 은 "예산 0 으로 하겠다"는 별개 사실이다 (ADR-018 §1). */
  budget: number | null
  /** 요일별 가용 뽀모 `[월..일]`. 미설정이면 null. M3a 에서는 항상 null 이다. */
  capacity: number[] | null
  /** 최초 확정 시각. 주중 재수정으로 갱신하지 않는다 (week-plan R23). */
  plannedAt: string | null
}

export interface WeeksRepository {
  /** 그 주 스냅샷 3종. 행이 없으면 null (폴백은 여기서 하지 않는다 — baseline.ts 소관). */
  baseline(week: string): Baseline | null
  /** 행이 없을 때만 생성 + 길이 3종 박제 (ADR-013 §2). capacity·budget 은 NULL (ADR-018 §1). 멱등. */
  ensure(week: string, baseline: Baseline): void
  /** 그 주 계획 스냅샷. 행이 없으면 null. */
  plan(week: string): WeekPlan | null
  /** 예산 저장 + `planned_at` 최초 1회만 기록. 행이 없으면 아무 것도 하지 않는다. */
  setPlan(week: string, budget: number | null): void
}

export interface WeekItemsRepository {
  /** 그 주 시스템 "기타" 항목 id. 없으면 생성 (lazy — ADR-011 §4, est=0, days=[]). */
  ensureSystemItem(week: string): string
  /** 완료 토글용 — task 의 부모 항목 주 (초크포인트 payload 용). 없으면 null. */
  weekOf(weekItemId: string): string | null
}

export type TodayRow = {
  taskId: string
  title: string
  /** 부모 주간 항목명. 기타 항목이면 null (화면이 "기타"로 렌더). */
  sourceTitle: string | null
  sourceWeek: string
  estPomos: number | null
  /** 그 task 에 연결된 focus 세션 수 — 저장값이 아니라 파생 (원칙 8, today-tasks R3). */
  spentPomos: number
  completedAt: string | null
  pulledAt: string
}

export interface TodayRepository {
  /** 오늘 목록 (R1): removed_at IS NULL 인 pull 행 × deleted_at IS NULL 인 task. 정렬은 서비스가 한다. */
  list(dayKey: string): TodayRow[]
  /** upsert — 치웠던 행 재-pull 은 removed_at ← NULL (R14). 완료 task 거부는 서비스가 한다 (R7). */
  pull(taskId: string, dayKey: string): void
  /** R13: 그날 그 task 의 focus 세션 유무로 분기 — 있으면 removed_at 마킹, 없으면 행 삭제. */
  remove(taskId: string, dayKey: string): 'marked' | 'deleted'
}

export interface TasksRepository {
  create(t: {
    id: string
    weekItemId: string
    title: string
    estPomos?: number
    completedAt?: string
  }): void
  /** completed ↔ 미완료 토글. 반환은 토글 후 completedAt. task 없으면 throw. */
  toggleComplete(taskId: string): string | null
  titleOf(taskId: string): string | null
  /**
   * 오늘 목록 유스케이스가 필요로 하는 최소 스냅샷 (pull 의 R7 완료 거부,
   * pull·remove·toggleComplete 의 부모 주 조회용 `weekItemId`). 없으면 null.
   */
  get(taskId: string): { weekItemId: string; completedAt: string | null } | null
}

export type SessionRow = {
  id: string
  startedAt: string
  endedAt: string
  durationSec: number
  kind: 'focus' | 'short' | 'long'
  taskId: string | null
  localDate: string
  localWeek: string
}

export interface SessionsRepository {
  insert(row: SessionRow): void
  /** 사후 캡처 (ADR-011 §3): 세션의 task_id·note 갱신. */
  attachTask(sessionId: string, taskId: string, note: string): void
  get(sessionId: string): SessionRow | null
  /** 세션 라벨 "N번째 집중" — 그 날짜의 focus 세션 수. */
  countFocusOn(dayKey: string): number
  /** 사이클 S10 파생: 마지막 long 세션 이후의 focus 세션 수 (자정 경계에서 끊기지 않는다). */
  focusCountSinceLastLong(): number
}

export interface Repositories {
  settings: SettingsRepository
  weeks: WeeksRepository
  weekItems: WeekItemsRepository
  today: TodayRepository
  tasks: TasksRepository
  sessions: SessionsRepository
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
