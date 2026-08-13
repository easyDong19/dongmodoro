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

/**
 * `weeks` 행이 처음 생길 때 채워지는 값 (weekly-review R37).
 *
 * **좁혀진 타입이다.** 길이 스냅샷은 아무도 읽지 않고(ADR-029 §2), 계획 의사
 * (`capacity`·`budget`)는 폐기된 통화라 **항상 `null` 로만 쓴다** (ADR-030). 타입으로
 * 못 박아 두면, 값을 되살리는 코드가 컴파일 단계에서 막힌다.
 */
export type WeekSnapshot = Baseline & {
  capacity: null
  budget: null
}

export interface WeeksRepository {
  /** 그 주 스냅샷 3종. 행이 없으면 null (폴백은 여기서 하지 않는다 — baseline.ts 소관). */
  baseline(week: string): Baseline | null
  /**
   * 행이 없을 때만 생성 + 스냅샷 5종 박제 (ADR-013 §2). 멱등.
   *
   * **이미 있는 행의 스냅샷 컬럼은 어떤 값으로도 덮지 않는다** (ADR-013 §3) — 이 한 줄이
   * "지각 정산이 진행 중인 주의 단위를 바꾼다"는 결함을 스키마 레벨에서 닫는다.
   */
  ensure(week: string, snapshot: WeekSnapshot): void
  /** 그 주 계획 스냅샷. 행이 없으면 null. */
  plan(week: string): WeekPlan | null
  /** 예산 저장 + `planned_at` 최초 1회만 기록. 행이 없으면 아무 것도 하지 않는다. */
  setPlan(week: string, budget: number | null): void
}

export type WeekItemRow = {
  id: string
  title: string
  estPomos: number
  /** 요일 배치 의도 `[0..6]`, 0 = 월요일. 빈 배열 = 미배치. */
  days: number[]
  /** 최초 생성 주. 이월 배지 `N주째` 계산의 재료 (R11). */
  originWeek: string
  completedAt: string | null
  /** R8 술어 — 저장값이 아니라 파생. */
  spentPomos: number
  /**
   * 그 항목의 **측정 시간(초)** — `spentPomos` 와 **같은 술어**로 `duration_sec` 를
   * 합한 값이다 (ADR-031 §3). 개수와 초가 같은 세션 집합에서 나와야 두 숫자가
   * 어긋나지 않는다. 반올림하지 않는다 — 분으로 접는 것은 표시 직전 renderer 다.
   */
  measuredSec: number
  childTotal: number
  childDone: number
}

export type PlanDraftItem = {
  /** null = 이 초안에서 새로 추가된 행. 값이 있으면 기존 항목이다. */
  id: string | null
  title: string
  estPomos: number
  days: number[]
}

export interface WeekItemsRepository {
  /** 그 주 시스템 "기타" 항목 id. 없으면 생성 (lazy — ADR-011 §4, est=0, days=[]). */
  ensureSystemItem(week: string): string
  /** 완료 토글용 — task 의 부모 항목 주 (초크포인트 payload 용). 없으면 null. */
  weekOf(weekItemId: string): string | null
  /**
   * 일반 뷰에 표시되는 항목 + 소진. **이 술어의 정의역이 곧 ADR-027 §1 의 Σ 다** —
   * `is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL`.
   * 폐기 항목을 포함시키면 A24 가 깨진다.
   */
  listForWeek(week: string): WeekItemRow[]
  /** 그 주 focus 세션 전체. 폐기·삭제가 줄이지 않는다 (ADR-027 §2). */
  weekTotalSpent(week: string): number
  /**
   * 그 주 **측정 시간 총합(초)** — 완료 focus 세션의 `duration_sec` 합이며 정의역은
   * `weekTotalSpent` 와 같다 (ADR-027 §2 — 폐기·삭제가 줄이지 않는다).
   *
   * 기타 행 차액의 피감수다. **초로 돌려준다** — 분으로 접어 넘기면 차액이 접힌 값에서
   * 계산되어 ADR-031 §2 가 닫으려던 검산 어긋남이 되살아난다.
   */
  weekTotalMeasuredSec(week: string): number
  /** 기타 행 표시 조건 ①② — 미분류 세션 또는 부모 없는 조각이 있는가. ③은 서비스가 본다. */
  hasUnplannedActivity(week: string): boolean
  /**
   * 선언형 확정 (R23·R24). 요청 목록이 그 주 계획의 **전체**다.
   * - `id` 있음 → **ID 로** 매칭해 갱신. 제목 기준 매칭 금지 (제목을 고치면 이력이 끊긴다).
   * - `id` 없음 → 신규 생성, `origin_week = week`.
   * - 기존 항목이 목록에 없음 → `dropped_at` 기록 (폐기, 삭제 아님).
   */
  confirmPlan(input: { week: string; items: readonly PlanDraftItem[] }): {
    createdIds: string[]
    droppedIds: string[]
  }
  /** 드로어 헤더. 폐기 항목도 읽을 수 있다 (listForWeek 로는 못 찾는다). 없으면 null. */
  header(weekItemId: string): { week: string; completedAt: string | null } | null
  childTasks(weekItemId: string, dayKey: string): ChildTaskRow[]
  /** 원클릭 pull 대상. 유자격 조각이 없으면 null (그때 화면은 드로어를 연다). */
  nextPullable(weekItemId: string, dayKey: string): string | null
  // complete/uncomplete 를 두 메서드로 나눈 이유: `setCompleted(id, at | null)` 은
  // `update(id, patch)` 모양이라 이 파일 상단이 금지하는 CRUD 포트다. 유스케이스로 나눈다.
  complete(weekItemId: string, at: string): void
  uncomplete(weekItemId: string): void
  drop(weekItemId: string): void
}

export type ChildTaskRow = {
  taskId: string
  title: string
  estPomos: number | null
  spentPomos: number
  /**
   * 그 조각의 측정 시간(초). **주 조건이 없다** — `spentPomos` 와 같은 술어이며
   * 이유·대가는 today-tasks R3-3 이 소유한다.
   */
  measuredSec: number
  completedAt: string | null
  /** 그 날짜에 활성 pull 행이 있는가 (§6.2 `오늘 목록에`). */
  inToday: boolean
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
  /**
   * 그 조각의 측정 시간(초). `spentPomos` 와 같은 술어라 **주 조건이 없다** —
   * 이월된 조각의 이력이 끊기지 않게 하는 의도된 비대칭이다 (today-tasks R3-3).
   */
  measuredSec: number
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

/** 마일스톤 한 행. **수치 필드가 없다** (milestones R3) — 숫자가 처음 등장하는 레벨은 주다. */
export type MilestoneRow = {
  id: string
  month: string
  title: string
  /** 순간. NULL = 미완료. boolean `done` 을 대체한다 (ADR-011 §5). */
  completedAt: string | null
  /** 순간. NULL = 보관 안 됨. 목록 표시에서만 빼며 집계에 중립이다 (ADR-014 §4). */
  archivedAt: string | null
}

/**
 * 지난달 배지 `N / M` 의 재료 (milestones R21) — **그 달의 스냅샷**이다.
 *
 * `total` 은 **보관 여부와 무관하다.** 보관으로 분모를 깎을 수 있으면 3개 중 1개 완료한
 * 달에서 나머지 2개를 보관하는 것만으로 "1/1 달성"이 되어, 아무것도 더 하지 않고
 * 달성률을 올릴 수 있다 (D4 가 잡은 결함).
 */
export type MilestoneBadge = {
  total: number
  completed: number
  /** 보관 건수. 배지에 `· 보관 K건` 으로 함께 표시된다 (R23). 분모를 바꾸지 않는다. */
  archivedCount: number
}

/** 마일스톤 하나의 주 단위 롤업 재료 (R17). 저장값이 아니라 매번 파생한다. */
export type MilestoneRollupRow = {
  milestoneId: string
  spentPomos: number
  /**
   * 그 주 귀속 측정 시간(초). 연결된 **폐기·삭제되지 않은** 할당들의 측정 시간 합이며,
   * 술어는 `listForWeek` 의 항목 측정 시간과 같아야 한다 (milestones 성공 지표) —
   * 갈리면 마일스톤 롤업과 주간 카드가 같은 사실에 다른 숫자를 말한다.
   */
  measuredSec: number
  /** 그 주의 계획 대비 — 연결된 할당들의 `est_pomos` 합. 0 이면 화면이 분수를 만들지 않는다. */
  plannedPomos: number
}

/**
 * 월 마일스톤 (milestones). 삭제는 **물리 삭제**이며 `deleted_at` 이 없다 (ADR-014 §3).
 *
 * `complete`/`uncomplete` 와 `archive`/`unarchive` 를 각각 두 메서드로 나눈 이유는
 * `WeekItemsRepository` 와 같다 — `setCompleted(id, at | null)` 은 `update(id, patch)`
 * 모양이라 이 파일 상단이 금지하는 CRUD 포트가 된다.
 */
export interface MilestonesRepository {
  /** 그 달의 **보관되지 않은** 마일스톤. 생성 순 고정이다 (R10). */
  listForMonth(month: string): MilestoneRow[]
  /**
   * 그 달의 **보관된** 마일스톤. 목록 본문에는 나오지 않지만(R11), 보관 해제가 지난달
   * 카드에서도 가능해야 하므로(R11 · A20) 화면이 `보관 K건` 뒤에서 펼칠 대상이 필요하다.
   * 이 조회가 없으면 해제는 규칙에만 있고 도달 경로가 없는 기능이 된다.
   */
  listArchivedForMonth(month: string): MilestoneRow[]
  /** 배지 재료. **보관을 거르지 않는다** (R21). */
  badgeCounts(month: string): MilestoneBadge
  /** 제목 복사 후보 (R22) — 그 달의 미완료. **보관 여부와 무관하게** 낸다. */
  carryCandidates(month: string): MilestoneRow[]
  /** 그 달의 다음 생성 순번. 표시 순서의 안정적 tie-break 로만 쓰인다 (R10). */
  nextSortOrder(month: string): number
  create(m: { id: string; month: string; title: string; sortOrder: number }): void
  rename(id: string, title: string): void
  complete(id: string, at: string): void
  uncomplete(id: string): void
  archive(id: string, at: string): void
  unarchive(id: string): void
  /** 물리 삭제. FK 가 `ON DELETE SET NULL` 이라 연결된 할당은 "기타"로 남는다 (R8). */
  remove(id: string): void
  /**
   * 그 달 마일스톤들의 **한 주치** 롤업 (R17). 집계 술어는 ADR-012 §1 그대로 —
   * `sessions.local_week = week_items.week` 인 `kind='focus'` 만 센다.
   *
   * 마일스톤은 어떤 세션도 직접 참조하지 않는다 (R12). 계층은
   * `milestone → week_item → task → session` 한 방향이고, 이 조회가 그 사슬을 탄다.
   */
  rollup(month: string, week: string): MilestoneRollupRow[]
  /**
   * 지금 걸려 있는 연결. **후보 밖일 수 있다** — 이월 승계가 만든 타월 연결이 그것이며,
   * 그것이 다른 달의 마일스톤에 걸린 유일한 합법 경로다 (R15).
   *
   * 새로 연결할 때의 후보(R14 · A12)는 별도 메서드가 아니라 `listForMonth(그 할당의 주가
   * 귀속된 달)` 이다 — 그 메서드가 이미 보관을 거르고 달로 좁힌다.
   */
  linkedMilestone(weekItemId: string): MilestoneRow | null
  setWeekItemMilestone(weekItemId: string, milestoneId: string | null): void
}

/**
 * 날짜 패널 한 행 (calendar-records R18). **두 원천의 합집합**이며 어느 쪽에서 왔는지를
 * 함께 싣는다 — 화면이 출처를 구분해 표시한다.
 *
 * 합집합을 만드는 것은 서비스다. 리포지토리는 두 원천을 각각 조회해 넘기기만 한다
 * (ADR-008 — 도메인 규칙은 리포지토리가 갖지 않는다).
 */
export type DayTaskRow = {
  taskId: string
  title: string
  /**
   * **현재** 완료 상태다 (R19). 대상 날짜 시점의 완료 여부가 아니며, 그 정밀도 손실은
   * 문서가 명시적으로 수용했다 — `completed_at` 은 순간이라 로컬 날짜 비교를 씌우면
   * 타임존을 옮겼을 때 과거 화면의 완료 표시가 뒤집힌다 (ADR-009 §2).
   */
  completedAt: string | null
  /** 원천 1 — 그날 오늘 목록에 있었다 (`task_pulls`). 치움 표시된 행도 포함한다. */
  pulled: boolean
  /** 원천 2 — 그날 그 조각으로 집중했다 (`sessions.local_date`). 사후 캡처가 여기 걸린다. */
  hadSession: boolean
}

/** 날짜별 완료 focus 세션 수. `hasRecord` 술어와 점 등급의 재료다 (R5·R6). */
export type DateFocusCount = {
  dayKey: string
  focusCount: number
}

/**
 * 캘린더 열람 (calendar-records). **읽기 전용**이며 쓰기 메서드를 두지 않는다 (R23).
 *
 * 모든 조회는 `sessions.local_date` 의 **범위 조건**만 쓴다 (R3 · A3) — 술어에
 * `strftime()`·`date()` 를 씌우지 않는다. 씌우면 `idx_sessions_local_date` 가 죽고,
 * 타임존을 바꾼 사용자의 과거 점이 이동한다.
 */
export interface CalendarRepository {
  /** 범위 안에서 focus 세션이 1건 이상인 날짜만. 0건인 날은 행을 만들지 않는다. */
  focusCountsByDate(from: string, to: string): DateFocusCount[]
  /** 범위 안에서 `task_pulls` 행이 있는 날짜. 치움 표시된 행도 센다 (R18). */
  pullDatesIn(from: string, to: string): string[]
  /** 원천 1 — 그날 pull 된 조각. */
  pulledTasksOn(dayKey: string): { taskId: string; title: string; completedAt: string | null }[]
  /** 원천 2 — 그날 세션이 붙은 조각. 미분류 집중은 task 가 없으므로 여기 없다. */
  sessionTasksOn(dayKey: string): { taskId: string; title: string; completedAt: string | null }[]
  /**
   * 그 주에 focus 세션이 있는 **서로 다른 날짜 수** (R24 의 `공부한 날 수`).
   *
   * `local_week` 로 조회한다 — 주 경계 판정을 날짜 범위로 다시 만들면 ADR-010 의 주
   * 정의가 두 곳이 된다.
   */
  studiedDayCount(week: string): number
}

export type ReviewWeekFact = {
  week: string
  /** focus 세션이 있었던 서로 다른 날짜 수. */
  studiedDays: number
  /** 그 주 focus 세션 전체. 폐기·삭제가 줄이지 않는다 (ADR-027 §2). */
  spentPomos: number
  /** 그 주 스냅샷 예산. 행이 없거나 NULL 이면 `null` = "기록 없음" (ADR-018 §1·§2). */
  budget: number | null
  /** 계획에 없던 집중 — **차액**이다. `주 소진 − Σ(목록에 보이는 항목의 소진)`. */
  unplannedPomos: number
}

export type PendingItemRow = {
  id: string
  week: string
  title: string
  /** **항목 est** 다 — 하위 조각 est 의 합이 아니다 (Q13). */
  estPomos: number
  /** 그 항목의 주에 기록된 focus 세션만 (ADR-012 §1). */
  spentPomos: number
  /** 최초 생성 주. 이월 배지 `N주째` 의 재료 — 사슬 길이가 아니다 (Q12). */
  originWeek: string
  /** 이월이 승계한다 (R35). M3b 에서는 항상 null 이다. */
  milestoneId: string | null
}

export type CompletedItemRow = {
  id: string
  week: string
  title: string
  spentPomos: number
}

export interface ReviewRepository {
  /**
   * 기록이 있는 가장 이른 주 = `min(sessions.local_week, week_items.week, weeks.week)`.
   * 아무 기록도 없으면 `null`.
   *
   * 워터마크 부트스트랩의 **유실 폴백**에만 쓴다 (weekly-review R28). 키가 없는데 기록이
   * 이미 있다는 것은 유실·복구된 DB 라는 뜻이고, 그때 `targetWeek − 1주` 로 초기화하면
   * 정산하지 않은 과거 주가 조용히 영구 스킵된다.
   */
  earliestRecordedWeek(): string | null
  /**
   * 3택 대상 건수 (배너 문구용 스칼라). 조회 조건은 `listPending` 과 **같아야 한다** —
   * 갈리면 배너가 말한 건수와 패널이 보여주는 목록이 어긋난다.
   */
  countPending(from: string, to: string): number
  /**
   * 범위 안에서 **기록이 있는 주**만 오름차순으로 (세션 ≥ 1 또는 주간 항목 ≥ 1).
   * 완전히 빈 주는 행을 만들지 않는다 — 기록도 계획도 없는 주에는 해석할 예산조차
   * 없기 때문이다 (ADR-013 §2). 화면은 그런 주를 "N주 쉬었어요" 로만 센다.
   */
  weekFacts(from: string, to: string): ReviewWeekFact[]
  /**
   * focus 세션이 있는 **가장 최근 주**와 그 소진. 없으면 `null`.
   *
   * **정산 범위와 무관하게** 조회한다 (R31) — 공백 기간을 말할 때 "마지막으로 공부한
   * 주"는 범위 밖일 수 있고, 그게 이 값이 존재하는 이유다.
   */
  lastStudied(): { week: string; spentPomos: number } | null
  /**
   * 3택 대상. 주·생성순으로만 정렬한다 — "3주 이상 먼저"는 **표시 정렬**이라 화면이 한다
   * (ux-spec §5.0). 남은 몫·`N주째` 도 여기서 계산하지 않는다: 규칙은 서비스가 갖는다.
   */
  listPending(from: string, to: string): PendingItemRow[]
  /**
   * "끝낸 것들". 기준은 **항목의 `week` 이 범위 안인가**이며 `completed_at` 시각이 범위
   * 밖이어도 포함한다 — 그 항목이 어느 주의 계획이었는지가 기준이다 (ux-spec §4).
   */
  listCompleted(from: string, to: string): CompletedItemRow[]
  /**
   * 확정의 쓰기 전부 — **호출자가 결정을 이미 끝낸 상태**로 들어온다. 클램프·이월 est
   * 계산·예외 흡수는 서비스가 하고 여기는 실행만 한다 (ADR-015 §1).
   *
   * 반드시 트랜잭션 안에서 부른다. 중간 실패 시 반쯤 정산된 상태가 남지 않아야 한다 (R22).
   */
  applySettlement(input: {
    targetWeek: string
    /** 새로 만드는 `weeks` 행에 박제할 값. 이미 있는 행에는 쓰이지 않는다. */
    snapshot: WeekSnapshot
    /** `settled_at` 을 찍을 정산 범위의 주들. */
    rangeWeeks: readonly string[]
    drops: readonly string[]
    carries: readonly { sourceId: string; estPomos: number }[]
    /** 순간 (UTC ISO). 한 번 읽어 넘긴다 (ADR-022 §1). */
    at: string
  }): { carried: { sourceItemId: string; newItemId: string }[] }
}

export interface Repositories {
  settings: SettingsRepository
  weeks: WeeksRepository
  weekItems: WeekItemsRepository
  today: TodayRepository
  tasks: TasksRepository
  sessions: SessionsRepository
  calendar: CalendarRepository
  milestones: MilestonesRepository
  review: ReviewRepository
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
