# ADR-022: 달력 키 짝 보장 — 시간 모듈 진입점·정합성 CHECK·weeks 갱신 시각

- 상태: accepted (2026-08-06) · **§3 폐기됨 (2026-08-13, [ADR-030](adr-030-time-as-progress-currency.md))**
  - §3 이 추가한 `weeks.created_at`·`updated_at` 은 테이블째 사라진다. 이로써 §3 이
    ADR-006 §2 의 mutable 목록에 넣은 `weeks` 항목도 함께 죽는다.
  - **§1(시간 모듈 진입점)·§2(정합성 CHECK)·§4 는 유효하다** — 달력 키 짝 보장은
    `sessions`·`tasks` 에 그대로 남는다.
- 관계:
  - [ADR-021](adr-021-constraint-type-enforcement.md) §5 가 "알고도 미뤘다"고 기록한 두 건을
    실행한다. §5 에 적힌 정합성 **식은 틀렸으므로** 그대로 쓰지 않는다 (§5 아래).
  - [ADR-011](adr-011-schema-final.md) §1 의 `weeks` 컬럼 정의를 **정정**한다
    (`created_at`·`updated_at` 추가). §1 의 나머지와 §2~§7 은 유효하다.
  - [ADR-006](adr-006-schema-sync-insurance.md) §2 의 mutable 테이블 목록에 `weeks` 를
    **추가**한다. §1(UUID v7)과 §2 의 나머지는 유효하다.
  - [ADR-009](adr-009-time-format-convention.md) §3 초크포인트를 **보강**한다 — 달력 키
    짝은 한 번의 시계 읽기에서 나온다. §1·§2·§4 는 그대로다.
- 결정 근거: 제안에 대한 **격리 리뷰 3건** — 비용 심사, 런타임 실증 심사, 적대적 심사를
  사전 맥락 없는 심사자에게 각각 맡겼다. 세 심사가 독립적으로 ADR-021 §5 의 식 오류를
  찾았고, 원안 4겹 중 2겹이 기각됐다.
- 재현: [2026-08-06-schema-probe.mjs](../../decision-log/2026-08-06-schema-probe.mjs)
  (465 → **500 케이스**, 전건 통과)

## Context

`sessions` 는 로컬 달력 키를 두 개 저장한다. `local_date`(그 세션이 시작된 로컬 날짜)와
`local_week`(그 날짜가 속한 주의 월요일). 조회 시 순간 컬럼에서 파생하지 않고 기록 시
1회 계산해 박제하기 때문이다(ADR-009 §2) — 파생하면 타임존 이동에 과거 기록이 소급
이동하고 인덱스를 못 탄다.

읽는 쪽이 갈린다. 캘린더 점·그날 패널·"공부한 날"은 `local_date` 를 읽고
(calendar-records R3), 주간 게이지·항목별 소진·정산·사후 캡처 귀속은 `local_week` 를
읽는다(ADR-012 §1). **두 값이 어긋나면 한 화면에는 있고 다른 화면에는 없는 세션이 된다.**

세 가지가 함께 드러났다.

### 1. 시간 모듈에 "특정 순간의 달력 키" 진입점이 없다

`dayKey(d?: Date)`·`weekKey(d?: Date)` 는 `Date` 를 받는데, lint 가 이 모듈 밖의
`new Date()` 를 막으므로(ADR-009 §3, eslint.config.js) **호출부는 `Date` 를 만들 수 없다.**
즉 프로덕션이 탈 수 있는 유일한 경로는 인자 생략이고, 그건 `index.test.ts:26-28` 이 이미
주석으로 적어 둔 사실이다. 그런데 타이머의 런타임 값은 epoch ms 이고 저장 경계에서
변환해야 한다(ADR-005, ADR-009 §1) — **변환 경로가 아예 없다.** 세션 기록을 구현하는
첫날 막힌다.

### 2. 인자를 생략하면 시계를 두 번 읽는다

`dayKey()` 와 `weekKey()` 를 잇달아 부르면 각자 `new Date()` 를 호출한다. 자정을 사이에
두면 갈라진다 (실증):

```
dayKey()  @ 일 23:59:59.999 -> 2026-08-09
weekKey() @ 월 00:00:00.000 -> 2026-08-10   ← 다른 주
```

낮에는 절대 재현되지 않고 자정을 걸친 세션에서만 나온다. 자유 집중은 길이 제한이 없어
이 구간에 정상적으로 걸린다.

### 3. 어긋나도 검산이 통과한다

ADR-012 §1 의 검산식 `주간 총 소진 = Σ(항목 소진) + 미분류` 는 **양변이 전부
`local_week` 로만 정의된다.** `local_date` 는 이 식에 등장하지 않으므로 두 값이 어긋나도
등식이 성립한다. 크래시도, 로그도, 검산 실패도 없이 숫자만 틀린다.

### 4. `weeks` 행의 갱신 시각이 어디에도 없다

`weeks` 행은 ① 계획 ② 정산 ③ 그 주의 첫 세션 중 가장 먼저 오는 때 생기고(ADR-013 §2),
이후 계획·주중 재수정·정산으로 UPDATE 된다. 명백히 mutable 인데 `created_at`·`updated_at`
이 없다. ADR-006 §2 의 mutable 목록(tasks·week_items·milestones·settings)에 없기
때문인데, **ADR-006(2026-08-03)은 `weeks` 를 신설한 ADR-011(2026-08-04)보다 하루 먼저
쓰였다** — 목록의 누락은 제외 결정이 아니다. 같은 목록은 ADR-011 §3(sessions 추가)과
ADR-019 §6(settings 보완)으로 이미 두 번 확장된 이력이 있다.

`planned_at` 으로 대신할 수 없다. week-plan R23 이 **"`planned_at` 은 최초 확정 시각만
담고 주중 재수정으로 다시 확정해도 갱신하지 않는다"** 고 못박았으므로, 재수정으로
`budget` 이 바뀌어도 시각 흔적이 남지 않는다.

## Decision

### 1. 달력 키 짝은 시간 모듈이 한 번에 만든다

```ts
export type LocalKeys = { readonly localDate: string; readonly localWeek: string }

export function localKeys(atEpochMs?: number): LocalKeys {
  const at = atEpochMs === undefined ? new Date() : new Date(atEpochMs)
  return { localDate: dayKey(at), localWeek: weekKey(at) }
}
```

`local_date` 와 `local_week` 를 함께 쓰는 곳은 반드시 이 함수를 쓴다. 인자가 하나뿐이므로
**두 값이 다른 순간에서 나올 수 없다.** 이것은 방어를 얹는 것이 아니라 실수가 표현
불가능하도록 API 를 좁히는 것이다.

`atEpochMs` 를 받는 것이 §1(진입점 부재)의 해소다 — 호출부는 `Date` 를 만들 수 없고
epoch ms 만 넘길 수 있다. 생략하면 현재 시각이며, 이는 기존 세 함수의 관례와 같다.

`dayKey`/`weekKey`/`monthKey` 는 **그대로 둔다.** 한쪽 키만 필요한 자리
(weekly-review 의 `weekKey(addDays(...))` 등)가 실재하므로 짝 함수가 개별 함수를
대체하지 않는다.

### 2. 두 키의 정합성을 DB 가 강제한다

```sql
CHECK (local_week IS date(local_date, '-6 days', 'weekday 1'))
```

`'-6 days'` 를 **먼저** 두는 것이 이 식의 전부다. SQLite 의 `weekday 1` 은 이미 월요일이면
이동하지 않으므로 `'weekday 1','-7 days'` 는 월요일 입력에 전주 월요일을 낸다.

기존 `sessions_local_date_format`·`sessions_local_week_monday` 는 **유지한다.** 전자는
논리적으로 포함되지 않고(빼면 `'2026-02-30'`·`'2026-08-04T09:00:00.000Z'` 가 `local_date`
로 들어온다), 후자는 포함되지만 **에러 메시지 식별성**을 위해 남긴다 — "week 가 월요일이
아님"과 "두 값이 어긋남"이 서로 다른 제약 이름으로 갈린다.

`IS` 를 쓰는 것은 NULL-safe 를 위해서다(ADR-019 의 fail-open 교훈). 다만 `IS` 는 "둘 다
NULL 이면 통과"를 만들므로, **이 CHECK 의 방어는 두 컬럼의 NOT NULL 선언에 의존한다.**
하나라도 nullable 로 바꾸면 조용히 fail-open 한다 — 스키마 주석에 명시했다.

§1 이 있는데도 DB CHECK 을 두는 이유는 타입·구조가 보지 못하는 쓰기 경로 때문이다:
원시 SQL, 마이그레이션, 나중에 붙일 동기화. 실측 비용은 INSERT +146 ns/행(+4.6%),
UPDATE +2 ns/행이다 — 하루 100뽀모에서 +0.0146 ms/일.

### 3. `weeks` 에 `created_at`·`updated_at` 을 둔다

ADR-011 §1 의 컬럼 정의와 ADR-006 §2 의 mutable 목록을 정정한다. Drizzle 의
`$defaultFn`/`$onUpdate` 로 자동 갱신하며, 나머지 6개 테이블과 동일한 순간 포맷 CHECK 을
붙인다.

불변인 것은 **행이 아니라 스냅샷 컬럼**이다 — ADR-013 §3 과 pomo-baseline R19 가 불변이라
한 대상은 `budget`·`capacity`·`focus_min`·`short_break_min`·`long_break_min` 이고, 행
자체는 §2 대로 UPDATE 된다. 따라서 `updated_at` 은 스냅샷 불변성과 충돌하지 않는다.

`created_at` 도 함께 두는 이유는 `weeks` 만 **PK 가 자연키**이기 때문이다. 다른 테이블은
PK 가 UUID v7 이라 생성 시각이 ID 에 내장돼 있지만(ADR-006 §1), `weeks` 의 PK 는 그 주
월요일 날짜여서 **생성 시각을 복원할 방법이 없는 유일한 테이블**이다.

week-plan R23 의 "재수정 이력을 남기는 컬럼은 v1 에 두지 않는다"와 충돌하지 않는다 —
R23 이 말한 것은 사용자에게 보이는 **재수정 이력 기능**이고, `updated_at` 은 ADR-006 이
정의한 병합 재료다. 화면에 노출하지 않는다.

### 4. 채택하지 않은 것

같은 제안에서 함께 검토했고 **기각한다.** 다시 꺼낼 때 같은 논의를 반복하지 않기 위해
근거를 남긴다.

- **브랜드 타입**(`type DayKey = string & { __brand }` + Drizzle `.$type<>()`). 기각.
  ① 표적 실수를 못 막는다 — `dayKey()` 도 `weekKey()` 도 각자 **정확한 타입**을 반환하며,
  컴파일러는 두 값이 다른 시각에서 왔다는 사실을 볼 수 없다. ② zod 의 브랜드는
  `unique symbol` 키라 수제 브랜드와 **양방향 대입이 불가능**하다(tsc 확인) — IPC 계약에
  붙이면 이름만 같은 브랜드 두 개가 생기고 탈출구는 `as` 캐스팅이다. ③ drizzle 의
  `.references()` 는 브랜드를 검사하지 않는다.
- **`dayKey()` 기본 인자 제거.** 기각. 전제가 틀렸다 — lint 규칙은 `src/shared/time/**`
  를 ignore 하므로 기본 인자의 `new Date()` 는 규칙 **안**이지 우회가 아니다. 그리고
  제거하면 호출부가 `Date` 를 만들 수 없어 **호출 자체가 불가능해진다.** 실제 문제였던
  "두 번의 시계 읽기"는 §1 이 해소한다.
- **리포지토리가 달력 키를 소유하는 것.** M2 로 이월. Task 5 의 대상은 `settings` 하나이며
  세션 리포지토리는 M1 에 없다. 세션 유스케이스가 실재하는 시점에 ADR-015 §1(포트는
  consumer-defined)을 적용하면 자동으로 얻어진다 — 포트 메서드가 `recordSession(...)`
  이면 달력 키는 시그니처에 나타나지 않는다.

### 5. ADR-021 §5 의 식을 정정한다

ADR-021 §5 는 정합성을 `date(local_date, 'weekday 1', '-7 days')` 로 표현 가능하다고
적었다. **틀렸다.** `weekday 1` 은 이미 월요일이면 제자리에 머물고 거기서 −7일 하면 한 주
앞이 나온다. 40,000일 표본에서 **5,714일(정확히 모든 월요일) 오답**이다. 그대로 채택했다면
월요일에 기록된 정상 세션의 INSERT 가 전부 실패했을 것이다.

이는 결정의 번복이 아니라 **문서에 남은 계산 오류**이므로, ADR-021 의 상태 줄에 정정을
단다(docs/CLAUDE.md — 본문은 이력으로 둔다).

## Consequences

- (+) 두 달력 키가 어긋나는 경로가 **API 모양에서 닫힌다.** 짝을 따로 만들 방법이
  없으므로 실수를 하려면 함수를 새로 만들어야 한다.
- (+) 세션 기록에 필요한 **epoch ms → 달력 키 변환 경로**가 생긴다. M2 첫날의 블로커가
  사라진다.
- (+) `weeks` 행의 생성·갱신 시각이 남는다. 재수정으로 `budget` 이 바뀐 사실이 데이터에
  기록되고, 동기화를 붙일 때 병합 재료가 있다.
- (+) 프로브가 465 → 500 케이스가 됐다. 7요일 정합/불일치와 "월요일 자기 자신"(§5 의 잘못된
  식이었다면 뒤집히는 케이스)이 회귀 테스트로 고정된다.
- (−) CHECK 이 41 → 44 개가 된다. ADR-021 Consequences 가 계상한 비용("SQL 을 눈으로 읽을
  때 부담", "정상 동작이 걸릴 위험")이 그만큼 늘어난다.
- (−) **이 CHECK 은 부분 방어다.** `local_date`·`local_week` 를 둘 다 `ended_at` 기준으로
  계산하면 서로 일치하므로 통과한다(실증). ADR-009 §2 가 요구한 "귀속 기준은 `started_at`"
  은 DB 가 볼 수 없다 — DB 는 사용자 타임존을 모르므로 원리적으로 불가능하다. 이 몫은
  세션 기록 경로의 단위 테스트가 진다.
- (−) `PRAGMA integrity_check` 는 **CHECK 위반 행을 손상으로 보고한다**(SQLite 3.53.4
  확인). ADR-020 §4 가 시작 경로에 `integrity_check` 를 두므로, 어떤 경로로든 위반 행이
  하나 생기면 앱이 "DB 손상" 안내 후 종료한다. 제약이 늘수록 이 표면도 늘어난다.
- (−) `$onUpdate` 는 **Drizzle 을 거친 UPDATE 에서만** 동작한다. 원시 `sqlite.prepare` 나
  `db.run(sql\`...\`)` 로 쓰면 `updated_at` 이 갱신되지 않는다(실증). 현재 쓰기 경로는
  전부 Drizzle 쿼리빌더이고 원시 SQL 은 테스트에서만 쓰지만, 규율로 유지해야 한다.
- (−) `created_at` 과 `updated_at` 은 같은 INSERT 에서 `$defaultFn` 이 각각 호출되어
  **밀리초 단위로 다를 수 있다.** "`created_at == updated_at` 이면 갱신된 적 없음"이라는
  판정을 쓰면 안 된다.
- 지금 하지 않는 것: 순간 컬럼(`started_at`·`ended_at`)의 epoch ms → UTC ISO 변환 진입점.
  §1 과 같은 종류의 누락이지만 달력 키와 별개 관심사이므로, 세션 기록을 구현할 때 함께
  결정한다.
