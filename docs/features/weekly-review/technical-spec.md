# Technical Spec: weekly-review

> 1차 근거: [정산·계획 플로우 시각화](../../decision-log/2026-08-04-settlement-flow.html) (판정식·시나리오 7종)
> + [결정 원장](../../decision-log/2026-08-04-planning-session.md) Q5·Q6·Q7·Q12·Q13·Q14
> + [리뷰 후속 결정](../../decision-log/2026-08-04-review-decisions.md) D1·D2·D3
> · [ADR-010](../../architecture/decisions/adr-010-week-definition.md)(주 정의·plan_lead_days)
> · [ADR-011](../../architecture/decisions/adr-011-schema-final.md)(스키마 — §1·§2 는 아래 ADR 로 부분 정정됨)
> · [ADR-012](../../architecture/decisions/adr-012-aggregation-predicate.md)(집계 술어·이월 규칙·기타 행 차액)
> · [ADR-013](../../architecture/decisions/adr-013-baseline-budget-effect.md)(예산 확정 저장·스냅샷 시점·효력 시점)
> · [ADR-014](../../architecture/decisions/adr-014-deletion-and-archive.md)(soft delete 범위)
> · [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md)(시간 포맷)
> · [ADR-007](../../architecture/decisions/adr-007-ipc-contract.md)(IPC 계약 — 본문 예시는 폐지된 스키마를 참조하며, 최신 트랜잭션 정의는 이 문서다)
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
부트스트랩 초기값          §0.2
```

핵심: 워터마크는 "정산한 주"가 아니라 **항상 `targetWeek − 1주`** 다. 확정 시와 첫
실행 초기화가 같은 값을 쓰기 때문에, 설치 직후 헛배너와 병합 정산 후 무한 배너가
같은 규칙 하나로 동시에 막힌다 (Q5).

주별 행(`weeks`)은 **판정에 사용하지 않는다.** 스냅샷·이력 전용이다
(제품 문장은 PRD R1 — 이 문서가 컬럼 매핑을 소유한다).

### 0.1 판정 의사코드 — 순수 함수

판정은 앱 시작·창 포커스·자정 tick 마다 도는 **읽기 명령**의 본체다. 따라서
**어떤 write 도 하지 않는다** (PRD R27). 워터마크가 없으면 초기화하지 않고
"판정 불가"를 돌려준다 — 읽기가 write 를 유발하면, 워터마크 유실 시 다음 포커스에서
조용히 재초기화돼 미정산 과거 주가 영구 스킵된다.

```ts
// main 프로세스. 주 산술은 전부 날짜 산술 (+7일 / −7일) — ADR-010 §2
function evaluateSettlement(now: Instant): SettlementStatus {
  const lead   = readSetting('plan_lead_days') ?? 1;
  const target = weekKey(addDays(localDate(now), lead));   // 계획 대상 주

  const wm = readSetting('last_settled_week');
  if (wm == null) {
    // 부트스트랩(§0.2) 이전. 여기서 쓰지 않는다 — 배너를 렌더하지 않을 뿐이다.
    return { needed: false, targetWeek: target };
  }

  const from = addDays(wm, 7);
  const to   = addDays(target, -7);

  if (from > to) {                        // 문자열 비교로 충분 (사전순 = 시간순)
    return { needed: false, targetWeek: target };
  }
  return { needed: true, targetWeek: target, from, to };
}
```

- `weekKey()` / `localDate()` / `addDays()` / `diffDays()` 는 `src/shared/` 의
  **시간 모듈 하나**가 소유한다 (ADR-009 §3). 이 기능의 코드에서 `new Date()` 직접 호출 금지.
- 달력 키는 사전순 = 시간순이므로 주 범위 비교·BETWEEN 이 문자열 비교로 성립한다.
- `from > to` 는 정상 상태다 — 평일 정상 사용과 확정 직후가 모두 이 경로다.
- 이 함수는 같은 입력에 같은 답을 돌려주고 부수효과가 없다. 몇 번 돌려도 안전하다.

### 0.2 부트스트랩 — 워터마크 초기화 (앱 시작 1회)

초기화는 판정이 아니라 **앱 시작 절차**의 일부다 (ADR-011 §7 의 백업·스키마 버전
검사와 같은 단계). 마이그레이션 적용 뒤, 창을 띄우기 전에 1회 수행한다.

```ts
function bootstrapWatermark(now: Instant): void {
  if (readSetting('last_settled_week') != null) return;      // 이미 있으면 손대지 않는다

  const target = weekKey(addDays(localDate(now), readSetting('plan_lead_days') ?? 1));
  const earliest = earliestRecordedWeek();   // min(sessions.local_week, week_items.week, weeks.week)

  const wm = earliest == null
    ? addDays(target, -7)                    // 진짜 첫 실행 — 숙제 0 (Q5)
    : minKey(addDays(target, -7), addDays(earliest, -7));   // 유실·복구된 DB — 밀린 주를 살린다

  writeSetting('last_settled_week', wm);
}
```

- **유실 폴백 정책 (결정)**: 키가 없는데 기록이 이미 있으면 `targetWeek − 7일` 이 아니라
  **가장 이른 기록 주 − 7일**로 초기화한다 (PRD R28). 그러면 미정산 과거 주가 정산
  범위에 들어오고, 병합은 화면 1개로 흡수되므로(PRD R6) 숙제가 쌓이지 않는다.
  `minKey` 를 쓰는 이유는 기록이 미래 주에만 있는 이상 상태에서도 워터마크가
  `targetWeek − 7일` 보다 뒤로 가지 않게 하기 위함이다.
- write 는 이 함수에서만 발생한다. 판정 경로에는 write 가 없다.

### 0.3 판정을 다시 도는 시점

- 앱 시작 시 1회 (부트스트랩 **다음에**)
- 창 포커스 획득 시
- 로컬 자정 경계를 넘겼을 때 (날짜 tick)
- 정산 확정 트랜잭션 직후 (배너 즉시 소멸 검증 — PRD R23)

판정은 순수 파생이므로 몇 번 돌려도 같은 답이고, 저장값을 바꾸지 않는다.

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
    weekCount: z.number().int().min(1),     // from..to 주 수 (렌더 라벨용)
    pendingItemCount: z.number().int().min(0),  // 넘어갈 건수. 0 도 유효 (PRD R5)
  }),
])
```

### `review.getPending()` — 정산 패널 데이터

**`getStatus` 와 같은 판별 유니온이다.** 패널은 배너에서만 열리지만, `STALE_RANGE` 후
재조회하면 범위가 사라져 있을 수 있다 (다른 창에서 확정했거나 자정을 넘겼거나). 그때
던지거나 빈 목록으로 답하는 대신 `{ needed: false, targetWeek }` 를 돌려 화면이
"지금 정산할 주가 없어요" 로 갈 수 있게 한다 (ux-spec §8). 아래는 `needed: true` 가지다.

```ts
input:  z.void()
output: z.object({
  needed: z.literal(true),
  targetWeek: WeekKey,
  targetWeekIsCurrent: z.boolean(),   // 확정 버튼 라벨 분기용 (ux-spec §7.1)
  from: WeekKey, to: WeekKey,
  summary: z.object({
    weeks: z.array(z.object({          // 범위 안에서 "기록이 있는 주"만. 오름차순
      week: WeekKey,
      studiedDays: z.number().int(),   // distinct sessions.local_date (kind='focus')
      measuredSec: z.number().int().min(0),  // 그 주 측정 시간(초). **분으로 접지 않는다**
      unplannedMeasuredSec: z.number().int(),// 차액(초) — 파생식 표. 하한 없음(음수는 버그)
    })),
    idleWeekCount: z.number().int(),   // 범위 내 기록이 전혀 없는 주 수 (공백 문구용)
    lastStudiedWeek: WeekKey.nullable(),          // 범위 밖일 수 있다 (PRD R31)
    lastStudiedMeasuredSec: z.number().int().min(0).nullable(),
  }),
  completed: z.array(z.object({        // 항목의 week 이 범위 안이고 completed_at 이 있는 항목
    id: Id, week: WeekKey, title: z.string(),
    measuredSec: z.number().int().min(0),
  })),
  pending: z.array(z.object({          // 2택 대상
    id: Id, week: WeekKey, title: z.string(),
    measuredSec: z.number().int().min(0), // 그 항목의 그 주 측정 시간(초)
    carryWeeks: z.number().int().min(1),  // 파생식 표 (Q12)
  })),
})
```

- `summary.weeks[]` **정의**: 범위(`from..to`) 안에서 **세션 1건 이상 또는 주간 항목
  1건 이상이 있는 주**만 담는다. 완전히 빈 주는 행을 만들지 않고 `idleWeekCount` 로만
  센다 (ux-spec §3). 범위 전체 주를 채우지 않는 이유는, 기록도 계획도 없는 주에는
  요약할 사실이 없기 때문이다.
- **초만 오간다** (ADR-031 §2). 합산·차액은 main 에서 초 단계로 끝내고, 반올림(내림)은
  renderer 가 표시 직전에 한 번만 한다. 분으로 접은 값을 계약에 담으면 화면의
  `총합 = Σ항목 + 기타` 항등식이 계약 레벨에서 깨진다.
- `lastStudiedWeek` 는 `from` 이전을 포함해 focus 세션이 있는 **가장 최근 주**다.
  그런 주가 없으면 두 필드 모두 `null`.
- `completed` 는 **항목의 `week`** 기준이다 — `completed_at` 시각이 범위 밖이어도
  포함한다("그 주의 계획이었는가"가 기준). `is_system = 1` 항목은 제외한다.
- `pending` 은 `is_system = 1` 항목(기타)을 제외한다 (Q7). **`estPomos`·`remaining` 이
  없다** — 남은 몫은 est 위에 서 있던 파생값이라 통화 교체와 함께 죽었다 (ADR-031 §1).
- **개수 필드가 계약 전체에 없다** (ADR-030 §1). 주 행·항목 행·조각 행 어디에도
  `spentPomos` 가 없고, 진행을 말하는 필드는 `measuredSec` 하나다. 계약에 없으면 화면이
  되살릴 수 없다는 것이 이 부재의 목적이다.
- **`baseline` 필드가 계약에 없다** (ADR-033 §3). 정산 패널은 길이에 대해 아무것도
  모른다 — 표시도 진입점도 없다. 길이의 유일한 편집 경로는 대기 중인 타이머의 ± 칩이고,
  ± 조절 자체가 저장이라 확인·확정 명령이 따로 없다.
- **`targetWeekBudget` 이 없다** (ADR-030 §1). 예산이 폐기된 통화라 확정 섹션의 중립
  사실 줄이 비교할 분모를 갖지 않는다 — 그 줄은 이제 `이월 N건` 하나만 말한다.

### `review.settle(input)` — 확정 (트랜잭션 1개)

**결정을 전 항목이 아니라 예외만 보낸다.** 패널은 모달이 아니므로(ux-spec §1) 열어둔
채 오늘 목록에서 항목을 완료 처리하는 것은 정상 사용인데, 전 항목의 결정을 보내고
서버가 집합 일치를 요구하면 그 정상 사용이 확정을 롤백시킨다.

**예외 종류는 하나뿐이다** (ADR-031 §1) — `carry_reduced` 는 줄일 대상인 est 와 함께
죽었고, 시간으로 대체하지 않는다 (이월 항목의 측정 시간은 정의상 0 이다).

```ts
const Exception = z.object({ kind: z.literal('drop'), itemId: Id });

input: z.object({
  expectedRange: z.object({ from: WeekKey, to: WeekKey }),   // 낙관적 동시성 — 확정 1단계
  targetWeek: WeekKey,
  exceptions: z.array(Exception),        // 비어 있으면 = 전부 이월 (PRD R13)
})
output: z.object({
  settledThrough: WeekKey,                 // 갱신된 워터마크 (= targetWeek − 7일)
  carriedItemIds: z.array(Id),             // 새로 생성된 계획 대상 주 항목
  droppedItemIds: z.array(Id),
  autoCarried: z.array(z.object({          // 예외에 없어 서버가 이월한 항목 = **이월 전부**
    sourceItemId: Id, newItemId: Id, title: z.string(),
  })),
  ignoredExceptionIds: z.array(Id),        // 그 사이 완료·삭제돼 pending 에서 빠진 항목의 예외
})
```

**서버 규칙 (계약의 핵심)**

1. 서버는 확정 시점에 pending 을 **다시 조회**하고, 예외 목록에 없는 항목은 **전부
   이월**한다. `exceptions: []` 는 "전부 이월"이라는 완전한 의사 표시다.
2. 재조회한 pending 에 없는 itemId 의 예외는 **무시**한다 (`ignoredExceptionIds`).
   완료·삭제·폐기된 항목, 시스템 항목, 범위 밖 항목이 모두 여기로 흡수된다.
3. 그 사이 새로 생긴 미완료 항목은 **이월**된다.
4. **클램프가 없다** (ADR-031 §1) — 자를 숫자가 페이로드에 없다.
5. `autoCarried` 는 **이월된 항목 전부**다. 2택에서는 이월이 예외로 전송되지 않으므로
   서버는 "화면이 무엇을 그리고 있었는지"를 알 수 없다 — 그 차집합은 화면이 자기 목록을
   빼서 낸다 (PRD R30, ux-spec §7.3). 응답은 사실을 숨기지 않는다.

**에러 코드**

| 코드 | 조건 | renderer 처리 |
|---|---|---|
| `STALE_RANGE` | 재판정한 범위·계획 대상 주가 `expectedRange`·`targetWeek` 와 다르다 (확정 중 자정·`plan_lead_days` 변경) | 재조회 후 재렌더, 선택 유지 규칙 적용 (ux-spec §8.1) |

이전 판의 `DECISION_MISSING`·`DECISION_UNKNOWN`·`REDUCED_OUT_OF_RANGE` 는 **없앤다.**

- `DECISION_MISSING` 은 개념적으로 사라진다 — 결정이 없는 항목은 이월이기 때문이다.
- `DECISION_UNKNOWN` 은 규칙 2(무시)로 흡수된다.
- `REDUCED_OUT_OF_RANGE` 는 축소 처분 자체가 사라져 대상이 없다 (ADR-031 §1).

남는 에러가 하나뿐인 것은 의도된 결과다. 정산 확정이 실패할 수 있는 유일한 정상
경로는 "보고 있던 범위가 실제로 달라졌다"뿐이다.

### 뽀모 길이는 이 기능의 관심사가 아니다

ADR-033 §3 에 따라 길이 편집 경로는 대기 중인 타이머의 ± 칩 하나로 단일화됐다.
정산 패널은 길이를 표시하지도, 그리로 가는 진입점을 두지도 않는다. 따라서

- `review.settle` 입력에 `baseline` 이 **없다.** 정산 확정 트랜잭션은 길이를 쓰지 않는다
  (이 사실은 바뀌지 않았다 — ADR-029 §2, 길이의 유일한 저장소는 `settings` 전역값이다).
- `review.getPending()` 응답에도 `baseline` 이 **없다** (위 계약 참고). 길이 값을
  읽고 쓰는 코드는 전부 timer·pomo-baseline 소관이고, 이 기능은 그 값을 참조조차
  하지 않는다.

### `review.dismissBanner()` — 만들지 않는다

배너 표시 여부는 판정의 파생이다. "무시했다"는 상태를 저장하면 저장값이 둘이 되어
Q5 가 닫은 구멍이 다시 열린다. 세션 내 임시 숨김은 renderer 로컬 상태로만 둔다.

---

## DB

주 키·달력 키의 포맷과 CHECK 는 ADR-009 §1·ADR-011 §6 을 따른다.
`weeks.budget` 은 **nullable** 이다 (ADR-018 §1). 사용자가 예산을 정한 적이 있으면 행
생성 시점에 해석된 값이 박제되고(ADR-013 §1·§2), 정한 적이 없으면 NULL 이다 — "아직
정하지 않았다"와 "예산 0 으로 하겠다"를 데이터에서 구분하기 위해서다. ADR-011 §1 의
`budget NULL = 기본값 파생`(조회 시점 파생) 은 폐기된 채로 남는다 — NULL 은 파생 신호가
아니라 **"기록 없음"** 이다.

### 읽는 것

| 테이블 | 컬럼 | 용도 |
|---|---|---|
| `settings` | `last_settled_week` | **판정의 유일한 저장 입력** (워터마크) |
| `settings` | `plan_lead_days` | 계획 대상 주 계산 (기본 1) |
| `weeks` | `week` | `earliestRecordedWeek` 의 후보 하나뿐이다 — 스냅샷 컬럼은 아무도 읽지 않는다 (ADR-030 §4) |
| `week_items` | `id`·`week`·`title`·`milestone_id`·`origin_week`·`carry_from_id`·`is_system`·`completed_at`·`dropped_at`·`deleted_at` | 2택 대상 조회, 배지 계산, 완료 목록 |
| `sessions` | `duration_sec`·`kind`·`local_week`·`local_date`·`task_id` | 측정 시간·공부한 날 수·차액 |
| `tasks` | `id`·`week_item_id`·`completed_at`·`deleted_at` | 항목별 소진 집계의 조인 경로 + 미완료 조각 재부모화 대상 |
| `sessions` | `local_week`·`local_date`·`kind`·`task_id` | 소진 뽀모·공부한 날·계획에 없던 집중 (전부 파생, 저장 금지 — 원칙 8) |

### 쓰는 것

| 테이블 | 컬럼 | 시점 |
|---|---|---|
| `settings` | `last_settled_week` | 부트스트랩 1회 (§0.2) / 확정 시 `targetWeek − 7일` |
| `week_items` | INSERT (이월 항목) | 확정 시 — 이월 |
| `week_items` | `dropped_at` | 확정 시 — `drop` (soft. 하드 삭제 금지 — ADR-014 §1) |
| `tasks` | `week_item_id` | 확정 시 — 이월 항목의 **미완료 조각 재부모화** (ADR-012 §3) |
| ~~`weeks`~~ | — | **확정은 이 테이블에 쓰지 않는다** (ADR-030 §4) |

- **이미 존재하는 `weeks` 행의 스냅샷 컬럼은 절대 덮어쓰지 않는다.** 확정이 건드리는
  것은 `settled_at` 뿐이다. 이 규칙이 "지각 정산가 진행 중인 주의 단위를 바꾼다"는
  결함을 스키마 레벨에서 닫는다 (ADR-013 §3).
- 이 기능이 **쓰지 않는** 컬럼: `weeks.planned_at` (week-plan 소관),
  `week_items.completed_at`(완료 확정은 사용자 클릭 — Q14), `settings.focus_min` 등
  (길이 변경은 독립 명령 — pomo-baseline), `sessions.*` (정산은 세션을 읽기만 한다).

### 파생식 — 이 표가 유일한 정의다

같은 식을 prd·ux-spec 에 다시 적지 않는다. 두 문서는 이 표를 참조한다.

| 값 | 식 |
|---|---|
| 항목 소진 | `count(sessions s JOIN tasks t ON s.task_id = t.id WHERE t.week_item_id = :item AND s.kind='focus' AND s.local_week = :itemWeek)` — **주 조건 필수** (ADR-012 §1) |
| 주 소진 | `count(sessions where kind='focus' and local_week = :week)` |
| 공부한 날 | `count(distinct local_date)` (같은 필터) |
| 계획에 없던 집중 (`unplannedPomos`) | `주 소진 − Σ(is_system = 0 인 항목의 소진)` — 차액 정의 (ADR-012 §4) |
| ~~남은 몫 (`remaining`)~~ | **폐기** (ADR-031 §1) — 피감수였던 `est_pomos` 가 사라졌다. 그 자리에 화면이 적는 것은 항목의 측정 시간이다 |
| ~~이월 est (`carryEst`)~~ | **폐기** (ADR-031 §1) |
| ~~축소 기본값~~ | **폐기** (ADR-031 §1) |
| 항목 측정 시간 | `sum(sessions.duration_sec)` — 술어는 항목 소진과 **한 글자도 다르지 않다** (ADR-012 §1). 개수와 초가 다른 집합에서 나오면 두 숫자가 서로를 반증한다 |
| 계획에 없던 집중(초) | `주 총 focus 초 − Σ(is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL 항목의 focus 초)` — **초 단계에서** 뺀다 (ADR-027 §1 · ADR-031 §2) |
| 이월 배지 N주째 (`carryWeeks`) | `diffDays(week, origin_week) / 7 + 1` — 시간 모듈의 `diffDays()` 로 계산한다. 문자열 산술·ms 나눗셈 금지 (ADR-010 §2). 사슬 길이 아님 (Q12) |
| ~~주 예산~~ · ~~새 `weeks` 행의 기본 예산~~ · ~~주간 총 집중 시간~~ | **폐기** (ADR-030 §1·§4 · ADR-029 §3) — 예산·가용량이 사라졌고 확정은 `weeks` 행을 만들지 않는다 |

- **차액 정의를 쓰는 이유**: `task_id IS NULL` 만 세면, 사후 캡처가 시스템 "기타"
  항목에 붙인 세션이 어느 숫자에도 들어가지 않는다. 명시 항목 10 · 기타 6 · NULL 2 인
  주에서 사용자는 18 대신 12 를 보게 된다. 차액이면 이중 계상도, 누락도 산술적으로
  불가능하다. 화면 개념은 주간 카드의 "기타 — 계획에 없던 집중"과 같다 (Q11).
- **항목 소진에 주 조건이 붙는 이유**: `sessions.local_week` 은 기록 시 1회 계산 후
  불변이므로 모든 세션이 자기 주에서 정확히 한 번 세어지고,
  `주 소진 = Σ(항목 소진) + 계획에 없던 집중` 이 **정의상** 성립한다 (ADR-012 §1).
  이 조건을 빠뜨리면 조용히 틀린 숫자가 나오므로 집계는 도메인 함수 한 곳에서만
  계산하고 화면이 직접 SQL 을 만들지 않는다 (ADR-008).
- 주 필터는 `local_week` 저장 컬럼에 직접 건다. `strftime()` 파생 금지 (ADR-011 §3).

### 2택 대상 조회 조건

```sql
SELECT * FROM week_items
WHERE week BETWEEN :from AND :to      -- 정산 범위. 달력 키 사전순 = 시간순
  AND completed_at IS NULL            -- 완료는 2택 대상 아님 (Q14)
  AND dropped_at   IS NULL
  AND deleted_at   IS NULL            -- ADR-014 §1
  AND is_system = 0                   -- "기타" 제외 (Q7)
ORDER BY week, created_at;
```

정렬은 서버가 주·생성순으로 주고, "3주 이상 먼저"는 `carryWeeks` 로 화면이 한다
(ux-spec §5.0) — 표시 정렬이므로 계약에 넣지 않는다.

---

## 확정 트랜잭션

`review.settle` 은 **유스케이스 1개 = 트랜잭션 1개**다 (ADR-007). 중간 실패 시 반쯤
정산된 상태가 남지 않는다 (PRD R22).

```ts
function settle(input): SettleResult {
  return db.transaction(() => {
    // 1. 재판정 — 낙관적 동시성 (순수 함수 호출. write 없음)
    const st = evaluateSettlement(now());
    if (!st.needed) throw Err('STALE_RANGE');
    if (st.from !== input.expectedRange.from ||
        st.to   !== input.expectedRange.to   ||
        st.targetWeek !== input.targetWeek) throw Err('STALE_RANGE');

    // 2. 대상 항목 재조회 — 화면이 보낸 목록이 아니라 지금의 사실
    const items = selectPendingItems(st.from, st.to);

    // 3. 예외 대조 — 거부하지 않고 흡수한다
    const known   = new Set(items.map(i => i.id));
    const ignored = input.exceptions.filter(e => !known.has(e.itemId)).map(e => e.itemId);
    const dropped = new Set(input.exceptions.filter(e => known.has(e.itemId)).map(e => e.itemId));

    const ts = now();                                  // 순간 = UTC ISO (ADR-009)

    // 4. drop — soft. 원본 행은 남는다 (dropped_at 으로 이력에 남는다)
    for (const it of items) if (dropped.has(it.id))
      update('week_items', it.id, { dropped_at: ts, updated_at: ts });

    // 5. 이월 — 예외에 없는 항목 전부.
    //    계획 대상 주에 새 행을 "생성"한다 (UPDATE 아님)
    for (const src of items) {
      if (dropped.has(src.id)) continue;

      const newId = uuidv7();
      insert('week_items', {
        id: newId,
        week: input.targetWeek,
        title: src.title,
        // est_pomos 컬럼은 2.0.0 마이그레이션이 걷어 갔다 — 쓰지 않는다.
        milestone_id: src.milestone_id,      // 마일스톤 연결 승계 (ADR-012 §3)
        days: '[]',                          // 요일 배치는 플래너에서 다시 (week-plan)
        origin_week: src.origin_week,        // 박제 승계 — 배지의 근거 (Q12)
        carry_from_id: src.id,               // 직전 원본. 이력 전용
        is_system: 0,
        created_at: ts, updated_at: ts,
      });

      // 5b. 미완료 조각 재부모화 (ADR-012 §3)
      //     이걸 해야 "지난 주 미완료 조각을 이번 주에 재개"가 성립한다.
      //     이미 붙은 세션의 귀속은 이동하지 않는다 — 항목 소진이 주 조건으로
      //     집계되므로(파생식 표) 과거 주의 숫자가 소급 변하지 않는다.
      execute(`UPDATE tasks SET week_item_id = ?, updated_at = ?
               WHERE week_item_id = ? AND completed_at IS NULL AND deleted_at IS NULL`,
              [newId, ts, src.id]);
      // 원본 항목 행은 상태를 바꾸지 않는다 — "그 주에 미완료로 남았다"가 사실이다.
      // 재정산은 워터마크(7단계)가 막으므로 원본이 다시 범위에 들어오지 않는다.
    }

    // 6. **주별 행이라는 단계 자체가 없다.** `weeks` 테이블은 2.0.0 마이그레이션이
    //    지웠다 (ADR-030 §4 · ADR-032). 박제하던 예산·가용량·길이가 전부 폐기된
    //    통화였고, settled_at 은 어떤 화면도 읽지 않았다 — 정산 필요 판정은
    //    워터마크 단독이다.

    // 7. 워터마크 전진 — 정산한 주가 아니라 targetWeek − 7일 (= st.to)
    writeSetting('last_settled_week', st.to);

    return { settledThrough: st.to, ignoredExceptionIds: ignored, ... };
  });
}
```

### 왜 이 순서인가

- **1단계 재판정**이 없으면, 정산 패널을 열어둔 채 자정을 넘긴 뒤 확정할 때 화면이
  보여준 범위와 실제 범위가 어긋난 상태로 워터마크가 전진한다 (항목이 조용히 건너뛰어짐).
  재판정은 순수 함수 호출이므로 이 단계가 write 를 만들지 않는다.
- **2단계가 화면 목록이 아니라 재조회**인 것이 "예외만 전송"의 짝이다. 서버가 사실의
  출처이므로, 열어둔 패널이 낡아도 결과가 틀리지 않는다.
- **5단계가 UPDATE 가 아니라 INSERT** 인 것이 Q12 의 핵심이다. 원본을 옮기면
  `origin_week` 박제와 "그 주에 무엇이 남았는가"라는 과거 사실이 동시에 파괴된다.
  대신 **조각(task)은 옮긴다**(5b) — 조각은 "무엇을 할 것인가"이고 항목은 "그 주의
  계획이었다"라는 서로 다른 사실이기 때문이다.
- **6단계는 사라졌다** (ADR-030 §4). 아래 문단은 그 단계가 존재하던 이유의 이력이며,
  박제 대상이 전부 폐기된 지금은 성립하지 않는다: 스냅샷 없는 주가 남으면 그 주의 예산·
  단위가 나중에 전역 설정값으로 해석되기 때문이다 (ADR-013 §2). 정산 범위의 과거 주도
  같은 이유로 행이 생긴다 — 계획도 세션도 없던 주에 확정으로 행이 처음 생기는 경우,
  그 시점 유효값이 박제되어 나중에 흔들리지 않는다.
- **7단계가 마지막**이라 앞 단계 중 어디서 실패해도 워터마크가 전진하지 않고,
  다음 실행에서 같은 범위가 그대로 다시 잡힌다.

### 비대칭 하나를 명시 수용한다

(이 절은 이력이다 — 축소 이월이 사라져 비대칭 자체가 없어졌다. ADR-031 §1)

~~`drop` 은 `dropped_at` 으로 이력에 남지만, **축소 이월로 잘려나간 몫은 어디에도
남지 않는다** — 새 항목의 `est_pomos` 가 작아질 뿐이고 원본의 est 와의 차이를 기록하는
컬럼이 없다. v1 은 이 차이를 보정하지 않는다 (PRD R36).~~

---

## 경계 시나리오

`plan_lead_days = 1`(별도 표기 없으면), 주 라벨은 렌더 전용 표기다.

| # | 상황 | 오늘 | 워터마크 | 계획 대상 주 | 정산 범위 | 기대 동작 |
|---|---|---|---|---|---|---|
| 1 | **첫 실행** (새 DB, 수요일) | W36 수 | 없음 → 부트스트랩이 W35 로 초기화 | W36 | 빈 범위 | 배너 없음. write 는 부트스트랩 1회. 숙제 0 |
| 2 | 평일 정상 사용 | W36 수 | W35 | W36 | 빈 범위 | 조용 |
| 3 | **정시 일요일** | W36 일 | W35 | W37 | {W36} | 배너 ON. 확정 시 워터마크 ← W36, 이어서 W37 플래너 가능 |
| 4 | 시나리오 3 확정 직후 재판정 | W36 일 | W36 | W37 | 빈 범위 | 배너 즉시 소멸 |
| 5 | **3주 만에 복귀** | W36 화 | W32 | W36 | {W33,W34,W35} | 정산 화면 **1개**, 항목만 3주분. 전부 이월이 기본. 항목·세션 0인 빈 주는 목록에 안 나옴 |
| 6 | 시나리오 5 확정 직후 | W36 화 | W35 | W36 | 빈 범위 | 조용. 그 주 일요일이 되면 다시 정시 경로(#3) |
| 7 | **정산 확정 후 같은 날 세션** | W36 일 밤 | W36 | W37 | 빈 범위 | 세션은 `local_week = W36`(이미 정산된 주)에 귀속. 방금 본 요약에는 미포함, 캘린더 점·항목 소진에는 정상 반영. **막지 않는다** (PRD R26) |
| 8 | **계획 대상 주에 이미 항목이 있음** | W36 일 | W35 | W37 | {W36} | 이월은 W37 에 **행을 추가**할 뿐이다. 기존 항목 삭제·제목 중복 병합·정렬 재계산 없음. 같은 제목이 두 행이 되는 것은 허용 (사실 보존) |
| 9 | 범위에 미완료 항목 0건 | W36 일 | W35 | W37 | {W36} | 배너·확정 경로 유지. `exceptions: []` 로 확정 → 워터마크만 전진 (PRD R5) |
| 10 | 확정 도중 자정 통과 (밀림 없음) | W36 일 → 월 | W35 | W37 → W37 유지 | {W36} → {W36} 유지 | 범위가 같으면 통과. 달라지면 `STALE_RANGE` 로 중단, 아무것도 반영 안 됨 |
| 11 | `plan_lead_days` 를 0 으로 변경 | W36 월 | W35 | W36 | 빈 범위 | 판정식·정산 화면·확정 코드 무변경. "월요일 아침에 지난 주 정산" 경로로 자동 전환 |
| 12 | **첫 실행 = 계획일** (새 DB, 일요일) | W36 일 | 없음 → **W36** 로 초기화 | W37 | 빈 범위 | 배너 없음(헛배너 방지 성립). **부작용: 설치일이 속한 주(W36)가 즉시 워터마크 뒤로 가서 그 주 기록은 어떤 정산에도 나오지 않는다.** 캘린더 점·항목 소진·주간 카드에는 정상 반영. **명시 수용** (PRD R39) |
| 13 | **lead 2 (토요일 계획)** | W36 토 | W35 | W37 (토 + 2일 = W37 월) | {W36} | 토요일에 배너 ON. 그날 밤 자정을 넘겨 일요일이 되어도 `일 + 2일 = W37 화` → 계획 대상 주 W37 그대로 → 범위 불변 → 열어둔 패널 통과 |
| 14 | **밀린 상태에서 토→일 통과** (lead 1) | W36 토 → 일 | W34 | W36 → **W37** | {W35} → **{W35,W36}** | 토요일에도 범위가 비어 있지 않아 패널이 열린다. 자정을 넘기면 범위가 **커져** `STALE_RANGE` → 재조회·재렌더. 기존 행 선택 유지 + 새 행(W36)은 이월 기본 (ux-spec §8.1) |
| 15 | 워터마크 키 유실 (3주 전 세션 있는 DB) | W36 수 | 없음 → **W32** 로 초기화 (가장 이른 기록 주 W33 − 7일) | W36 | {W33,W34,W35} | 밀린 주가 살아난다. 판정 경로는 write 하지 않으므로 "조용한 재초기화로 영구 스킵"이 발생하지 않는다 (§0.2) |

**정정**: 이전 판은 "빈 범위에서는 패널이 열리지 않으므로 토→일 전이에서는 확정 요청이
있을 수 없다"고 단정했다. **틀렸다.** 워터마크가 밀려 있으면(#14) 토요일에도 범위가
비어 있지 않아 패널이 열리고, 자정을 넘기면 범위가 커져 `STALE_RANGE` 가 발생한다.
따라서 `STALE_RANGE` 후처리(ux-spec §8.1)는 "범위가 줄어드는" 경우뿐 아니라
**커지는 경우**를 반드시 다뤄야 한다.

---

## 시스템 영향

### 프로세스 경계

- 판정·집계·확정 전부 **main 프로세스**에서 수행한다. renderer 는 IPC 결과를 표시만
  한다 (ADR-001·ADR-007). renderer 가 워터마크를 직접 읽거나 쓰는 경로는 없다.
- 워터마크 write 경로는 **부트스트랩(§0.2)과 확정(7단계) 두 곳뿐**이다. 읽기 명령은
  어떤 저장값도 바꾸지 않는다.
- 확정은 `better-sqlite3` 의 동기 트랜잭션 하나다. `PRAGMA foreign_keys = ON` 이
  켜져 있어야 `carry_from_id`·`milestone_id`·`tasks.week_item_id` FK 가 실제로
  검증된다 (ADR-011 §7).

### 캐시 무효화

정산 확정 1회가 주간 카드·오늘 목록·마일스톤 소진·캘린더까지 건드린다. 무효화 대상:

| 대상 | 왜 |
|---|---|
| 정산 범위 각 주의 주간 데이터 | 변하지 않는다 — 확정은 `weeks` 를 건드리지 않는다 (ADR-030 §4) |
| 계획 대상 주의 주간 데이터 | 이월 항목 INSERT + 주별 행 신규 생성 |
| **마일스톤 (목록·진척)** | 이월이 `milestone_id` 를 승계하므로 마일스톤에 연결된 항목이 늘어난다 (ADR-012 §3). 승계가 없으면 월 레이어가 주 경계마다 초기화되므로, 이 무효화는 기능 요구의 일부다 |
| 오늘 목록 | 미완료 조각의 `week_item_id` 가 바뀌어(5b) 조각의 소속 항목 표시가 달라진다 |
| 정산 판정 상태 (배너) | 워터마크 전진 |

**키 계층은 확정됐다** ([ADR-025](../../architecture/decisions/adr-025-query-key-hierarchy.md),
2026-08-07). 이전 판의 `⚠️ 가정` 블록은 이 표를 "키가 정해지면 옮겨 적는다"는 TBD 로
남겨 두었으나, architecture/overview.md 가 그 미결을 이미 닫았으므로 위 대상들을 실제
키로 적는다. 팩토리는 `src/renderer/shared/query/keys.ts` 다.

| 대상 | 키 |
|---|---|
| 정산 범위 각 주 | `keys.week(w)` — 범위의 주마다 하나씩 |
| 계획 대상 주 | `keys.week(계획 대상 주)` |
| 마일스톤 | `keys.monthAll()` — 마일스톤 전용 쿼리가 아직 없어 광역 prefix 로 둔다 |
| 오늘 목록 | `keys.today(currentDayKey)` |
| 정산 판정 상태 (배너) | `keys.reviewPending()` |

- **드로어·플래너 초안은 따로 적지 않는다.** 두 키가 `keys.week(w)` 의 하위이므로
  (`['week', w, 'drawer', id]`·`['week', w, 'planDraft']`) 주 키 무효화가 접두사로 함께
  잡는다 — M3a 가 그렇게 배치했다.
- **긴 키로 짧은 키를 잡을 수 없다.** M2 가 `['week', w, 'items']` 를 무효화하면서 주간
  카드(`['week', w]`)를 갱신한다고 믿었던 것이 그 실수였다. 무효화는 **주어진 키를
  접두사로 갖는 쿼리**를 잡으므로 방향이 반대다.
- 무효화 호출은 renderer 의 `dispatchInvalidation` 초크포인트를 통해서만 한다
  (ADR-025 §5, ESLint 강제). 확정 응답이 실어 보내는 주 키 목록을 그 사건의 payload 로
  넘긴다 — renderer 가 범위를 다시 계산하지 않는다.

### 시간·타임존

- 주 산술은 전부 날짜 산술이다 (`addDays(±7)`, `diffDays()`). ISO 주 번호 문자열
  산술이나 밀리초 나눗셈을 쓰지 않는다 — 53주 연도·DST 에서 깨진다 (ADR-010 Context).
- `weekOf(today + lead)` 는 **로컬 날짜** 기준이고, 기록되는 시각(`settled_at`,
  `dropped_at`)은 **순간(UTC ISO)** 이다 (ADR-009 §1).
- 테스트는 시간 모듈에 가짜 시계를 주입해 시나리오 1~15 를 재현한다 (ADR-009 §3).
  특히 자정 경계·연말(53주 연도)·`plan_lead_days` 0/1/2 를 표로 돌린다.

### 데이터 안전

- `drop` 은 soft(`dropped_at`)이고, 삭제(`deleted_at`)는 이 기능이 쓰지 않는다
  (ADR-014 §1). 하드 삭제 경로를 이 기능에 만들지 않는다.
- 확정은 앱 시작 시 DB 백업 이후에만 일어나므로(ADR-011 §7), 최악의 경우 그날의
  백업으로 복구 가능하다.

### 다른 기능에 남기는 계약

| 상대 | 이 기능이 보장하는 것 |
|---|---|
| week-plan | 확정 후 계획 대상 주에는 이월 항목이 `days = '[]'` 로 존재한다. 신규 할당·요일 배치는 플래너가 이어서 한다 |
| pomo-baseline | 정산은 길이에 대해 아무것도 모른다 — 표시도 진입점도 없다 (ADR-033 §3). 편집은 타이머의 ± 칩 하나로 단일화됐고, 저장은 즉시 효력을 갖고 적용은 다음 세션부터다 (ADR-029 §1) |
| milestones | 이월은 `milestone_id` 를 승계하므로, 확정 후 마일스톤에 연결된 주간 항목이 늘어난다. 마일스톤 행 자체는 건드리지 않는다. 월말 마일스톤 재설정 흐름은 **v1 비범위** |
| today-tasks | 확정은 `task_pulls` 행을 만들거나 지우지 않는다. 다만 미완료 조각이 이월 항목으로 재부모화되므로(5b), 이미 pull 된 조각은 오늘 목록에 남은 채 **소속 항목만** 바뀐다 |
| calendar-records | 확정은 `sessions` 를 수정하지 않는다. 정산 후의 세션도 원래 주에 정상 귀속된다 (시나리오 7) |
| app-shell | 배너·패널의 배치와 반응형은 셸이 정하고, 이 기능은 판정 결과와 내부 구성만 제공한다. 워터마크 부트스트랩은 앱 시작 절차의 일부다 (§0.2) |
