# Technical Spec: weekly-review

> 1차 근거: [정산·계획 플로우 시각화](../../decision-log/2026-08-04-settlement-flow.html) (판정식·시나리오 7종)
> + [결정 원장](../../decision-log/2026-08-04-planning-session.md) Q5·Q6·Q7·Q12·Q13·Q14
> + [ADR-010](../../architecture/decisions/adr-010-week-definition.md)(주 정의·plan_lead_days)
> · [ADR-011](../../architecture/decisions/adr-011-schema-final.md)(스키마)
> · [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md)(시간 포맷)
> · [ADR-007](../../architecture/decisions/adr-007-ipc-contract.md)(IPC 계약)
> 이 문서는 API·DB·제약만 다룬다. 화면 문구는 [ux-spec](./ux-spec.md), 제품 요구사항은 [prd](./prd.md).

## 0. 판정식 (모든 것의 기준)

저장값은 **워터마크 하나**다. 나머지는 전부 파생이고, 조건 분기가 없다.

```
저장값   settings['last_settled_week']      "여기까지 정산 끝" 워터마크 (달력 키, 월요일)
설정값   settings['plan_lead_days']          기본 1 (v1 설정 UI 미노출)

계획 대상 주 (targetWeek) = weekOf( today + plan_lead_days 일 )
정산 범위 (from … to)     = last_settled_week + 7일  …  targetWeek − 7일
정산 대기                  = from <= to  (범위가 비어 있지 않다)
확정 시                    last_settled_week ← targetWeek − 7일   (= to)
첫 실행 초기값             last_settled_week ← targetWeek − 7일
```

핵심: 워터마크는 "정산한 주"가 아니라 **항상 `targetWeek − 1주`** 다. 확정 시와 첫
실행 초기화가 같은 값을 쓰기 때문에, 설치 직후 헛배너와 병합 정산 후 무한 배너가
같은 규칙 하나로 동시에 막힌다 (Q5).

`weeks` 테이블(구 `week_settlements`)은 **판정에 사용하지 않는다.** 스냅샷·이력 전용이다.

### 0.1 판정 의사코드

```ts
// main 프로세스. 주 산술은 전부 날짜 산술 (+7일 / −7일) — ADR-010 §2
function evaluateSettlement(now: Instant): SettlementStatus {
  const lead   = readSetting('plan_lead_days') ?? 1;
  const target = weekKey(addDays(localDate(now), lead));   // 계획 대상 주

  let wm = readSetting('last_settled_week');
  if (wm == null) {                       // 첫 실행 — 초기화도 같은 식
    wm = addDays(target, -7);
    writeSetting('last_settled_week', wm);
  }

  const from = addDays(wm, 7);
  const to   = addDays(target, -7);

  if (from > to) {                        // 문자열 비교로 충분 (사전순 = 시간순)
    return { needed: false, targetWeek: target };
  }
  return { needed: true, targetWeek: target, from, to };
}
```

- `weekKey()` / `localDate()` / `addDays()` 는 `src/shared/` 의 **시간 모듈 하나**가
  소유한다 (ADR-009 §3). 이 기능의 코드에서 `new Date()` 직접 호출 금지.
- 달력 키는 사전순 = 시간순이므로 주 범위 비교·BETWEEN 이 문자열 비교로 성립한다.
- `from > to` 는 정상 상태다 — 평일 정상 사용과 확정 직후가 모두 이 경로다.

### 0.2 판정을 다시 도는 시점

- 앱 시작 시 1회
- 창 포커스 획득 시
- 로컬 자정 경계를 넘겼을 때 (날짜 tick)
- 리뷰 확정 트랜잭션 직후 (배너 즉시 소멸 검증 — PRD R23)

판정은 순수 파생이므로 몇 번 돌려도 같은 답이다. 단, 첫 실행 초기화(§0.1)는 write 를
동반하므로 **write 는 최초 1회만** 발생하도록 존재 여부로 가드한다.

---

## API

IPC 는 도메인 명령형 + zod 런타임 검증이다 (ADR-007). renderer 는 SQL 도 스키마도
모른다. 아래 스키마는 계약의 **단일 정의**이며 TS 타입은 `z.infer` 로 파생한다.

### 공통 스키마

```ts
const WeekKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);   // 달력 키. 월요일 (ADR-010, DB CHECK 로 재검증)
const Id      = z.string();                                 // uuid v7 (ADR-006)
```

### `review.getStatus()` — 배너용 판정

```ts
input:  z.void()
output: z.discriminatedUnion('needed', [
  z.object({ needed: z.literal(false), targetWeek: WeekKey }),
  z.object({
    needed: z.literal(true),
    targetWeek: WeekKey,
    from: WeekKey, to: WeekKey,
    weekCount: z.number().int().min(1),     // to..from 주 수 (렌더 라벨용)
    pendingItemCount: z.number().int().min(0),  // 넘어갈 건수. 0 도 유효 (PRD R5)
  }),
])
```

### `review.getPending()` — 리뷰 패널 데이터

```ts
input:  z.void()
output: z.object({
  targetWeek: WeekKey,
  from: WeekKey, to: WeekKey,
  summary: z.object({
    weeks: z.array(z.object({
      week: WeekKey,
      studiedDays: z.number().int(),   // distinct sessions.local_date (kind='focus')
      spentPomos: z.number().int(),    // focus 세션 수
      budget: z.number().int(),        // weeks.budget ?? sum(capacity)
      unassignedPomos: z.number().int(),  // task_id IS NULL 인 focus 세션 수
    })),
    idleWeekCount: z.number().int(),   // 범위 내 세션 0 · 항목 0 인 주 수 (공백 문구용)
  }),
  completed: z.array(z.object({        // 그 범위에 completed_at 이 찍힌 항목
    id: Id, week: WeekKey, title: z.string(), spentPomos: z.number().int(),
  })),
  pending: z.array(z.object({          // 3택 대상
    id: Id, week: WeekKey, title: z.string(),
    estPomos: z.number().int(),        // 항목 est (Q13 — task est 합이 아니다)
    spentPomos: z.number().int(),
    remaining: z.number().int().min(1),   // max(1, est − spent)
    carryWeeks: z.number().int().min(1),  // (week − origin_week)/7 + 1  (Q12)
  })),
  baseline: z.object({                 // 뽀모 길이 진입점의 현재 값 표시용
    focusMin: z.number().int(), shortBreakMin: z.number().int(), longBreakMin: z.number().int(),
  }),
})
```

`pending` 은 `is_system = 1` 항목(기타)을 제외한다 (Q7).

### `review.settle(input)` — 확정 (트랜잭션 1개)

```ts
const Decision = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('carry'),         itemId: Id }),
  z.object({ kind: z.literal('carry_reduced'), itemId: Id, estPomos: z.number().int().min(1) }),
  z.object({ kind: z.literal('drop'),          itemId: Id }),
]);

input: z.object({
  expectedRange: z.object({ from: WeekKey, to: WeekKey }),   // 낙관적 동시성 — §확정 1단계
  targetWeek: WeekKey,
  decisions: z.array(Decision),
  baseline: z.object({                                        // 선택. 리뷰에서 뽀모 길이를 만졌을 때만
    focusMin: z.number().int().min(1),
    shortBreakMin: z.number().int().min(1),
    longBreakMin: z.number().int().min(1),
  }).optional(),
})
output: z.object({
  settledThrough: WeekKey,                 // 갱신된 워터마크 (= targetWeek − 7일)
  carriedItemIds: z.array(Id),             // 새로 생성된 계획 대상 주 항목
  droppedItemIds: z.array(Id),
  carriedPomos: z.number().int(),          // 확정 토스트 문구용
})
```

**에러 코드**

| 코드 | 조건 | renderer 처리 |
|---|---|---|
| `STALE_RANGE` | 재판정한 범위가 `expectedRange` 와 다르다 (확정 중 자정·plan_lead 경계 통과) | 재조회 후 재렌더 (ux-spec §8) |
| `DECISION_MISSING` | `pending` 항목 중 결정이 없는 id 가 있다 | 버그. 재조회 |
| `DECISION_UNKNOWN` | `decisions` 에 `pending` 에 없는 id·시스템 항목 id 가 있다 | 버그. 재조회 |
| `REDUCED_OUT_OF_RANGE` | `carry_reduced.estPomos` 가 1..remaining 밖 | 스테퍼 클램프 버그 |

> ⚠️ 가정: **서버는 결정 누락을 이월로 폴백하지 않고 거부한다** (`DECISION_MISSING`).
> "기본값 = 이월"(원칙 4)은 UI 가 전 항목을 pre-selected 로 채워 보내는 것으로
> 만족되며, 계약 쪽에서 폴백까지 허용하면 "보내려다 빠진 결정"과 "이월 의도"가
> 구분되지 않는다.

> ⚠️ 가정: `baseline` 을 `settle` 입력에 함께 실은 것은, 계획 대상 주의 `weeks` 행이
> 이 트랜잭션에서 처음 생기기 때문이다. 값의 유효 범위·기본값·스냅샷 승계 규칙은
> pomo-baseline 소관이며, 별도 명령으로 분리하는 편이 낫다고 판단되면 그 문서에서
> 뒤집을 수 있다.

### `review.dismissBanner()` — 만들지 않는다

배너 표시 여부는 판정의 파생이다. "무시했다"는 상태를 저장하면 저장값이 둘이 되어
Q5 가 닫은 구멍이 다시 열린다. 세션 내 임시 숨김은 renderer 로컬 상태로만 둔다.

---

## DB

주 키·달력 키의 포맷과 CHECK 는 ADR-009 §1·ADR-011 §6 을 따른다.

### 읽는 것

| 테이블 | 컬럼 | 용도 |
|---|---|---|
| `settings` | `last_settled_week` | **판정의 유일한 저장 입력** (워터마크) |
| `settings` | `plan_lead_days` | 계획 대상 주 계산 (기본 1) |
| `settings` | `focus_min`·`short_break_min`·`long_break_min` | 계획 대상 주 스냅샷의 기본값 (weeks 행 없을 때) |
| `settings` | `weekly_capacity` | 주 예산 기본값 (`weeks.budget` 이 NULL 일 때 합계) |
| `weeks` | `week`·`budget`·`capacity`·`focus_min`·`short_break_min`·`long_break_min` | 주별 예산·베이스라인 스냅샷 (요약의 "예산 B") |
| `week_items` | `id`·`week`·`title`·`est_pomos`·`milestone_id`·`origin_week`·`carry_from_id`·`is_system`·`completed_at`·`dropped_at`·`deleted_at` | 3택 대상 조회, 배지 계산, 완료 목록 |
| `tasks` | `id`·`week_item_id` | 항목별 소진 집계의 조인 경로 |
| `sessions` | `local_week`·`local_date`·`kind`·`task_id` | 소진 뽀모·공부한 날·미분류 뽀모 (전부 파생, 저장 금지 — 원칙 8) |

### 쓰는 것

| 테이블 | 컬럼 | 시점 |
|---|---|---|
| `settings` | `last_settled_week` | 첫 실행 초기화 1회 / 확정 시 `targetWeek − 7일` |
| `week_items` | INSERT (이월 항목) | 확정 시 — `carry` · `carry_reduced` |
| `week_items` | `dropped_at` | 확정 시 — `drop` (soft. 하드 삭제 금지) |
| `weeks` | `settled_at` (upsert) | 확정 시 — 범위의 각 주 (이력) |
| `weeks` | `focus_min`·`short_break_min`·`long_break_min` (upsert, 계획 대상 주) | 확정 시 `baseline` 이 있으면 (§3.8 연계 — 관리 규칙은 pomo-baseline) |

이 기능이 **쓰지 않는** 컬럼: `weeks.planned_at`·`budget`·`capacity` (week-plan 소관),
`week_items.completed_at` (완료 확정은 사용자 클릭 — Q14, week-plan 소관),
`sessions.*` (리뷰는 세션을 읽기만 한다).

### 파생식

| 값 | 식 |
|---|---|
| 항목 소진 | `count(sessions where kind='focus' and task_id in (select id from tasks where week_item_id = ?))` |
| 주 소진 | `count(sessions where kind='focus' and local_week = ?)` |
| 공부한 날 | `count(distinct local_date)` (같은 필터) |
| 미분류 뽀모 | 위 주 소진 중 `task_id is null` |
| 남은 몫 | `max(1, week_items.est_pomos − 항목 소진)` (Q13 — 항목 est 기준) |
| 축소 기본값 | `ceil(남은 몫 / 2)` |
| 이월 배지 N주째 | `(week − origin_week) / 7 + 1` — 날짜 산술 한 줄. 사슬 길이 아님 (Q12) |
| 주 예산 | `weeks.budget ?? sum(weeks.capacity ?? settings.weekly_capacity)` |

- 항목 소진과 주 소진이 항상 정합인 이유: pull 이 오늘이 속한 주의 항목으로 제한되어
  있어 `sessions.local_week` 과 항목의 `week` 이 어긋날 수 없다 (Q10 / ADR-011 §2).
- 주 필터는 `local_week` 저장 컬럼에 직접 건다. `strftime()` 파생 금지 (ADR-011 §3).

### 3택 대상 조회 조건

```sql
SELECT * FROM week_items
WHERE week BETWEEN :from AND :to      -- 정산 범위. 달력 키 사전순 = 시간순
  AND completed_at IS NULL            -- 완료는 3택 대상 아님 (Q14)
  AND dropped_at   IS NULL
  AND deleted_at   IS NULL
  AND is_system = 0                   -- "기타" 제외 (Q7)
ORDER BY week, created_at;
```

---

## 확정 트랜잭션

`review.settle` 은 **유스케이스 1개 = 트랜잭션 1개**다 (ADR-007). 중간 실패 시 반쯤
정산된 상태가 남지 않는다 (PRD R22).

```ts
function settle(input): SettleResult {
  return db.transaction(() => {
    // 1. 재판정 — 낙관적 동시성
    const st = evaluateSettlement(now());
    if (!st.needed) throw Err('STALE_RANGE');
    if (st.from !== input.expectedRange.from ||
        st.to   !== input.expectedRange.to   ||
        st.targetWeek !== input.targetWeek) throw Err('STALE_RANGE');

    // 2. 대상 항목 조회 (위 SQL)
    const items = selectPendingItems(st.from, st.to);

    // 3. 결정 정합 검증 — 누락·미지의 id·범위 밖 축소값은 전부 거부
    assertOneDecisionPerItem(items, input.decisions);   // DECISION_MISSING / DECISION_UNKNOWN
    assertReducedInRange(items, input.decisions);       // REDUCED_OUT_OF_RANGE

    const ts = now();                                  // 순간 = UTC ISO (ADR-009)

    // 4. drop — soft. 원본 행은 남는다
    for (const d of input.decisions.filter(isDrop))
      update('week_items', d.itemId, { dropped_at: ts, updated_at: ts });

    // 5. carry / carry_reduced — 계획 대상 주에 새 행을 "생성"한다
    for (const d of input.decisions.filter(isCarry)) {
      const src = items.byId(d.itemId);
      insert('week_items', {
        id: uuidv7(),
        week: input.targetWeek,
        title: src.title,
        est_pomos: d.kind === 'carry' ? src.remaining : d.estPomos,
        milestone_id: src.milestone_id,      // 마일스톤 연결 승계
        days: '[]',                          // 요일 배치는 플래너에서 다시 (week-plan)
        origin_week: src.origin_week,        // 박제 승계 — 배지의 근거 (Q12)
        carry_from_id: src.id,               // 직전 원본. 이력 전용
        is_system: 0,
        created_at: ts, updated_at: ts,
      });
      // 원본은 상태를 바꾸지 않는다 — "그 주에 미완료로 남았다"가 사실이다.
      // 재정산은 워터마크(8단계)가 막으므로 원본이 다시 범위에 들어오지 않는다.
    }

    // 6. 정산 이력 스냅샷 — 판정에는 쓰지 않는다 (Q5)
    for (const w of weeksBetween(st.from, st.to))
      upsertWeek(w, { settled_at: ts });

    // 7. 뽀모 길이 스냅샷 (선택) — 관리 규칙은 pomo-baseline 소관
    if (input.baseline)
      upsertWeek(input.targetWeek, { ...input.baseline });

    // 8. 워터마크 전진 — 정산한 주가 아니라 targetWeek − 7일 (= st.to)
    writeSetting('last_settled_week', st.to);

    return { settledThrough: st.to, ... };
  });
}
```

### 왜 이 순서인가

- **1단계 재판정**이 없으면, 리뷰 패널을 열어둔 채 자정을 넘긴 뒤 확정할 때 화면이
  보여준 범위와 실제 범위가 어긋난 상태로 워터마크가 전진한다 (항목이 조용히 건너뛰어짐).
- **8단계가 마지막**이라 앞 단계 중 어디서 실패해도 워터마크가 전진하지 않고,
  다음 실행에서 같은 범위가 그대로 다시 잡힌다.
- **5단계가 UPDATE 가 아니라 INSERT** 인 것이 Q12 의 핵심이다. 원본을 옮기면
  `origin_week` 박제와 "그 주에 무엇이 남았는가"라는 과거 사실이 동시에 파괴된다.

---

## 경계 시나리오

`plan_lead_days = 1`, 주 라벨은 렌더 전용 표기다.

| # | 상황 | 오늘 | 워터마크 | 계획 대상 주 | 정산 범위 | 기대 동작 |
|---|---|---|---|---|---|---|
| 1 | **첫 실행** (새 DB, 수요일) | W36 수 | 없음 → W35 로 초기화 | W36 | 빈 범위 | 배너 없음. 초기화 write 1회. 숙제 0 |
| 2 | 평일 정상 사용 | W36 수 | W35 | W36 | 빈 범위 | 조용 |
| 3 | **정시 일요일** | W36 일 | W35 | W37 | {W36} | 배너 ON. 확정 시 워터마크 ← W36, 이어서 W37 플래너 가능 |
| 4 | 시나리오 3 확정 직후 재판정 | W36 일 | W36 | W37 | 빈 범위 | 배너 즉시 소멸 |
| 5 | **3주 만에 복귀** | W36 화 | W32 | W36 | {W33,W34,W35} | 리뷰 화면 **1개**, 항목만 3주분. 전부 이월 pre-selected. 항목 0인 빈 주는 목록에 안 나옴 |
| 6 | 시나리오 5 확정 직후 | W36 화 | W35 | W36 | 빈 범위 | 조용. 그 주 일요일이 되면 다시 정시 경로(#3) |
| 7 | **리뷰 확정 후 같은 날 세션** | W36 일 밤 | W36 | W37 | 빈 범위 | 세션은 `local_week = W36`(이미 정산된 주)에 귀속. 방금 본 요약에는 미포함, 캘린더 점·항목 소진에는 정상 반영. **막지 않는다** (PRD R26) |
| 8 | **계획 대상 주에 이미 항목이 있음** | W36 일 | W35 | W37 | {W36} | 이월은 W37 에 **행을 추가**할 뿐이다. 기존 항목 삭제·제목 중복 병합·정렬 재계산 없음. 같은 제목이 두 행이 되는 것은 허용 (사실 보존) |
| 9 | 범위에 미완료 항목 0건 | W36 일 | W35 | W37 | {W36} | 배너·확정 경로 유지. `decisions: []` 로 확정 → 워터마크만 전진 (PRD R5) |
| 10 | 확정 도중 자정 통과 | W36 일 → 월 | W35 | W37 → W37 유지 | {W36} → {W36} 유지 | 범위가 같으면 통과. 달라지면 `STALE_RANGE` 로 중단, 아무것도 반영 안 됨 |
| 11 | `plan_lead_days` 를 0 으로 변경 | W36 월 | W35 | W36 | 빈 범위 | 판정식·리뷰 화면·확정 코드 무변경. "월요일 아침에 지난 주 리뷰" 경로로 자동 전환 |

시나리오 10 에서 lead 가 1 인 동안 토요일→일요일 자정을 넘기면 계획 대상 주가
`W36 → W37` 로 바뀌어 범위가 `빈 범위 → {W36}` 가 된다. 이때는 `STALE_RANGE` 가 아니라
**애초에 확정 요청이 있을 수 없는 상태**(빈 범위에서는 패널이 열리지 않음)이므로,
발생 가능한 경로는 "열어둔 패널을 들고 일요일→월요일을 넘기는" 경우다. lead 1 에서는
그 전이가 범위를 바꾸지 않아 통과한다.

---

## 시스템 영향

### 프로세스 경계

- 판정·집계·확정 전부 **main 프로세스**에서 수행한다. renderer 는 IPC 결과를 표시만
  한다 (ADR-001·ADR-007). renderer 가 워터마크를 직접 읽거나 쓰는 경로는 없다.
- 확정은 `better-sqlite3` 의 동기 트랜잭션 하나다. `PRAGMA foreign_keys = ON` 이
  켜져 있어야 `carry_from_id`·`milestone_id` FK 가 실제로 검증된다 (ADR-011 §7).

### 캐시 무효화

리뷰 확정 1회가 주간 카드·오늘 목록·마일스톤 소진·캘린더까지 건드린다. 무효화 대상:

- 정산 범위 각 주의 주간 데이터
- 계획 대상 주의 주간 데이터 (새 항목)
- 마일스톤 소진 (승계된 `milestone_id`)
- 정산 판정 상태 (배너)

> ⚠️ 가정: 위 목록은 이 기능이 바꾸는 사실의 범위에서 도출한 것이다. 구체적인
> Query invalidation 키 계층은 architecture/overview.md 에서 **미결정** 상태이므로
> (결정 원장 §F), 키가 확정되면 이 목록을 키로 옮겨 적는다. TBD.

### 시간·타임존

- 주 산술은 전부 날짜 산술이다 (`+7일`). ISO 주 번호 문자열 산술을 쓰지 않는다 —
  53주 연도에서 깨진다 (ADR-010 Context).
- `weekOf(today + lead)` 는 **로컬 날짜** 기준이고, 기록되는 시각(`settled_at`,
  `dropped_at`)은 **순간(UTC ISO)** 이다 (ADR-009 §1).
- 테스트는 시간 모듈에 가짜 시계를 주입해 시나리오 1~11 을 재현한다 (ADR-009 §3).
  특히 자정 경계·연말(53주 연도)·`plan_lead_days` 0/1/2 를 표로 돌린다.

### 데이터 안전

- `drop` 은 soft 다. 하드 삭제 경로를 이 기능에 만들지 않는다.
- 확정은 앱 시작 시 DB 백업 이후에만 일어나므로(ADR-011 §7), 최악의 경우 그날의
  백업으로 복구 가능하다.

### 다른 기능에 남기는 계약

| 상대 | 이 기능이 보장하는 것 |
|---|---|
| week-plan | 확정 후 계획 대상 주에는 이월 항목이 `days = '[]'` 로 존재한다. 신규 할당·요일 배치는 플래너가 이어서 한다 |
| pomo-baseline | 리뷰가 유일한 뽀모 길이 변경 진입점이며, 값은 계획 대상 주 `weeks` 행에 스냅샷된다 |
| today-tasks | 확정은 `task_pulls` 를 건드리지 않는다. 이월 항목은 pull 되지 않은 상태로 시작한다 |
| calendar-records | 확정은 `sessions` 를 수정하지 않는다. 정산 후의 세션도 원래 주에 정상 귀속된다 (시나리오 7) |
| app-shell | 배너·패널의 배치와 반응형은 셸이 정하고, 이 기능은 판정 결과와 내부 구성만 제공한다 |
