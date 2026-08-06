# ADR-021: 제약 실행분 2차 정정 — 타입 강제·순간 값 범위·capacity 원소

- 상태: accepted (2026-08-06)
- 관계: [ADR-019](adr-019-constraint-implementation.md) 의 **결정을 뒤집지 않고 식을 정정한다.**
  §2(순간 컬럼의 GLOB)와 §3(값 범위 CHECK)이 의도한 것을 실제로 막지 못함이 실증돼,
  ADR-019 의 상태 줄에 정정을 단다. §7(부분 UNIQUE 인덱스)의 조건 하나를 넓힌다.
- 결정 근거: 스키마 구현 직후 **격리 심사 2건** — 문서 대조 심사와 런타임 실증 심사를
  사전 맥락 없는 심사자에게 각각 맡겼다. 재현 스크립트
  [2026-08-06-schema-probe.mjs](../../decision-log/2026-08-06-schema-probe.mjs) 로
  **465 케이스**를 확인했다 (정정 전 35건 실패 → 정정 후 0건).

## Context

ADR-019 는 "달력 키 CHECK 이 fail-open 이다"라는 발견에서 나왔다. `strftime()` 은 파싱
실패 시 오류가 아니라 **NULL** 을 반환하고 CHECK 은 결과가 **FALSE 일 때만** 거부하므로,
`CHECK (strftime('%w', week) = '1')` 이 `'garbage'`·`'2026-02-30'` 을 전부 통과시켰다.
해법은 `IS` 를 쓴 NULL-safe 왕복 비교였고, 그 정정은 유효하다 — 이번 실증에서 달력 키
4종은 모든 악성 입력을 거부했다.

그런데 **같은 계열의 구멍이 다른 두 곳에 남아 있었다.** ADR-019 가 달력 키를 고치면서
순간 컬럼과 값 범위에는 같은 검사를 적용하지 않았기 때문이다.

### 1. 값 범위 CHECK 이 타입을 보지 않는다

`CHECK (focus_min >= 1)` 은 정수 하한을 강제하는 것처럼 보이지만 그렇지 않다.
SQLite 의 INTEGER 친화성은 변환 불가능한 TEXT 를 **거부하지 않고 TEXT 그대로 저장**하고,
SQLite 값 순서에서 **TEXT 는 모든 INTEGER 보다 크다**. 따라서:

```
SELECT ('abc' >= 1);   -- 1 (참)
```

`focus_min = 'abc'`, `duration_sec = 'abc'`, `est_pomos = 'abc'`, `budget = 'abc'` 가
전부 통과한다. 실수도 마찬가지로 `1.5 >= 1` 이 참이라 "뽀모 1.5개"가 저장된다.

실질 피해는 조용한 오답이다. 실측으로 확인한 것:

| 저장된 값 | 벌어지는 일 |
|---|---|
| `duration_sec = 'abc'` | `SUM(duration_sec)` 이 **에러 없이 0 으로 취급**해 합계에서 빠진다 |
| `focus_min = 'abc'` | ADR-013 §4 의 총 집중 시간(`budget × focus_min`)이 무너진다 |
| `est_pomos = 2.7` | 과적 경고와 남은 몫(`max(0, est − 소진)`)이 비정수가 된다 |

이건 ADR 이 놓친 것이 아니라 **기능 문서가 명시적으로 위임한 것을 이행하지 못한 것**이다.

- [pomo-baseline R5] — "길이의 하한은 1분이며 **정수만 허용**한다. 0 이하·음수·**비정수**·
  빈 값의 저장 시도는 거부되고 기존 값이 유지된다. 거부는 경계에서 이뤄진다
  (IPC 스키마 + **SQLite CHECK**)."
- [week-plan R6·R9] — "est 는 **정수 ≥ 1**", "이 예외를 **컬럼 제약으로** 어떻게
  표현하는지는 ADR-011 §6 소관이다."

그리고 ADR-019 §2 자신이 이렇게 적었다: *"IPC 경계의 zod 는 이 값들을 보지 못한다.
**DB CHECK 이 main 프로세스 버그에 대한 유일한 방어선이다.**"*

### 2. 순간 CHECK 이 자릿수만 보고 값의 범위를 보지 않는다

ADR-019 §2 는 순간 컬럼에 GLOB 형식 검사를 지정했고 그 자체는 옳게 동작한다 —
`'Z'`·`'2026-08-03'`(밀리초 없음)·`'2026-08-03 09:00:00.000Z'`(T 대신 공백)·소문자 `z`·
`+09:00` 오프셋이 전부 거부됐다.

문제는 GLOB 이 **자릿수만 세고 값을 보지 않는다**는 것이다:

```
'2026-13-45T99:99:99.999Z'   -- 13월 45일 99시 99분 99초 → 통과
```

순간 컬럼 22개 중 21개가 이 값을 받았다. 나머지 하나(`sessions.started_at`)도 포맷
CHECK 이 아니라 `ended_at >= started_at` 비교에 우연히 걸린 것이라 방어가 아니다.

들어가면 두 가지가 벌어진다. `datetime()` 이 **NULL 을 반환**해 날짜 연산이 조용히
무너지고, 문자열 정렬에서 이 값이 **모든 정상 값보다 뒤로 밀려** "최신 세션"·"최근 정산"
조회가 쓰레기 행을 가리킨다(실측으로 `ORDER BY started_at` 맨 뒤에 붙는 것을 확인).

ADR-019 가 날짜 키에서 GLOB 을 버린 이유(`'0000-00-00'`·`'9999-99-99'` 통과)가 순간에는
그대로 남아 있었다.

### 3. `weeks.capacity` 가 길이만 검사된다

ADR-019 §3 은 `json_valid(capacity) AND json_array_length(capacity) = 7` 을 요구했다.
[pomo-baseline R7] 은 "길이는 7 이고 **각 원소는 0 이상의 정수**"라고 적었는데 뒷부분이
스키마에 도달하지 않았다. `'["a","b","c","d","e","f","g"]'`·`'[-1,0,0,0,0,0,0]'`·
`'[null,null,null,null,null,null,null]'` 이 통과한다.

특히 **7개 전부 `null` 인 배열**은 [ADR-018](adr-018-first-run-state.md) §1 이 구분하려던
"아직 정하지 않았다"(NULL)와 "예산 0 으로 하겠다"(0) 사이에 **세 번째 모호한 상태**를
만든다. ADR-018 이 `[0,0,0,0,0,0,0]` 초기화를 금지한 것과 같은 문제가 다른 경로로 들어온다.

### 4. 부분 UNIQUE 인덱스가 소프트 삭제를 고려하지 않는다

ADR-019 §7 의 `CREATE UNIQUE INDEX ... ON week_items(week) WHERE is_system = 1` 은
소프트 삭제된 기타 항목이 그 주의 자리를 계속 차지하게 한다. `deleted_at` 이 찍힌 행이
하나 있으면 같은 주의 새 기타 항목 생성이 UNIQUE 위반으로 거부된다 —
사후 캡처의 lazy 생성 경로가 그 주에 영구히 막힌다(실증 확인).

## Decision

### 1. 정수 컬럼에 `typeof(x) = 'integer'` 를 함께 건다

범위 비교만으로는 타입이 강제되지 않으므로, 값 범위 CHECK 마다 타입 검사를 앞에 세운다.

```sql
CHECK (typeof(duration_sec) = 'integer' AND duration_sec >= 0)
CHECK (budget IS NULL OR (typeof(budget) = 'integer' AND budget >= 0))
```

적용 대상은 **정수 의미를 갖는 컬럼 전부**다 — `weeks.budget`·`focus_min`·
`short_break_min`·`long_break_min`, `week_items.est_pomos`, `tasks.est_pomos`,
`sessions.duration_sec`, `milestones.sort_order`.

`milestones.sort_order` 는 ADR-019 가 값 범위 대상으로 열거하지 않았으나 같은 이유로
포함한다 — 정렬 키이므로 TEXT 가 섞이면 모든 정수보다 뒤로 밀린다.

`week_items.is_system` 은 이미 `IN (0,1)` 이라 `'a'`·`0.5`·`2` 를 모두 거부한다.
추가 검사가 필요 없다(실증 확인).

숫자 문자열 `'5'` 는 친화성이 정수 5 로 변환하므로 정상 통과한다. 막을 대상이 아니다.

### 2. 순간 컬럼에 `strftime` 왕복 비교를 함께 건다

GLOB 을 버리지 않고 왕복 비교를 더한다.

```sql
CHECK (
  col GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
  AND col IS strftime('%Y-%m-%dT%H:%M:%fZ', col)
)
```

달력 키에서 `IS date(...)` 를 쓴 것과 같은 수법이다. 파싱 실패 시 `strftime` 이 NULL 을
반환하고 `IS` 가 NULL-safe 라 FALSE 로 거부된다. 정규화 결과가 입력과 다른 값
(`'2026-02-30T00:00:00.000Z'` → `'2026-03-02T...'`)도 함께 걸린다.

GLOB 을 남기는 이유는 두 가지다 — 자릿수·zero-pad 를 명시적으로 고정하고, `strftime` 의
허용 입력 폭이 SQLite 빌드에 따라 달라져도 형식이 흔들리지 않게 한다.

### 3. `weeks.capacity` 의 원소 7개를 각각 검사한다

`json_each` 는 테이블 값 함수라 CHECK 안에서 쓸 수 없다. `json_extract` 를 7번 펴서
표현한다.

```sql
CHECK (capacity IS NULL OR (
  json_valid(capacity) AND json_array_length(capacity) = 7
  AND typeof(json_extract(capacity, '$[0]')) = 'integer' AND json_extract(capacity, '$[0]') >= 0
  -- ... $[1] .. $[6]
))
```

장황하지만 생성물이므로 손으로 유지할 대상이 아니다. `week_items.days` 는 이미
`json_type(days) = 'array'` 를 함께 보므로 이 ADR 의 대상이 아니다.

### 4. 부분 UNIQUE 인덱스에 `deleted_at IS NULL` 을 더한다

```sql
CREATE UNIQUE INDEX idx_week_items_one_system
  ON week_items(week) WHERE is_system = 1 AND deleted_at IS NULL;
```

[ADR-011](adr-011-schema-final.md) §4 가 기타 항목을 "플래너에서 편집·삭제 불가"로 뒀고
v1 에 `deleted_at` 을 세우는 UI 가 없으므로 **현재는 도달 불가 경로**다. 그럼에도 지금
넣는 이유는 ADR-019 §8 의 기준 그대로다 — **지금은 인덱스 정의 한 줄이고 나중에는
인덱스 재작성**이다.

### 5. 알고도 미룬 것

두 건은 이번에 하지 않는다. 미뤘다는 사실 자체를 잊지 않기 위해 여기 남긴다.

| 미룬 것 | 현재 상태 | 왜 미뤘나 |
|---|---|---|
| `sessions.local_date` 와 `local_week` 의 정합성 CHECK | `local_date = '1999-01-01'`, `local_week = '2026-08-03'` 인 세션이 통과한다 | 어느 ADR 도 요구한 적 없는 **새 제약**이다. 두 값은 시간 모듈(ADR-009 §3)이 같은 순간에서 함께 계산하므로 어긋나려면 그 모듈이 깨져야 한다. `date(local_date, 'weekday 1', '-7 days') IS local_week` 로 표현 가능하니, 필요해지면 새 ADR 로 추가한다 |
| `weeks.created_at`·`updated_at` | 없다 | [ADR-011](adr-011-schema-final.md) §1 의 컬럼 정의와 [ADR-006](adr-006-schema-sync-insurance.md) §2 의 mutable 4종 목록에 둘 다 없다. 다만 `weeks` 행은 첫 세션에 생겼다가 계획·정산 때 UPDATE 되므로 **실제로는 mutable** 이고, ADR-019 를 검증한 스크립트의 `weeks` DDL 에는 두 컬럼이 있었다. ADR-006 의 논리("과거 데이터의 갱신 시각은 영영 복원 불가")가 적용되는 자리이므로, 컬럼을 추가하려면 ADR-011 §1 을 정정하는 별도 결정이 필요하다 |

### 6. ADR-019 의 상태 줄에 정정을 단다

§2 의 순간 GLOB 과 §3 의 값 범위 식은 **결정이 유효하고 식만 정정된다.** 본문은 이력으로
그대로 두고 상태 줄에만 표기한다 (docs/CLAUDE.md).

## Consequences

- (+) "잘못된 값은 저장 자체가 실패한다"는 ADR-011 의 약속이 **값 범위와 순간에서도**
  성립한다. 465 케이스 중 정정 전 35건이 통과했고 정정 후 0건이다.
- (+) 기능 문서가 SQLite CHECK 에 위임한 항목([pomo-baseline R5·R7], [week-plan R6·R9])이
  실제로 이행된다. 위임받고 이행하지 않은 상태가 해소된다.
- (+) 조용한 집계 오염 경로 하나가 닫힌다 — `SUM()` 이 TEXT 를 0 으로 세는 일이 없어진다.
- (−) CHECK 식이 길어진다. 특히 `weeks_capacity_shape` 는 `json_extract` 7쌍이라 한 줄이
  길다. 생성물이므로 유지 비용은 없지만 SQL 을 눈으로 읽을 때 부담이다.
- (−) `typeof(x) = 'integer'` 는 **정수 문자열 `'5'` 를 막지 않는다** — 친화성이 저장 전에
  정수로 바꾸기 때문이다. 이건 의도한 동작이지만, "타입을 강제했다"는 표현이 문자열 입력
  전부를 막는다는 뜻으로 오해되지 않게 여기 적어 둔다.
- (−) `strftime` 왕복 비교는 SQLite 의 날짜 파서 동작에 의존한다. better-sqlite3 13.0.2
  (SQLite 3.53.4)에서 확인했으며, 빌드가 바뀌면 프로브를 다시 돌린다.
- (−) 제약이 늘어난 만큼 정상 동작이 걸릴 위험도 늘어난다. 특히 `typeof` 검사는
  main 프로세스가 숫자 대신 문자열을 넘기던 코드를 **런타임 예외로 드러낸다** — 조용히
  저장되던 것이 시끄럽게 죽는다. 그것이 이 ADR 의 목적이다.
