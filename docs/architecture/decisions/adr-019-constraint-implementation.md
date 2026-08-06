# ADR-019: 스키마 제약 실행분 확정 — CHECK·FK·인덱스와 "남은 몫" 정의 통일

- 상태: accepted (2026-08-05) · **§2·§3·§7 식 정정됨 (2026-08-06, [ADR-021](adr-021-constraint-type-enforcement.md))**
  - **결정은 전부 유효하다** — 식만 정정된다. 본문은 이력으로 그대로 둔다.
  - §2 의 순간 GLOB 은 **자릿수만 보고 값의 범위를 보지 않는다**: `'2026-13-45T99:99:99.999Z'`
    가 순간 컬럼 22개 중 21개에서 통과했다. 실행 형태는 GLOB 에 `IS strftime('%Y-%m-%dT%H:%M:%fZ', col)`
    왕복 비교를 더한 것이며 ADR-021 §2 가 소유한다. **날짜 키의 `IS date(...)` 는 정정 대상이 아니다** — 실증에서 모든 악성 입력을 거부했다.
  - §3 의 값 범위 식은 **타입을 보지 않아 무력화된다**: SQLite 는 INTEGER 컬럼에
    `'abc'` 를 TEXT 로 저장하고 TEXT 는 모든 정수보다 크므로 `'abc' >= 1` 이 참이다.
    실행 형태는 `typeof(x) = 'integer'` 를 함께 거는 것이며 ADR-021 §1 이 소유한다.
  - §3 의 `capacity` 검사는 길이만 본다 — 원소 검사는 ADR-021 §3 이 추가한다.
  - §7 의 부분 UNIQUE 인덱스 조건에 `AND deleted_at IS NULL` 이 더해진다 (ADR-021 §4).
  - §1·§4·§5·§6·§8·§9 는 그대로 유효하다.
- 관계: [ADR-011](adr-011-schema-final.md) §6("제약은 초기 마이그레이션에 전부")의 **결정을
  뒤집지 않고 실행분을 확정한다.** 다만 [ADR-010](adr-010-week-definition.md) 이 제시한
  CHECK 식과 [ADR-011](adr-011-schema-final.md) §7 의 근거 문장 하나는 사실이 아님이
  실증돼, 해당 ADR 의 상태 줄에 정정을 단다. [ADR-018](adr-018-first-run-state.md) 의
  nullable 결정이 여기 제약에 반영돼 있다.
- 결정 근거 원장: [2026-08-05 DB 계층 착수 전 심사](../../decision-log/2026-08-05-db-layer-audit.md)
  §F1 · §D2 · §D3 · §D4 · §R3 · §R4 — 재현 스크립트
  [2026-08-05-constraints-probe.mjs](../../decision-log/2026-08-05-constraints-probe.mjs) 로
  제약 31개 케이스를 확인했다

## Context

ADR-011 §6 은 "NOT NULL·CHECK·FK 를 첫 마이그레이션에 모두 포함한다"고 정했다. 근거는
SQLite 에서 이들을 나중에 추가하려면 **테이블 재작성**이고, 그 SQL 이 실데이터 위에서
앱 시작 시 돌기 때문이다. 그 판단은 옳다. 그런데 착수 전 심사에서 **누락된 것은 판단이
아니라 실행분**임이 드러났다.

### 1. 달력 키 CHECK 4종이 fail-open 이다

ADR-010 은 `CHECK (strftime('%w', week) = '1')` 을 제시하며 "(SQLite 검증 실증)"이라고
표기했다. 실제로 넣어 보면 다음이 **전부 통과**한다:

| 값 | 결과 |
|---|---|
| `'garbage'` · `''` | 통과 |
| `'2026-8-3'` (zero-pad 없음) | 통과 |
| `'2026-02-30'` (없는 날짜) | 통과 |
| `'2026-08-03T09:00:00Z'` (순간을 달력 키에) | 통과 |

SQLite 의 `strftime()` 은 파싱 실패 시 오류가 아니라 **NULL** 을 반환하고, CHECK 제약은
결과가 **FALSE 일 때만** 거부한다 — NULL 은 통과다. 따라서 이 제약은 "월요일인 날짜"가
아니라 "월요일이거나, 아예 날짜가 아닌 값"을 허용한다. 의도와 반대로 작동한다.

실질 피해는 조용한 오답이다. 집계 술어 전체가 `sessions.local_week = week_items.week`
라는 **문자열 동등 비교**이므로([ADR-012](adr-012-aggregation-predicate.md) §1), 한쪽이
`'2026-8-3'` 이고 다른 쪽이 `'2026-08-03'` 이면 조인이 조용히 0건이 되고 그 뽀모는
"계획에 없던 집중"으로 흘러간다. 총합 등식은 여전히 닫히므로 아무도 알아채지 못한다.

IPC 경계의 zod 는 이 값들을 보지 못한다 — `local_week` 은 main 의 `weekKey()` 가,
`origin_week` 은 정산 트랜잭션이 만든다. **DB CHECK 이 main 프로세스 버그에 대한 유일한
방어선이다.**

### 2. 기능 문서가 명시적으로 스키마에 위임한 제약이 없다

- [week-plan R9] — "est 는 정수 ≥ 1. 단 `is_system = 1` 인 기타 항목은 예외로 est = 0.
  **이 예외를 컬럼 제약으로 어떻게 표현하는지는 ADR-011 §6 소관이다.**"
- [pomo-baseline R5] — "길이의 하한은 1분이며 정수만 허용한다. 거부는 경계에서 이뤄진다
  (IPC 스키마 + **SQLite CHECK** — ADR-011 §6)."

현재 스키마에는 `est_pomos = -3`, `focus_min = 0`, `duration_sec = -100`, `days = 'nope'`
가 전부 들어간다. 특히 `is_system = 7` 인 행은 `is_system = 0` 술어에도 `= 1` 술어에도
걸리지 않아 **ADR-012 §4 의 차액 정의에서 양쪽 어디에서도 세어지지 않는다** — "이중
계상도 누락도 산술적으로 불가능"이라던 성질이 깨진다.

### 3. "남은 몫"의 정의가 두 기능 문서에서 다르다

| 문서 | 정의 | 인수 기준 |
|---|---|---|
| weekly-review R14 | 항목 est − 소진, **최소 1** | A9 — 소진이 est 이상인 항목의 남은 몫이 **1** |
| week-plan R9 | `max(0, est − 소진)` | A12 — est 3·소진 5 인 항목의 남은 몫이 **0** |

정산이 항목을 이월할 때 새 항목의 `est_pomos` 에 남은 몫을 그대로 넣는다. 남은 몫이 0 이
될 수 있다면 이월된 항목이 `est = 0` 이 되어 §2 의 제약과 충돌하므로, 제약을 쓰기 전에
이 모순을 닫아야 한다.

### 4. 성공 지표를 강제할 FK 가 빠져 있다

[pomo-baseline] 은 "세션이 있는 주 중 `weeks` 스냅샷이 없는 주가 **0건** — 쿼리로 검증
가능하다"를 성공 지표로 적었다. 그런데 `sessions.local_week → weeks.week` FK 가 없어
분기 하나만 빠뜨려도 조용히 깨진다. 깨지면 "행 없으면 전역값" 폴백으로 **과거 주가 최신
전역값으로 해석**되어 [ADR-013](adr-013-baseline-budget-effect.md) 이 죽인 버그가 되살아난다.

## Decision

### 1. "남은 몫"은 측정값이고, 하한 1 은 이월의 정책이다

- **남은 몫 = `max(0, 항목 est − 항목 소진)`** 으로 통일한다 (week-plan R9 의 값).
  측정값이므로 0 이 될 수 있고, 계획 화면은 그 사실을 그대로 표시한다.
- **이월 est = `max(1, 남은 몫)`** — 하한 1 은 남은 몫의 성질이 아니라 **이월 규칙**이다.
  이월한다는 것은 다음 주에도 계속한다는 뜻이므로 최소 1 을 계획한다.
- "축소해서 이월"의 기본 제안값은 `ceil(이월 est / 2)` 이고 `1 … 이월 est` 로 클램프한다.

수량 정의 안에 정책 하한을 섞은 것이 이번 모순의 원인이었다. 둘을 분리하면 두 화면이
같은 이름으로 다른 값을 말하는 일이 사라진다.

> 이 결정에 따라 weekly-review 의 R14·R15·A9·A10 과 technical-spec 의 파생식 표·응답
> 스키마(`remaining` 의 `min(1)` → `min(0)`)를 같은 PR 에서 갱신한다.

### 2. 달력 키·순간 컬럼 CHECK 을 NULL-safe 형태로 재작성한다

```sql
-- 달력 키 (월요일)         : weeks.week, week_items.week, week_items.origin_week, sessions.local_week
CHECK (week IS date(week) AND strftime('%w', week) = '1')

-- 달력 키 (날짜)           : sessions.local_date, task_pulls.pull_date
CHECK (local_date IS date(local_date))

-- 달 키                    : milestones.month
CHECK (month IS strftime('%Y-%m', month || '-01'))

-- 순간 (nullable 이면 `IS NULL OR` 로 감싼다)
CHECK (started_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
CHECK (ended_at >= started_at)
```

`IS` 는 NULL-safe 비교이므로 `strftime`·`date` 가 NULL 을 반환해도 결과가 FALSE 가 되어
거부된다. 기존 `GLOB '[0-9]…'` 형태는 `'0000-00-00'`·`'9999-99-99'` 를 통과시키므로
날짜 키에는 쓰지 않는다.

순간 컬럼은 21개인데 현재 CHECK 이 있는 것은 `sessions.started_at` 하나뿐이고 그마저
`GLOB '*Z'` 라 `'Z'` 한 글자도 통과한다. **전 순간 컬럼에 위 형식 검사를 적용한다.**
`created_at` 은 항목 목록과 정산 3택의 정렬 키이므로, 형식이 섞이면 사전순이 시간순과
어긋난다.

### 3. 값 범위 제약을 추가한다

```sql
-- weeks (ADR-018 로 nullable 이 된 두 컬럼은 NULL 을 허용하되 값이 있으면 검사한다)
CHECK (budget IS NULL OR budget >= 0)
CHECK (capacity IS NULL OR (json_valid(capacity) AND json_array_length(capacity) = 7))
CHECK (focus_min >= 1 AND short_break_min >= 1 AND long_break_min >= 1)

-- week_items
CHECK (is_system IN (0,1))
CHECK ((is_system = 0 AND est_pomos >= 1) OR (is_system = 1 AND est_pomos = 0))
CHECK (json_valid(days) AND json_type(days) = 'array')

-- tasks
CHECK (est_pomos IS NULL OR est_pomos >= 1)

-- sessions
CHECK (duration_sec >= 0)

-- settings
CHECK (json_valid(value))
```

`is_system IN (0,1)` 은 ADR-012 §4 의 차액 정의를 지키는 제약이다 — 두 술어 사이로
빠져나가는 값이 없어야 "이중 계상도 누락도 불가능"이 성립한다.

### 4. 누락된 FK 하나를 추가한다

```sql
local_week TEXT NOT NULL REFERENCES weeks(week)
```

이것으로 "세션이 있는 주는 반드시 자기 스냅샷을 가진다"(pomo-baseline R17,
[ADR-018](adr-018-first-run-state.md) §3)가 코드 규율에서 **DB 강제**로 바뀐다.
정산 트랜잭션 순서가 이미 "`weeks` 먼저, 세션 나중"(ADR-013 §2)이므로 즉시 성립한다.

**`week_items.week` 에는 같은 FK 를 걸지 않는다.** 정산 확정 트랜잭션이 이월 항목을
먼저 INSERT 하고 계획 대상 주의 `weeks` 행을 나중에 만들기 때문이다. 이 관계는 §6 의
앱 불변식 목록에 남는다.

### 5. `task_pulls` 에 세 컬럼을 추가한다

```sql
removed_at TEXT,              -- 순간. NULL = 오늘 목록에 표시 중
created_at TEXT NOT NULL,     -- 오늘 목록 2차 정렬 키
updated_at TEXT NOT NULL      -- removed_at 이 생겨 mutable 이 됐다
```

- `removed_at` — [today-tasks R13] 은 × 동작을 그날 세션 유무로 가르며, 세션이 1건
  이상이면 **행을 삭제하지 않고 "목록에서 치움" 표시만 남긴다.** 현재 컬럼 집합은
  "행 있음/없음" 두 상태뿐이라 이를 표현할 수 없다. 행을 지우면 A13 이, 안 지우면 A1 이
  깨지므로 우회가 불가능하다. [calendar-records R18] 이 그날 목록의 출처를 구분해
  표시하라고 요구하므로 "세션에서 유도한다"는 대안도 성립하지 않는다 — 가져온 조각이
  "사후 캡처로 생긴 항목"으로 잘못 분류된다.
- `created_at` — [today-tasks R4] 의 2차 정렬 키가 "그 날짜 pull 행의 생성 순서"인데
  이를 담는 컬럼이 없어 암묵적 `rowid` 에 의존하게 된다. 재-pull 을 `removed_at ← NULL`
  로 처리하고 `created_at` 을 보존해야 R14("결과 행은 원래 행과 구분되지 않는다")가
  정렬 순서까지 포함해 성립한다.
- `updated_at` — `removed_at` 이 생기는 순간 이 테이블은 append-only 가 아니게 된다.
  [ADR-006](adr-006-schema-sync-insurance.md) §2 가 mutable 테이블에 `updated_at` 을
  요구한 논리가 그대로 적용된다.

### 6. `settings` 에 `updated_at` 을 추가하고, 전 테이블에 `$onUpdate` 를 건다

ADR-006 §2 는 mutable 테이블로 `tasks`·`week_items`·`milestones`·**`settings`** 넷을
지목했는데 `settings` 가 누락돼 있었다. 워터마크·베이스라인을 담는, 멀티기기에서 가장
충돌 가능성이 높은 테이블이다.

또한 ADR-006 이 지정한 자동 갱신 수단(Drizzle `$onUpdate`)이 어느 컬럼에도 걸려 있지
않다. **모든 `updated_at` 에 `$onUpdate` 를 건다** — 손으로 넣게 두면 누락을 컴파일러가
잡지 못한다.

### 7. 불변식 하나를 DB 로 옮긴다

```sql
CREATE UNIQUE INDEX idx_week_items_one_system ON week_items(week) WHERE is_system = 1;
```

"한 주에 시스템 기타 항목은 최대 1개"(ADR-011 §4)는 앱이 지켜야 할 규율 목록에 있었으나
부분 UNIQUE 인덱스로 표현 가능하다. 표현할 수 있는 불변식은 DB 로 옮긴다.

### 8. 이미 만들 인덱스의 정의만 다듬고, 신설은 미룬다

기준은 **비용이 0 인 것만 지금 한다**이다. 어차피 초기 마이그레이션에서 만들 인덱스의
정의를 바꾸는 것은 공짜지만, 없던 인덱스를 새로 만드는 것은 나중에 `CREATE INDEX`
한 줄로도 되고 테이블 재작성이 아니다.

**지금 반영한다 — 정의를 다듬는 것**

| 인덱스 | 현행 | 변경 | 근거 |
|---|---|---|---|
| `week_items` | `(week)` | **`(week, created_at)`** | 주간 카드·정산 3택 조회의 임시 정렬이 사라진다 (실측) |
| `sessions` | `(task_id)` | **부분** `WHERE task_id IS NOT NULL` | 미분류 집중 행은 `task_id` 로 조회되지 않는다 |

**미룬다 — 신설**

| 쿼리 | 현재 | 언제 |
|---|---|---|
| 마일스톤 달 카드 `month=? ORDER BY sort_order` | 전체 스캔 | 마일스톤 기능 구현 시 |
| 마일스톤 롤업 `week_items WHERE milestone_id=?` | 전체 스캔 | 동상 |

두 쿼리 모두 전체 스캔이 실측으로 확인됐으나, 1인 로컬 앱의 데이터 규모(5년치 약 7MB)에서
체감 지연이 없고 나중에 무료로 추가할 수 있다. **미뤘다는 사실 자체를 잊지 않기 위해
여기 남긴다** — 마일스톤 화면을 만들 때 `EXPLAIN QUERY PLAN` 으로 다시 확인한다.

> [calendar-records] 의 "`pull_date` 선행 인덱스를 v1 에서 추가하지 않는다"는 구현 메모는
> **낡았다.** 날짜 패널이 실제로 그 조회를 하므로 `idx_task_pulls_date` 를 만든다.
> 해당 메모는 같은 PR 에서 삭제한다.

### 9. 선행 ADR 두 곳의 사실 오류를 상태 줄에 정정한다

- [ADR-010](adr-010-week-definition.md) — 제시한 CHECK 식이 fail-open 이며 "(SQLite 검증
  실증)" 표기가 사실이 아니다. **결정(DB 가 월요일 아닌 값을 거부한다)은 유효하고 식만
  정정된다.**
- [ADR-011](adr-011-schema-final.md) §7 — "better-sqlite3 기본 OFF" 는 13.0.3 에서 사실이
  아니다(기본값 1 확인). **`foreign_keys = ON` 을 명시하는 결정은 유지한다** — 버전에
  따라 달라질 수 있는 것에 의존하지 않기 위해서다. 근거 문장만 갱신 대상이다.

두 경우 모두 본문은 이력으로 그대로 두고 상태 줄에만 표기한다 (docs/CLAUDE.md).

## Consequences

- (+) "잘못된 값은 저장 자체가 실패한다"는 ADR-011 의 Consequences 가 **실제로 성립한다.**
  지금까지는 선언일 뿐이었다.
- (+) 성공 지표 한 건(세션 있는 주의 스냅샷 존재)이 검증 쿼리에서 DB 강제로 승격된다.
  앱이 지켜야 하는 불변식 목록에서 두 건(기타 항목 유일성 포함)이 빠진다.
- (+) 두 화면이 "남은 몫"이라는 같은 이름으로 다른 값을 말하는 상태가 해소된다.
- (+) 인덱스 실측에서 전체 스캔 2건이 사라진다.
- (−) 제약이 늘어난 만큼 **정상 동작이 제약에 걸릴 위험**도 생긴다. 특히
  `est_pomos >= 1` 은 이월 est 의 하한 1(§1)에 의존하므로, 그 규칙을 바꾸면 이 제약도
  함께 봐야 한다.
- (−) `json_valid`·`json_array_length` 는 SQLite 의 JSON1 확장에 의존한다. better-sqlite3
  13.0.3 에 내장돼 있음을 확인했으나, 빌드 옵션이 다른 SQLite 로 교체하면 재검토가 필요하다.
- (−) 기능 문서 4곳(weekly-review·week-plan·today-tasks·calendar-records)을 같은 PR 에서
  갱신해야 한다. 문서와 코드가 어긋난 채로 커밋되면 이 ADR 의 의미가 없다.
- (−) 제약을 나중에 완화해야 할 일이 생기면 테이블 재작성이다. 그 위험을 알고도 넣는
  이유는, 완화보다 **누락으로 인한 조용한 데이터 오염**이 훨씬 비싸기 때문이다.
