/**
 * DB 스키마 — 테이블 6종.
 *
 * **이 파일은 스키마의 원본이 아니다.** 원본은 ADR 이며, 읽는 순서는
 * ADR-011(골격) → ADR-012·013·014(정정) → ADR-018·019·020(실행분) →
 * ADR-030·031·032(측정 시간 전환, 최신)이다.
 * 충돌하면 번호가 큰 쪽이 이긴다. 값·식을 바꿔야 하면 ADR 을 먼저 고친다.
 *
 * 제약을 전부 여기 넣는 이유(ADR-011 §6): SQLite 는 CHECK·FK·NOT NULL 을 나중에
 * 추가하려면 **테이블 재작성**이고, 그 SQL 이 사용자의 실데이터 위에서 앱 시작 시
 * 돌게 된다. 누락의 대가가 완화의 대가보다 훨씬 비싸다.
 */
import { sql, type SQL } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
  type SQLiteColumn
} from 'drizzle-orm/sqlite-core'

import { now } from '../../shared/time'

// ---------------------------------------------------------------------------
// 제약 헬퍼
// ---------------------------------------------------------------------------

/**
 * 순간(ADR-009 §1) 형식 검사 — UTC ISO 8601 밀리초 고정폭.
 *
 * ADR-019 §2: 기존 `GLOB '*Z'` 는 `'Z'` 한 글자도 통과시켰다. `created_at` 은 항목
 * 목록과 정산 3택의 정렬 키이므로, 형식이 섞이면 사전순이 시간순과 어긋난다.
 *
 * **GLOB 만으로는 부족하다 (ADR-021 §2).** GLOB 은 자릿수만 보고 값의 범위를 보지
 * 않으므로 `'2026-13-45T99:99:99.999Z'`(13월 45일 99시)가 통과한다. 그 값이 들어가면
 * `datetime()` 이 NULL 을 반환해 날짜 연산이 조용히 무너지고, 문자열 정렬에서는 모든
 * 정상 값보다 뒤로 밀려 "최신" 조회가 쓰레기 행을 가리킨다.
 *
 * 그래서 `strftime` 왕복 비교를 함께 건다 — 달력 키에서 `IS date(...)` 를 쓴 것과
 * 같은 수법이다. 파싱 실패 시 NULL 이 되고 `IS` 가 NULL-safe 라 FALSE 로 거부된다.
 * 정규화 결과가 입력과 다른 값(`'2026-02-30T...'` → `'2026-03-02T...'`)도 걸린다.
 */
const INSTANT_GLOB =
  '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
const INSTANT_FORMAT = '%Y-%m-%dT%H:%M:%fZ'

const instant = (col: SQLiteColumn): SQL =>
  sql`${col} GLOB ${sql.raw(`'${INSTANT_GLOB}'`)} AND ${col} IS strftime(${sql.raw(`'${INSTANT_FORMAT}'`)}, ${col})`
const nullableInstant = (col: SQLiteColumn): SQL => sql`${col} IS NULL OR (${instant(col)})`

/**
 * 정수 강제 (ADR-021 §1).
 *
 * SQLite 의 INTEGER 친화성은 변환 불가능한 TEXT 를 **거부하지 않고 TEXT 그대로
 * 저장**하고, 값 순서에서 TEXT 는 어떤 정수보다 크므로 `'abc' >= 1` 이 **참**이 된다.
 * 즉 범위 CHECK 만 걸면 `'abc'` 가 통과한다 — `duration_sec = 'abc'` 인 행은
 * `SUM()` 에서 에러 없이 0 으로 취급되어 합계에서 조용히 빠진다.
 *
 * 실수도 막는다. `1.5` 는 `>= 1` 을 통과해 "뽀모 1.5개"를 만든다.
 */
const isInt = (col: SQLiteColumn): SQL => sql`typeof(${col}) = 'integer'`

/**
 * 달력 키 — 날짜(ADR-019 §2).
 *
 * `IS` 는 NULL-safe 비교다. `date()` 가 파싱 실패로 NULL 을 반환해도 결과가 FALSE 가
 * 되어 거부된다. `GLOB '[0-9][0-9][0-9][0-9]-...'` 형태를 쓰면 안 된다 —
 * `'0000-00-00'`·`'9999-99-99'` 가 통과한다.
 */
const dateKey = (col: SQLiteColumn): SQL => sql`${col} IS date(${col})`

/**
 * 달력 키 — 주(월요일 날짜, ADR-010 §2 · ADR-019 §2).
 *
 * ADR-010 이 제시한 `strftime('%w', week) = '1'` 단독 형태는 **fail-open** 이다:
 * strftime 이 NULL 을 반환하면 비교가 NULL 이 되고 CHECK 은 FALSE 일 때만 거부하므로
 * `'garbage'`·`'2026-8-3'`·`'2026-02-30'` 이 전부 통과한다. 앞에 `IS date()` 를 세워
 * 막는다.
 */
const weekKeyCheck = (col: SQLiteColumn): SQL =>
  sql`${col} IS date(${col}) AND strftime('%w', ${col}) = '1'`

/** 달력 키 — 달(`'YYYY-MM'`, ADR-019 §2). */
const monthKeyCheck = (col: SQLiteColumn): SQL => sql`${col} IS strftime('%Y-%m', ${col} || '-01')`

// ---------------------------------------------------------------------------
// settings — 전역 설정 (key/value JSON)
// ---------------------------------------------------------------------------

/**
 * 시딩 목록은 ADR-018 §4 가 소유한다. `weekly_capacity` 는 **시딩하지 않는다** —
 * `[0,0,0,0,0,0,0]` 을 넣으면 "아직 정하지 않았다"와 "예산 0 으로 하겠다"가
 * 데이터에서 구분 불가해진다(pomo-baseline R8).
 *
 * 미설정의 표현은 **키 부재**뿐이다(ADR-018 §5). `value` 는 NOT NULL 이므로 NULL 로는
 * 표현할 수 없고, 값을 지우는 조작은 행을 삭제한다.
 */
export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    // ADR-019 §6: ADR-006 §2 가 mutable 로 지목한 넷 중 settings 만 누락돼 있었다.
    updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdate(now)
  },
  (t) => [
    check('settings_value_json', sql`json_valid(${t.value})`),
    check('settings_updated_at_format', instant(t.updatedAt))
  ]
)

// ---------------------------------------------------------------------------
// milestones — 월 단위 결과물
// ---------------------------------------------------------------------------

/**
 * 삭제는 **물리 삭제**다(ADR-014 §3). 이력 보존은 삭제가 아니라 보관(`archived_at`)이
 * 담당하므로 `deleted_at` 을 두지 않는다.
 *
 * 보관은 **집계에 중립**이다(ADR-014 §4) — 목록 표시에서만 빠지고 달성률 `N/M` 의
 * 분모를 바꾸지 않는다. 분모를 깎으면 월말에 미완료 항목을 보관하는 것만으로
 * "1/3"이 "1/1 달성"이 되어 성공을 조작할 수 있다.
 */
export const milestones = sqliteTable(
  'milestones',
  {
    /** UUID v7 (ADR-006 §1) — 타임스탬프 프리픽스라 `ORDER BY id` 가 시간순이다. */
    id: text('id').primaryKey(),
    /** 달력 키 `'YYYY-MM'` (ADR-009 §1). */
    month: text('month').notNull(),
    title: text('title').notNull(),
    /** 순간. NULL = 미완료. boolean `done` 을 대체한다(ADR-011 §5). */
    completedAt: text('completed_at'),
    sortOrder: integer('sort_order').notNull(),
    /** 순간. NULL = 보관 안 됨. */
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdate(now)
  },
  (t) => [
    check('milestones_month_format', monthKeyCheck(t.month)),
    // 정렬 키다. TEXT 가 섞이면 SQLite 값 순서상 모든 정수보다 뒤로 밀린다 (ADR-021 §1).
    check('milestones_sort_order_int', isInt(t.sortOrder)),
    check('milestones_completed_at_format', nullableInstant(t.completedAt)),
    check('milestones_archived_at_format', nullableInstant(t.archivedAt)),
    check('milestones_created_at_format', instant(t.createdAt)),
    check('milestones_updated_at_format', instant(t.updatedAt))
  ]
)

// ---------------------------------------------------------------------------
// week_items — 주간 항목
// ---------------------------------------------------------------------------

/**
 * `origin_week` 은 항목이 **최초 생성된 주**를 박제한다(ADR-011 §4). 이월 배지
 * "N주째"는 `(week − origin_week)/7 + 1` 한 줄이며, `carry_from_id` 사슬 길이로
 * 세지 않는다 — 건너뛴 주에서 사슬이 끊겨 값이 틀어진다.
 *
 * `is_system = 1` 은 주차별 시스템 "기타" 항목이다(ADR-011 §4). 부모 없는 task(오늘
 * 목록 직접 추가, 사후 캡처로 소급 생성)를 여기 붙여 `tasks.week_item_id` NOT NULL 을
 * 유지한다. 정산 3택에서 제외되며, 실제 필요할 때만 생성된다(lazy).
 *
 * `est_pomos` 는 없다 (ADR-030 §1). 추정 개수는 폐기된 통화이고, 그것을 분모로 삼던
 * 과적 경고·요일 부하도 함께 죽었다.
 */
export const weekItems = sqliteTable(
  'week_items',
  {
    id: text('id').primaryKey(),
    /** 이 항목이 속한 주 (월요일 날짜). */
    week: text('week').notNull(),
    title: text('title').notNull(),
    /**
     * 마일스톤은 물리 삭제이고 연결은 선택이므로 `ON DELETE SET NULL` 이다
     * (ADR-014 §3) — 마일스톤을 지워도 주간 항목은 사라지지 않고 미연결이 된다.
     */
    milestoneId: text('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
    /** 요일 배치 의도 JSON `[0..6]`. 빈 배열 = 미배치. */
    days: text('days').notNull(),
    /** 직전 원본 추적·이력 전용. 배지 계산에 쓰지 않는다(ADR-011 §4). */
    carryFromId: text('carry_from_id').references((): AnySQLiteColumn => weekItems.id),
    /** 최초 생성 주. 이월돼도 승계된다. */
    originWeek: text('origin_week').notNull(),
    /** 0/1. 1 = 시스템 "기타" 항목. */
    isSystem: integer('is_system').notNull().default(0),
    /** 순간. NULL = 미완료. `status` enum 을 대체한다(ADR-011 §5). */
    completedAt: text('completed_at'),
    /** 순간. NULL = 폐기 안 됨. "보내주기"는 이력에 남고 정산 요약에 집계된다. */
    droppedAt: text('dropped_at'),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdate(now),
    /** soft delete (ADR-014 §1). 폐기와 다르다 — 삭제는 목록·집계에서 빠진다. */
    deletedAt: text('deleted_at')
  },
  (t) => [
    check('week_items_week_monday', weekKeyCheck(t.week)),
    check('week_items_origin_week_monday', weekKeyCheck(t.originWeek)),
    /**
     * ADR-019 §3 — `is_system IN (0,1)` 은 ADR-012 §4 의 차액 정의를 지키는 제약이다.
     * `is_system = 7` 인 행은 `= 0` 술어에도 `= 1` 술어에도 걸리지 않아 "이중 계상도
     * 누락도 산술적으로 불가능"이라던 성질을 깨뜨린다.
     */
    check('week_items_is_system_bool', sql`${t.isSystem} IN (0, 1)`),
    check('week_items_days_json', sql`json_valid(${t.days}) AND json_type(${t.days}) = 'array'`),
    check('week_items_completed_at_format', nullableInstant(t.completedAt)),
    check('week_items_dropped_at_format', nullableInstant(t.droppedAt)),
    check('week_items_created_at_format', instant(t.createdAt)),
    check('week_items_updated_at_format', instant(t.updatedAt)),
    check('week_items_deleted_at_format', nullableInstant(t.deletedAt)),
    /**
     * ADR-019 §8 — `(week)` 단독에서 `(week, created_at)` 으로. 주간 카드·정산 3택
     * 조회의 임시 정렬이 사라진다.
     */
    index('idx_week_items_week_created').on(t.week, t.createdAt),
    /**
     * ADR-019 §7 — "한 주에 시스템 기타 항목은 최대 1개"를 앱 규율에서 DB 강제로
     * 옮긴다. 표현할 수 있는 불변식은 DB 로 옮긴다.
     */
    /**
     * `deleted_at IS NULL` 조건은 ADR-021 §4 가 추가했다. `is_system = 1` 만 보면
     * 소프트 삭제된 기타 항목이 그 주의 자리를 계속 차지해, 사후 캡처의 lazy 생성이
     * UNIQUE 위반으로 영구히 막힌다.
     *
     * ADR-011 §4 가 기타 항목을 "편집·삭제 불가"로 뒀고 v1 에 `deleted_at` 을 세우는
     * UI 가 없어 **현재는 도달 불가 경로**다. 그럼에도 지금 넣는 이유는 비용 차이다 —
     * 지금은 인덱스 정의 한 줄이고, 나중에는 인덱스 재작성이다 (ADR-019 §8 의
     * "비용이 0 인 것만 지금 한다" 기준).
     */
    uniqueIndex('idx_week_items_one_system')
      .on(t.week)
      .where(sql`${t.isSystem} = 1 AND ${t.deletedAt} IS NULL`)
  ]
)

// ---------------------------------------------------------------------------
// tasks — 일 단위 조각
// ---------------------------------------------------------------------------

/**
 * `week_item_id` 는 NOT NULL 이다. 부모가 없는 조각은 시스템 "기타" 항목에 붙는다.
 *
 * `pulled_date` 는 없다 — `task_pulls` 행으로 승격됐다(ADR-011 §2). 단일 컬럼이면
 * 재-pull 때 과거 이력이 덮여 지난 날짜 패널이 거짓말을 한다.
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    weekItemId: text('week_item_id')
      .notNull()
      .references(() => weekItems.id),
    title: text('title').notNull(),
    /** 순간. NULL = 미완료 (ADR-011 §5). */
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdate(now),
    deletedAt: text('deleted_at')
  },
  (t) => [
    check('tasks_completed_at_format', nullableInstant(t.completedAt)),
    check('tasks_created_at_format', instant(t.createdAt)),
    check('tasks_updated_at_format', instant(t.updatedAt)),
    check('tasks_deleted_at_format', nullableInstant(t.deletedAt)),
    index('idx_tasks_week_item').on(t.weekItemId)
  ]
)

// ---------------------------------------------------------------------------
// sessions — 타이머 1회 완료
// ---------------------------------------------------------------------------

/**
 * `local_date`·`local_week` 는 **insert 시 1회 계산 후 불변**이다(ADR-009 §2).
 * 조회 시 `strftime()` 으로 파생하면 타임존을 옮겼을 때 과거 기록이 소급 이동하고
 * 인덱스가 무효화된다. 귀속 기준은 `started_at` 의 로컬 날짜다.
 *
 * `updated_at` 이 있는 것은 ADR-006 §2("sessions 는 append-only 라 제외")를 ADR-011 §3
 * 이 뒤집은 결과다 — 사후 캡처가 기존 세션의 `task_id`·`note` 를 UPDATE 한다.
 *
 * `deleted_at` 은 없다(ADR-014 §2). 세션은 벌어진 사실이고 v1 에 삭제·수정 UI 가 없다.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    /** 순간. 세션의 날짜 귀속 기준 컬럼. */
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at').notNull(),
    /** 실제 경과 초. 단위는 컬럼명 접미사로 강제한다(ADR-009 §1). */
    durationSec: integer('duration_sec').notNull(),
    /**
     * drizzle 의 `enum` 은 **TypeScript 타입일 뿐 SQL 제약을 만들지 않는다.**
     * ADR-011 §6 이 요구한 `kind IN (...)` 은 아래 CHECK 이 담당한다.
     */
    kind: text('kind', { enum: ['focus', 'short', 'long'] }).notNull(),
    /** NULL = 미분류 집중. */
    taskId: text('task_id').references(() => tasks.id),
    /** 사후 캡처 한 줄. */
    note: text('note'),
    /** 달력 키. `started_at` 의 로컬 날짜, 기록 시 1회 계산. */
    localDate: text('local_date').notNull(),
    /**
     * 그 날짜가 속한 주(월요일 날짜). ADR-012 §1 의 집계 술어
     * `sessions.local_week = week_items.week` 가 이 컬럼을 쓴다.
     *
     * **FK 가 없다.** ADR-019 §4 는 이 컬럼을 `weeks(week)` 에 묶어 "세션이 있는 주는
     * 반드시 자기 스냅샷을 가진다"를 DB 로 강제했지만, 지킬 스냅샷 자체가 폐기된
     * 통화와 함께 사라졌다 (ADR-030 §4). 값의 유효성은 아래 두 CHECK 이 계속 본다 —
     * 월요일인가(`sessions_local_week_monday`), `local_date` 와 짝이 맞는가
     * (`sessions_local_calendar_consistent`).
     */
    localWeek: text('local_week').notNull(),
    updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdate(now)
  },
  (t) => [
    check('sessions_kind_enum', sql`${t.kind} IN ('focus', 'short', 'long')`),
    check('sessions_started_at_format', instant(t.startedAt)),
    check('sessions_ended_at_format', instant(t.endedAt)),
    check('sessions_updated_at_format', instant(t.updatedAt)),
    check('sessions_ended_after_started', sql`${t.endedAt} >= ${t.startedAt}`),
    check('sessions_duration_range', sql`${isInt(t.durationSec)} AND ${t.durationSec} >= 0`),
    check('sessions_local_date_format', dateKey(t.localDate)),
    check('sessions_local_week_monday', weekKeyCheck(t.localWeek)),
    /**
     * 두 달력 키의 **정합성** (ADR-022 §2). 위 두 CHECK 은 각 값이 혼자 유효한지만 보므로
     * `local_date = '1999-01-01'` + `local_week = '2026-08-03'` 이 통과한다. 캘린더는
     * `local_date` 를, 집계·정산은 `local_week` 를 읽는데(ADR-012 §1) 검산식
     * `주간 총 소진 = Σ(항목 소진) + 미분류` 가 `local_week` 만 쓰므로 어긋나도 신호가 없다.
     *
     * `'-6 days'` 를 **먼저** 두는 것이 이 식의 전부다. SQLite 의 `weekday 1` 은 이미
     * 월요일이면 이동하지 않으므로 `'weekday 1','-7 days'` 는 월요일 입력에 전주 월요일을
     * 낸다 — 40,000일 중 5,714일(모든 월요일) 오답이다 (ADR-021 §5 의 식이 이것이었다).
     *
     * NULL-safe 를 위해 `IS` 를 쓴다. 다만 `IS` 는 "둘 다 NULL 이면 통과"를 만들므로,
     * 이 CHECK 의 방어는 **두 컬럼의 NOT NULL 선언에 의존한다.** 둘 중 하나라도 nullable
     * 로 바꾸면 이 제약은 조용히 fail-open 한다.
     */
    check(
      'sessions_local_calendar_consistent',
      sql`${t.localWeek} IS date(${t.localDate}, '-6 days', 'weekday 1')`
    ),
    index('idx_sessions_local_date').on(t.localDate),
    index('idx_sessions_local_week').on(t.localWeek),
    /**
     * ADR-019 §8 — 부분 인덱스. 미분류 집중 행(`task_id IS NULL`)은 `task_id` 로
     * 조회되지 않으므로 인덱스에 담지 않는다.
     */
    index('idx_sessions_task')
      .on(t.taskId)
      .where(sql`${t.taskId} IS NOT NULL`)
  ]
)

// ---------------------------------------------------------------------------
// task_pulls — "그날 오늘 목록에 있었다"는 사실
// ---------------------------------------------------------------------------

/**
 * 행으로 승격된 이유(ADR-011 §2): `tasks.pulled_date` 단일 컬럼이면 재-pull 때 과거
 * 이력이 덮여 지난 날짜 패널이 거짓말을 한다.
 *
 * 세 컬럼은 ADR-019 §5 가 추가했다.
 * - `removed_at` — today-tasks R13 은 ×(빼기)를 그날 세션 유무로 가른다. 세션이 1건
 *   이상이면 행을 지우지 않고 "목록에서 치움" 표시만 남긴다. 행 있음/없음 두 상태로는
 *   이걸 표현할 수 없고, 지우면 A13 이 안 지우면 A1 이 깨져 우회가 불가능하다.
 * - `created_at` — today-tasks R4 의 2차 정렬 키. 없으면 암묵적 `rowid` 에 의존하게
 *   되고, 재-pull 을 `removed_at ← NULL` 로 처리했을 때 정렬이 보존되지 않는다.
 * - `updated_at` — `removed_at` 이 생기는 순간 이 테이블은 append-only 가 아니다.
 */
export const taskPulls = sqliteTable(
  'task_pulls',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    /** 달력 키. 항상 오늘 날짜다 — 미래 날짜 pull 은 v1 비범위(ADR-012 §2). */
    pullDate: text('pull_date').notNull(),
    /** 순간. NULL = 오늘 목록에 표시 중. */
    removedAt: text('removed_at'),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdate(now)
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.pullDate] }),
    check('task_pulls_pull_date_format', dateKey(t.pullDate)),
    check('task_pulls_removed_at_format', nullableInstant(t.removedAt)),
    check('task_pulls_created_at_format', instant(t.createdAt)),
    check('task_pulls_updated_at_format', instant(t.updatedAt)),
    /**
     * ADR-019 §8 — PK 가 `(task_id, pull_date)` 순이라 `pull_date` 단독 조회는 선행
     * 컬럼을 못 쓴다. 날짜 패널이 실제로 그 조회를 하므로 만든다.
     * (calendar-records 의 "v1 에서 추가하지 않는다" 메모는 이 결정으로 폐기됐다.)
     */
    index('idx_task_pulls_date').on(t.pullDate)
  ]
)
