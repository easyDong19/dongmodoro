# M3b 주간 정산 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

**Goal:** 한 주가 끝나는 지점에서 남은 항목을 **화면 1개·클릭 1회**로 처분하고, 그 결과가 계획 대상 주의 항목·워터마크·주간 카드까지 한 트랜잭션으로 반영되는 줄기를 화면에서 끝까지 통과시킨다. 몇 주를 비우고 돌아와도 화면은 여전히 1개다.

**Architecture:** [weekly-review](../features/weekly-review/overview.md) 기능 문서 3종(prd 40개 요구사항 · technical-spec 판정식·확정 트랜잭션 · ux-spec 문구·상태)의 실행분이다. 저장값은 **워터마크(`last_settled_week`) 하나**이고 나머지는 전부 파생이라 판정에 조건 분기가 없다. 확정은 화면이 보낸 목록이 아니라 **서버가 확정 시점에 재조회한 사실**로 수행하며, 예외(축소 이월·보내주기)만 전송받는다 — 패널이 모달이 아니라는 약속(R7)과 확정이 실패하지 않는다는 약속(R29)이 같은 설계에서 나온다. 스키마는 M1 이 ADR-011 대로 이미 세웠고 `weeks.settled_at`·`week_items.carry_from_id`·`origin_week`·`dropped_at`·`milestone_id` 가 전부 존재하므로 **마이그레이션이 없다.**

**Tech Stack:** M3a 스택 그대로 (Electron + electron-vite + React 19 + TS strict, better-sqlite3 + drizzle, zod 4, TanStack Query 5, Tailwind 4 + shadcn/ui, Vitest, uuid v7). 추가 의존성 없음.

## Global Constraints

M1·M2·M3a 계획의 Global Constraints 가 전부 그대로 적용된다 (pnpm 전용, BrowserWindow 보안 플래그, `handleIpc` 로만 IPC 등록, Drizzle import 는 `src/main/db/` 만, `src/shared/` 순수 TS, 시간은 `src/shared/time/` 초크포인트, 주 시작 월요일, UI 이모지 금지·토큰만, 커밋 영어 Conventional Commits, husky 훅 우회 금지). 여기에 이번 마일스톤의 것:

- **판정 경로의 write 는 0 이다** (R27). `review.getStatus`·`review.getPending` 은 어떤 저장값도 바꾸지 않는다. 워터마크 write 경로는 **부트스트랩 1회와 확정 트랜잭션 두 곳뿐**이며, 이 규칙은 Task 2 의 테스트가 기계적으로 감시한다.
- **주 산술은 전부 날짜 산술이다** (`addDays(±7)`·`diffDays`). ISO 주 번호 문자열 산술과 밀리초 나눗셈 금지 — 53주 연도·DST 에서 깨진다 (ADR-010 Context).
- **파생식은 [technical-spec 파생식 표](../features/weekly-review/technical-spec.md#파생식--이-표가-유일한-정의다)가 유일한 출처다.** 이 계획서는 식을 새로 정하지 않고 인용만 한다. 남은 몫 클램프는 M3a 의 `remainingPomos`(week-plan.ts)를 **재사용한다** — 정산이 자기 클램프를 다시 만들면 두 곳이 갈린다 (M3a 메모 #4).
- **항목 소진 집계에는 주 조건(`sessions.local_week = 항목의 week`)이 필수다** (ADR-012 §1). 빠뜨리면 조용히 틀린 숫자가 나오므로 SQL 은 리포지토리 한 곳에만 둔다.
- **`drop` 은 soft 다** (`dropped_at`). 하드 삭제 경로를 이 기능에 만들지 않고 `deleted_at` 도 쓰지 않는다 (ADR-014 §1). UI 문구로 "버리기"·"삭제"를 쓰지 않는다.
- **이미 스냅샷이 있는 `weeks` 행의 스냅샷 컬럼을 덮어쓰지 않는다** (ADR-013 §3). 확정이 기존 행에서 건드리는 것은 `settled_at` 뿐이다.
- **`weekly_capacity` 는 여전히 미설정(NULL)이다** — 이번에도 시딩하지 않는다. 따라서 새로 만드는 `weeks` 행의 `capacity`·`budget` 은 NULL 이 될 수 있고, `[0,…]` 이나 0 을 지어내지 않는다 (ADR-018 §1·§4).
- **`milestone_id` 는 여전히 항상 NULL** 이다. 승계 코드는 넣지만(R35) 화면에 마일스톤 칩·배지를 만들지 않는다.
- **`--danger` 는 `보내주기` 아이콘에만.** 라벨 글자·행 배경에 쓰지 않는다 (design-system ADR-003 §5). 정산 대기는 실패도 파괴도 아니므로 배너는 `--amber` 다 (principles §1·§2).
- **접근성 기준선** (principles §7): 조작 타깃 `--target-min`(24px) 하한, 포커스 링 유지, 색 단독 구분 금지, `prefers-reduced-motion: reduce` 시 전이 즉시 반영.
- **작업 브랜치는 `feature/m3b-weekly-review` 하나**이며 태스크마다 커밋한다.

---

## 이번 마일스톤에서 뺀 것 (사용자 결정 2026-08-10)

**"안 만든다"가 아니라 "지금은 값이 없어서 미룬다"** 이다. 각 항목이 언제 살아나는지 함께 적는다.

| 뺀 것 | 이유 | 언제 살아나나 |
|---|---|---|
| **뽀모 길이 편집 UI 로의 진입점** (R24·R38) | PRD 범위에 "진입점 제공"이 있으나 **갈 화면이 없다.** pomo-baseline 의 편집 UI·유효 범위·기본값은 이 마일스톤 비범위이므로, 진입점을 만들면 아무 데도 닿지 않는 버튼이 된다 | pomo-baseline 마일스톤. 그때 `조정` 버튼과 변경 전/후 총 집중 시간 비교(R38)를 함께 만든다 |
| ├ 현재 길이 **표시**는 남긴다 | `뽀모 길이 — 집중 25 · 짧은 휴식 5 · 긴 휴식 15` 는 `getPending.baseline` 만으로 렌더된다. 사실 표시라 갈 곳이 없어도 성립한다 | — (이번에 만든다) |
| **요일별 부하 그래프** (week-plan R22-2) | `weekly_capacity` 가 여전히 NULL 이라 기준선이 없다. 기준 없는 막대 7개는 판단 근거가 못 된다 | pomo-baseline 이 capacity 편집을 만들 때 |
| **기타 행 드릴다운** (week-plan §6.4) | 새 IPC 채널 + 상관 서브쿼리를 써서 만드는 것이 읽기 전용 이름 목록이다. 정산과 독립이라 언제 붙여도 된다 | 언제든 |
| **월말 마일스톤 재설정 흐름** | PRD 가 **v1 비범위**로 명시 (초안 §3.6 의 병합 제안 폐기) | v1 이후 |
| **반응형 3구간 · 패널의 최종 배치** | app-shell(M4) 소관 | M4 |

**M3b 에서 검증할 수 없는 인수 기준:**

| 인수 기준 | 상태 |
|---|---|
| A29 (길이 변경 전/후 총 집중 시간) | 검증 불가 — 편집 UI 를 뺐다. `baseline` **표시**는 검증한다 |
| A17 후반 (새 값이 다음 주 행에 박제) | **부분** — 스냅샷 저장·불변은 검증하고(Task 5·6), 길이를 실제로 바꾸는 경로가 없어 "바꾼 값이 박제되는지"는 테스트가 설정값을 직접 주입해 검증한다 |
| A24·A25 의 capacity 의존 부분 | **부분** — 예산이 NULL 인 경로만 실측 가능. 예산이 있는 경로는 테스트가 `weeks.budget` 을 직접 심어 검증한다 |

---

## 이 계획서가 확정한 것 3건 (기능 문서를 같은 PR 에서 고친다)

계획은 결정을 만들지 않는다 (docs/CLAUDE.md). 아래 셋은 **문서끼리 어긋나 있거나 문서가 미결로 남긴 자리**이므로, 계획대로 구현하면서 해당 문서를 **같은 PR 에서 정정**한다. 소급 수정이 아니라 현재 판을 고치는 것이다.

### 정정 ① 주 라벨은 `W35` 가 아니라 날짜다

ux-spec 은 배너·요약·행 출처에 `W35` 를 쓴다. **ISO 주 번호를 새로 구현하지 않는다** — ADR-010 Context 가 53주 연도에서 깨진다고 경고한 바로 그 계산이고, 이미 M3a 가 주간 카드 헤더를 `weekRangeLabel()`(`8/3 – 8/9`)로 렌더하고 있어 같은 컬럼 안에서 두 표기가 섞인다.

- 헤더·배너: 기존 `weekRangeLabel(week)` → `8/3 – 8/9`, 범위가 2주 이상이면 `weekRangeLabel(from)` 의 시작과 `weekRangeLabel(to)` 의 끝을 이어 `8/3 – 8/23`.
- 행 출처 라벨처럼 좁은 자리: 신규 `weekStartLabel(week)` → `8/3` (Task 1).
- **ux-spec §2·§3·§5.1 의 `W35`·`W33–W35` 표기를 이 규칙으로 바꾼다** (Task 13).

### 정정 ② `targetWeekBudget` 은 nullable 이다

technical-spec 의 `review.getPending` 은 `targetWeekBudget: z.number().int()` 로 **non-nullable** 인데, `weekly_capacity` 를 시딩하지 않기로 한 이상 "기본 예산(가용량 합)"이 존재하지 않는다. 0 을 채우면 ADR-018 §1 이 구분하려던 **"기록 없음"과 "예산 0"** 이 다시 뭉개진다.

- 계약을 `z.int().nullable()` 로 바꾼다.
- ux-spec §7.2 의 중립 사실 한 줄은 예산이 `null` 이면 `이월 60` 만 적는다 — `다음 주 예산 0` 은 거짓말이다.
- **technical-spec 의 계약 블록과 ux-spec §7.2 를 같은 PR 에서 고친다** (Task 13).

### 정정 ③ 패널은 주간 카드를 통째로 대신하는 인라인 모드다

ux-spec §10 은 배치를 app-shell 소관으로 넘겼고 app-shell 은 M4 다. M3b 는 화면이 필요하므로 **잠정 배치**를 정한다.

- 패널은 **주간 카드 자리에 인라인으로** 뜬다 — M3a 의 플래너와 같은 방식(`WeekCard` 가 자기 대신 렌더). 오버레이로 덮으면 타이머·오늘 목록을 계속 쓸 수 있어야 한다는 R7 이 실질적으로 깨진다.
- 대가는 폭이다. 카드가 360px 라 3택 세그먼트가 제목 아래 **자기 줄**로 내려간다 (§5.1 의 좌→우 한 줄 배치는 넓은 구간의 그림이다).
- **app-shell 이 나중에 다르게 정할 수 있다.** 이 배치를 ux-spec 에 박지 않고 계획서에만 남긴다.

---

## 판정식 — technical-spec 인용

이 계획서는 **결정하지 않는다.** [technical-spec §0](../features/weekly-review/technical-spec.md) 이 정한 것을 그대로 옮긴다.

```
저장값   settings['last_settled_week']    "여기까지 정산 끝" 워터마크 (달력 키, 월요일)
설정값   settings['plan_lead_days']        기본 1

계획 대상 주 targetWeek = weekOf( today + plan_lead_days 일 )
정산 범위    from … to  = last_settled_week + 7일 … targetWeek − 7일
정산 대기               = from <= to
확정 시                 last_settled_week ← targetWeek − 7일  (= to)
부트스트랩 초기값        기록 없음 → targetWeek − 7일
                        기록 있음 → min(targetWeek − 7일, 가장 이른 기록 주 − 7일)
```

**워터마크가 "정산한 주"가 아니라 항상 `targetWeek − 1주`** 인 것이 이 설계의 전부다. 확정 시와 첫 실행 초기화가 같은 값을 쓰기 때문에 설치 직후 헛배너와 병합 정산 후 무한 배너가 규칙 하나로 함께 막힌다.

**부트스트랩이 판정과 분리된 이유**: 판정은 앱 시작·창 포커스·자정 tick 마다 도는 읽기 경로다. 읽기가 write 를 유발하면 워터마크 유실 시 다음 포커스에서 조용히 재초기화돼 **미정산 과거 주가 영구 스킵**된다. 그래서 판정은 워터마크가 없으면 초기화하지 않고 `needed: false` 를 돌린다.

---

## 파일 구조 (신규·수정만)

```
src/
├── shared/
│   ├── ipc/
│   │   ├── channels.ts          # (수정) review.* invoke 채널 3종
│   │   ├── contracts.ts         # (수정) review.* req/res + clockBoundary 요일 필드
│   │   └── api.ts               # 무수정 — contracts 에서 기계적으로 파생된다
│   └── time/index.ts            # (수정) addWeeks · weeksBetween · weekStartLabel · weekdayIndex
├── main/
│   ├── services/
│   │   ├── ports.ts             # (수정) ReviewRepository 신규 + WeeksRepository.ensure 시그니처
│   │   ├── baseline.ts          # (수정) weekSnapshot() — ensure 에 넘길 스냅샷 조립
│   │   ├── review.ts            # 신규 — 판정 순수 함수 + 부트스트랩 + 3 유스케이스
│   │   ├── week-plan.ts         # (수정) ensure 호출부
│   │   └── sessions.ts          # (수정) ensure 호출부
│   ├── ipc/review.ts            # 신규 — review.* 핸들러
│   ├── index.ts                 # (수정) 부트스트랩 1회 + review 핸들러 등록
│   └── db/repositories/
│       ├── drizzle.ts           # (수정) ReviewRepository 구현 + weeks.ensure 확장
│       ├── test-helpers.ts      # (수정) ensure 시그니처
│       └── review.test.ts       # 신규 — 계약 테스트
├── preload/index.ts             # (수정) review.* invoke 표면
└── renderer/
    ├── app/App.tsx              # 무수정 (패널이 주간 카드 안쪽이다)
    ├── shared/
    │   ├── query/keys.ts        # (수정) reviewPending 은 이미 있다 — 주석만 갱신
    │   ├── query/invalidate.ts  # (수정) 'settled' 사건
    │   └── ui/Segmented.tsx     # 신규 — 3택 세그먼트 (aria-pressed + 보더 필수)
    │   └── ui/Stepper.tsx       # 신규 — 축소 스테퍼
    └── features/review/
        ├── ReviewBanner.tsx · useReviewStatus.ts
        ├── ReviewPanel.tsx · useReview.ts
        ├── SummarySection.tsx · CompletedSection.tsx
        ├── PendingSection.tsx · PendingRow.tsx
        └── ConfirmSection.tsx
tests → 각 모듈 옆 *.test.ts(x)
```

**renderer 테스트 파일은 전부 jsdom 도크블록으로 시작한다** (`vitest.config.ts` 의 기본 환경이 `'node'` 다):

```tsx
// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
```

**이벤트 채널(`EVENT_CHANNELS`)을 추가하지 않는다.** 확정은 renderer 가 시작하는 invoke 이므로 mutation `onSuccess` 에서 `dispatchInvalidation` 을 부른다.

---

### Task 1: 시간 모듈 확장 + `clock.now` 요일 필드

판정식·배너 라벨·M3a 가 미룬 3종이 전부 이 태스크의 산출물에 매달려 있다. 먼저 놓는다.

`weeksSince(originWeek, week)`(= `N주째`)와 `weekRangeLabel(week)` 은 M3a 가 이미 만들었다 — **다시 만들지 않는다.**

**Files:**
- Modify: `src/shared/time/index.ts`, `src/shared/ipc/contracts.ts`
- Test: `src/shared/time/index.test.ts` (기존), `src/main/services/clock.test.ts` (기존 — payload 필드가 늘어난다)

**Interfaces:**
- Produces: `addWeeks(weekKey, n): string`, `weeksBetween(from, to): string[]`, `weekStartLabel(week): string`, `CalendarKeys.weekdayIndex: number` (0 = 월요일)

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// src/shared/time/index.test.ts 에 추가
describe('addWeeks — 날짜 산술 (ADR-010 §2)', () => {
  it('앞뒤로 7일씩 움직인다', () => {
    expect(addWeeks('2026-08-03', 1)).toBe('2026-08-10')
    expect(addWeeks('2026-08-03', -1)).toBe('2026-07-27')
    expect(addWeeks('2026-08-03', 0)).toBe('2026-08-03')
  })
  it('연말 경계를 넘는다 — 53주 연도에서도 주 번호를 세지 않는다', () => {
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04')
  })
})

describe('weeksBetween — 양끝 포함', () => {
  it('같은 주면 그 주 하나', () => {
    expect(weeksBetween('2026-08-03', '2026-08-03')).toEqual(['2026-08-03'])
  })
  it('3주 범위면 3개', () => {
    expect(weeksBetween('2026-08-03', '2026-08-17')).toEqual([
      '2026-08-03', '2026-08-10', '2026-08-17'
    ])
  })
  it('from > to 면 빈 배열 — 정상 상태다 (평일·확정 직후)', () => {
    expect(weeksBetween('2026-08-10', '2026-08-03')).toEqual([])
  })
})

describe('weekStartLabel — 좁은 자리용 렌더 전용 라벨', () => {
  it('월/일만 준다', () => {
    expect(weekStartLabel('2026-08-03')).toBe('8/3')
  })
})

describe('calendarKeys.weekdayIndex — 0 = 월요일 (ADR-010 §1)', () => {
  it('월요일이 0, 일요일이 6', () => {
    expect(calendarKeys(Date.parse('2026-08-03T09:00:00')).weekdayIndex).toBe(0)
    expect(calendarKeys(Date.parse('2026-08-09T09:00:00')).weekdayIndex).toBe(6)
  })
})
```

- [x] **Step 2: 실행해 실패 확인** — FAIL

- [x] **Step 3: 구현**

`addWeeks` 는 기존의 private `dayNumber()`/날짜 산술 위에 얹는다. 주 키는 항상 월요일이므로 `addDays(±7n)` 이면 다시 월요일이다.

```ts
/**
 * 주 키를 n 주 앞뒤로 옮긴다. 주 번호가 아니라 **날짜**를 더한다 — ISO 주 번호 산술은
 * 53주 연도에서 깨진다 (ADR-010 Context). 주 키가 항상 월요일이므로 ±7n 이면 월요일이 유지된다.
 */
export function addWeeks(weekKey: string, n: number): string

/** from…to 양끝 포함. `from > to` 는 빈 배열이며 이것이 정상 상태다 (정산 범위 없음). */
export function weeksBetween(from: string, to: string): string[]

/** 좁은 자리용 라벨 `8/3`. 저장값이 아니라 렌더 전용이다 (ADR-010 §2). */
export function weekStartLabel(week: string): string
```

`weekdayIndex` 는 `CalendarKeys`·`LocalKeys` 를 만드는 자리에서 함께 계산한다. **renderer 는 이 값을 계산하지 않는다** — ESLint 의 `TIME_SELECTORS` 가 `new Date()` 를 막고 있으므로 `useClock()` 이 실어다 주는 이 필드가 유일한 통로다.

`clockBoundarySchema` 에 `weekdayIndex: z.int().min(0).max(6)` 을 더한다. **이 스키마는 `contracts.clock.now`(invoke 응답)와 `eventContracts.clockBoundary`(이벤트 payload)가 공유한다** — 한 곳만 고치면 되지만, 두 계약이 동시에 넓어진다는 뜻이기도 하다. `ClockBoundary` 객체를 손으로 만드는 테스트가 전부 TS 에러가 나므로 함께 고친다:

```bash
grep -rn "monthKey: '" src --include=*.test.ts --include=*.test.tsx
```

- [x] **Step 4: 통과 확인** — `pnpm test && pnpm typecheck` PASS

- [x] **Step 5: 커밋** — `feat: add week arithmetic helpers and a weekday field to the clock payload`

---

### Task 2: 워터마크 부트스트랩 + 판정식 + `review.getStatus`

**이 태스크가 마일스톤에서 가장 조심스러운 자리다.** 판정 경로에 write 가 하나라도 섞이면 워터마크 유실 시 과거 주가 영구 스킵된다 (R27·R28).

**Files:**
- Create: `src/main/services/review.ts`, `src/main/ipc/review.ts`, `src/main/services/review.test.ts`
- Modify: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`, `src/shared/ipc/channels.ts`, `src/shared/ipc/contracts.ts`, `src/preload/index.ts`, `src/main/index.ts`
- Test: `src/main/db/repositories/review.test.ts` (신규 — `earliestRecordedWeek`·`countPending` 계약)

**Interfaces:**
- Produces: `evaluateSettlement(repos, todayKey): SettlementStatus` (**순수 — write 0**), `bootstrapWatermark(uow, todayKey): void`, `reviewStatus(uow, todayKey)`, 채널 `review:getStatus`
- 시간 모듈에 `addDays(dayKey, n)`·`weekOfDay(dayKey)` 를 함께 넣었다 — 계획 대상 주가 `weekOf(오늘 + lead)` 라 **날짜** 산술이 필요한데 Task 1 은 주 키 산술만 만들었다
- 포트 신규:

```ts
export interface ReviewRepository {
  /** 기록이 있는 가장 이른 주 = min(sessions.local_week, week_items.week, weeks.week). 없으면 null. */
  earliestRecordedWeek(): string | null
  /** 3택 대상 건수 (배너용 스칼라). 조회 조건은 technical-spec "3택 대상 조회 조건" 그대로. */
  countPending(from: string, to: string): number
}
```

- [x] **Step 1: 실패하는 테스트 작성** — technical-spec 의 **경계 시나리오 15행을 표 테스트로 그대로 옮긴다.** 이것이 이 태스크의 인수 기준이다.

```ts
// src/main/services/review.test.ts
const CASES = [
  // # | 오늘        | 워터마크     | lead | 기대
  ['1  첫 실행',        '2026-09-02', null,         1, { needed: false }],
  ['2  평일 정상',      '2026-09-02', '2026-08-24', 1, { needed: false }],
  ['3  정시 일요일',    '2026-09-06', '2026-08-24', 1, { needed: true, from: '2026-08-31', to: '2026-08-31' }],
  ['5  3주 만에 복귀',  '2026-09-01', '2026-08-03', 1, { needed: true, from: '2026-08-10', to: '2026-08-24' }],
  ['11 lead 0',        '2026-08-31', '2026-08-24', 0, { needed: true, from: '2026-08-31', to: '2026-08-31' }],
  ['13 lead 2 토요일',  '2026-09-05', '2026-08-24', 2, { needed: true, from: '2026-08-31', to: '2026-08-31' }],
] as const

it.each(CASES)('%s', (_label, today, wm, lead, expected) => { /* ... */ })

it('판정은 저장값을 바꾸지 않는다 (R27) — 3회 연속 호출', () => {
  const { uow, writes } = spyingUow()          // settings.set 호출을 센다
  for (let i = 0; i < 3; i++) evaluateSettlement(uow, '2026-09-06')
  expect(writes).toEqual([])                    // A20
})

it('워터마크가 없으면 초기화하지 않고 needed:false 를 준다', () => {
  // 읽기가 write 를 유발하면 유실 시 과거 주가 영구 스킵된다 (§0.1)
})

describe('bootstrapWatermark', () => {
  it('이미 있으면 손대지 않는다', () => { /* ... */ })
  it('기록이 전혀 없으면 targetWeek − 7일 (A1)', () => { /* ... */ })
  it('기록이 있으면 가장 이른 기록 주 − 7일로 되돌린다 (A21 · 시나리오 15)', () => { /* ... */ })
  it('기록이 미래 주에만 있으면 targetWeek − 7일보다 뒤로 가지 않는다 (minKey)', () => { /* ... */ })
})
```

- [x] **Step 2: 실행해 실패 확인** — FAIL

- [x] **Step 3: 구현** — `review.ts`

```ts
/**
 * 정산 필요 판정 (technical-spec §0.1). **순수 읽기다 — write 0** (R27).
 *
 * 워터마크가 없으면 여기서 초기화하지 않는다. 판정은 앱 시작·창 포커스·자정 tick 마다
 * 도는 경로라, 읽기가 write 를 유발하면 워터마크 유실 시 다음 포커스에서 조용히
 * 재초기화돼 미정산 과거 주가 영구 스킵된다 (§0.1).
 */
export function evaluateSettlement(repos: Repositories, todayKey: string): SettlementStatus
```

`bootstrapWatermark` 는 `main/index.ts` 의 `startDb()` 안, `seedSettings(uow)` **다음**·창 생성 **전**에 1회 부른다. 시각은 `nowMs()` 를 한 번만 읽어 넘긴다 (ADR-022 §1 — 한 번의 시계 읽기).

`review.getStatus` 계약:

```ts
getStatus: {
  req: z.tuple([]),
  res: z.discriminatedUnion('needed', [
    z.strictObject({ needed: z.literal(false), targetWeek: z.string() }),
    z.strictObject({
      needed: z.literal(true), targetWeek: z.string(),
      from: z.string(), to: z.string(),
      weekCount: z.int().min(1), pendingItemCount: z.int().min(0)
    })
  ])
}
```

> **`pendingItemCount` 가 0 이어도 배너는 뜬다** (R5) — 워터마크를 전진시키는 것 자체가 확정의 일이다. 이 필드로 배너 문구만 갈린다.

- [x] **Step 4: 통과 확인** — `pnpm test` PASS. `registration.test.ts` 가 새 채널을 요구하므로 `registerReviewHandlers(uow)` 를 `main/index.ts` 와 그 테스트 양쪽에 넣는다 (M3a 에서 같은 곳이 걸렸다)

- [x] **Step 5: 커밋** — `feat: derive settlement status from the watermark and bootstrap it once at startup`

---

### Task 3: 정산 요약 집계

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`
- Test: `src/main/db/repositories/review.test.ts`

**Interfaces:**

```ts
export type ReviewWeekFact = {
  week: string
  studiedDays: number      // distinct sessions.local_date, kind='focus'
  spentPomos: number       // 주 소진
  budget: number | null    // 그 주 스냅샷. 행이 없거나 NULL 이면 null = "기록 없음"
  unplannedPomos: number   // 차액 — 주 소진 − Σ(is_system=0 항목의 소진)
}

interface ReviewRepository {
  /** 범위 안에서 **기록이 있는 주**만 (세션 ≥ 1 또는 항목 ≥ 1). 오름차순. */
  weekFacts(from: string, to: string): ReviewWeekFact[]
  /** focus 세션이 있는 가장 최근 주와 그 소진. **범위와 무관**하게 조회한다 (R31). 없으면 null. */
  lastStudied(): { week: string; spentPomos: number } | null
}
```

- [x] **Step 1: 실패하는 테스트 작성** — 핵심은 **등식**이다.

```ts
it('항목별 소진 합 + 계획에 없던 집중 = 그 주 소진 (R33 · A24)', () => {
  // 명시 항목 소진 10 · 시스템 기타 항목 소진 6 · 미분류 2
  const [fact] = repos.review.weekFacts(WEEK, WEEK)
  expect(fact.spentPomos).toBe(18)
  expect(fact.unplannedPomos).toBe(8)      // 6 + 2 — 차액이므로 둘이 합쳐 나온다
})

it('차액이므로 시스템 항목에 붙은 세션이 증발하지 않는다', () => {
  // task_id IS NULL 만 세면 12 가 나온다. 그 버그를 이 테스트가 잡는다
})

it('세션도 항목도 없는 주는 행을 만들지 않는다 (idle 로만 센다)', () => { /* ... */ })

it('예산이 NULL 인 주는 budget: null — 0 으로 만들지 않는다 (ADR-018 §1)', () => { /* ... */ })

it('lastStudied 는 정산 범위 밖도 본다 (R31 · A25)', () => { /* ... */ })
```

- [x] **Step 2: 실행해 실패 확인** — FAIL

- [x] **Step 3: 구현** — `unplannedPomos` 는 반드시 **차액**으로 계산한다. `task_id IS NULL` 만 세는 구현은 사후 캡처가 시스템 "기타" 항목에 붙인 세션을 어느 숫자에도 넣지 못한다 (ADR-012 §4). Σ 의 정의역은 M3a 의 `listForWeek` 술어와 같아야 한다 — `is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL` (ADR-027 §1).

주 필터는 저장 컬럼 `local_week` 에 직접 건다. `strftime()` 파생 금지 (ADR-011 §3).

- [x] **Step 4: 통과 확인** — `pnpm test` PASS

- [x] **Step 5: 커밋** — `feat: aggregate per-week settlement facts with unplanned focus as a residual`

---

### Task 4: 3택 대상 조회 + `review.getPending`

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`, `src/main/services/review.ts`, `src/main/ipc/review.ts`, `src/shared/ipc/channels.ts`, `src/shared/ipc/contracts.ts`, `src/preload/index.ts`
- Test: `src/main/db/repositories/review.test.ts`, `src/main/services/review.test.ts`

**Interfaces:**

```ts
export type PendingItemRow = {
  id: string; week: string; title: string
  estPomos: number      // 항목 est — 하위 task est 합이 아니다 (Q13)
  spentPomos: number    // 주 조건이 붙은 항목 소진 (ADR-012 §1)
  originWeek: string
}
export type CompletedItemRow = { id: string; week: string; title: string; spentPomos: number }

interface ReviewRepository {
  listPending(from: string, to: string): PendingItemRow[]
  listCompleted(from: string, to: string): CompletedItemRow[]
}
```

서비스가 `remaining`·`carryWeeks` 를 붙인다 — **리포지토리가 계산하지 않는다.** `remaining` 은 M3a 의 `remainingPomos(est, spent)`, `carryWeeks` 는 M3a 의 `weeksSince(originWeek, week)` 다.

- [x] **Step 1: 실패하는 테스트 작성**

```ts
it('시스템 기타 항목은 3택 목록에 없다 (R16 · A11)', () => { /* ... */ })
it('완료 항목은 끝낸 것들로, 미완료는 3택으로 갈린다 (A12)', () => { /* ... */ })
it('완료 시각이 범위 밖이어도 항목의 week 이 범위 안이면 끝낸 것들에 있다', () => { /* ... */ })
it('폐기·삭제된 항목은 어느 목록에도 없다', () => { /* ... */ })

it('est 5 · 소진 2 의 남은 몫은 3 (A8)', () => { /* ... */ })
it('소진이 est 이상이면 남은 몫 0 — 측정값이라 0 이 나온다 (A9 전반, ADR-019 §1)', () => { /* ... */ })
it('2주 건너뛴 항목의 N주째는 사슬 길이가 아니라 주차 차이다 (A13)', () => {
  // origin_week 2026-08-03, week 2026-08-24 → 4주째
})
it('targetWeekBudget 은 스냅샷이 없으면 null 이다 (정정 ②)', () => { /* ... */ })
```

- [x] **Step 2: 실행해 실패 확인** — FAIL

- [x] **Step 3: 구현** — 조회 조건은 technical-spec 을 그대로 옮긴다:

```sql
WHERE week BETWEEN :from AND :to
  AND completed_at IS NULL AND dropped_at IS NULL AND deleted_at IS NULL
  AND is_system = 0
ORDER BY week, created_at
```

**정렬은 서버가 주·생성순으로만 준다.** "3주 이상 먼저"는 표시 정렬이라 화면이 한다 (Task 11).

계약(`review.getPending`)은 technical-spec 의 스키마를 따르되 **`targetWeekBudget` 만 nullable** 로 바꾼다 (정정 ②). `baseline` 은 표시 전용으로 남긴다 — 편집 진입점은 이번 범위 밖이다.

- [x] **Step 4: 통과 확인** — `pnpm test && pnpm typecheck` PASS

- [x] **Step 5: 커밋** — `feat: expose the settlement panel payload over ipc`

---

### Task 5: `weeks` 스냅샷 확장 — 가용량·예산까지 박제

M3a 메모 #2 의 처리다. `weeks.ensure(week, baseline)` 은 길이 3종만 박제하는데, R37 은 가용량·예산까지 요구한다. 지금은 capacity 가 항상 NULL 이라 무해하지만, **그대로 두면 플래너가 만든 주와 정산이 만든 주의 스냅샷이 비대칭**이 된다.

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/services/baseline.ts`, `src/main/db/repositories/drizzle.ts`, `src/main/services/week-plan.ts`, `src/main/services/sessions.ts`, `src/main/db/repositories/test-helpers.ts`
- Test: `src/main/services/budget.test.ts`, `src/main/db/repositories/*.test.ts` (호출부 3곳이 전부 시그니처를 탄다)

**Interfaces:**

```ts
export type WeekSnapshot = Baseline & {
  /** 미설정이면 null — [0,…] 이나 0 을 지어내지 않는다 (ADR-018 §1). */
  capacity: number[] | null
  budget: number | null
}

interface WeeksRepository {
  /** 행이 없을 때만 생성 + 스냅샷 5종 박제 (ADR-013 §2). 멱등. 기존 행은 건드리지 않는다. */
  ensure(week: string, snapshot: WeekSnapshot): void
}
```

`baseline.ts` 에 조립 함수를 둔다 — 유효 베이스라인·유효 예산의 결정 순서가 이 파일 하나에만 있다는 규칙(pomo-baseline R13)을 유지한다:

```ts
export function weekSnapshot(repos: Repositories, week: string): WeekSnapshot
```

- [x] **Step 1: 실패하는 테스트 작성**

```ts
it('capacity 가 설정돼 있으면 새 행에 capacity 와 그 합이 함께 박제된다 (R37)', () => { /* ... */ })
it('capacity 가 미설정이면 두 컬럼 모두 NULL — 0 을 지어내지 않는다', () => { /* ... */ })
it('이미 있는 행의 스냅샷 컬럼은 덮어쓰지 않는다 (ADR-013 §3 · A17)', () => {
  // 행을 먼저 만들고 설정값을 바꾼 뒤 ensure 를 다시 불러도 값이 그대로다
})
```

- [x] **Step 2: 실행해 실패 확인** — FAIL

- [x] **Step 3: 구현** — 호출부 3곳을 함께 고친다:

| 호출부 | 지금 | 바꾼 뒤 |
|---|---|---|
| `week-plan.ts:46` (플래너 확정) | `ensure(week, effectiveBaseline(repos, week))` | `ensure(week, weekSnapshot(repos, week))` |
| `sessions.ts:27` (그 주 첫 세션) | 같음 | 같음 |
| `test-helpers.ts:41` | `ensure(week, TEST_BASELINE)` | `ensure(week, TEST_SNAPSHOT)` |

- [x] **Step 4: 통과 확인** — `pnpm test && pnpm typecheck` PASS. `grep -rn "\.ensure(" src` 로 남은 호출부가 없는지 확인

- [x] **Step 5: 커밋** — `feat: snapshot capacity and budget alongside the baseline when a week row appears`

---

### Task 6: 확정 트랜잭션 `review.settle`

마일스톤의 심장이다. **유스케이스 1개 = 트랜잭션 1개** (ADR-007).

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`, `src/main/services/review.ts`, `src/main/ipc/review.ts`, `src/shared/ipc/channels.ts`, `src/shared/ipc/contracts.ts`, `src/preload/index.ts`
- Test: `src/main/services/review.test.ts`, `src/main/db/repositories/review.test.ts`

**Interfaces:**

```ts
interface ReviewRepository {
  /**
   * 확정의 쓰기 전부. **호출자가 이미 결정을 끝낸 상태**로 들어온다 —
   * 클램프·이월 est 계산은 서비스가 하고 여기는 실행만 한다 (ADR-015 §1).
   */
  applySettlement(input: {
    targetWeek: string
    snapshot: WeekSnapshot            // 새로 만드는 weeks 행에 박제할 값
    rangeWeeks: readonly string[]     // settled_at 을 찍을 주들
    drops: readonly string[]
    carries: readonly { sourceId: string; estPomos: number }[]
    at: string                        // 순간 (UTC ISO) — 한 번 읽어 넘긴다
  }): { carried: { sourceItemId: string; newItemId: string }[] }
}
```

**서비스가 소유하는 규칙 (전부 순수 함수로 뽑아 단위 테스트한다):**

```ts
/** 예외 목록 × 재조회한 pending → 실제로 실행할 결정. 거부하지 않고 흡수한다. */
export function resolveDecisions(
  pending: readonly PendingItemRow[],
  exceptions: readonly Exception[]
): {
  drops: string[]
  carries: { sourceId: string; estPomos: number }[]
  ignoredExceptionIds: string[]     // 재조회 결과에 없는 예외 (완료·삭제·시스템·범위 밖)
  clampedExceptionIds: string[]     // estPomos 를 1..carryEst 로 자른 항목
}
```

- [x] **Step 1: 실패하는 테스트 작성** — 순수 함수부터, 그 다음 트랜잭션.

```ts
describe('resolveDecisions — 예외 흡수 (R29)', () => {
  it('예외가 비면 전부 이월이다 (R13 · A7)', () => { /* ... */ })
  it('재조회 목록에 없는 예외는 무시한다 — 거부하지 않는다 (A22)', () => { /* ... */ })
  it('그 사이 새로 생긴 항목은 이월된다 (A23)', () => { /* ... */ })
  it('축소 est 는 1..이월 est 로 클램프하고 사실을 알린다', () => { /* ... */ })
  it('남은 몫 0 인 항목의 이월 est 는 1 이다 (R14-1 · A9 후반)', () => { /* ... */ })
})

describe('settle — 트랜잭션', () => {
  it('이월은 새 행을 만들고 원본은 그 주에 남는다 (R18 · A7)', () => { /* ... */ })
  it('새 항목이 origin_week 를 승계하고 carry_from_id 로 원본을 가리키며 days 는 빈 배열이다 (R19)', () => { /* ... */ })
  it('milestone_id 를 승계한다 (R35 · A27)', () => { /* ... */ })
  it('원본의 미완료 조각만 새 항목으로 옮겨간다 — 완료 조각은 그대로 (R35 · A27)', () => { /* ... */ })
  it('보내주기는 dropped_at 만 찍고 행을 남긴다 (R21 · A14)', () => { /* ... */ })
  it('워터마크가 정산한 주가 아니라 targetWeek − 7일로 간다 (R4)', () => { /* ... */ })
  it('확정 직후 재판정하면 빈 범위다 (R23 · A16)', () => { /* ... */ })
  it('범위가 달라졌으면 STALE_RANGE 로 중단하고 아무것도 쓰지 않는다 (시나리오 10·14)', () => { /* ... */ })
  it('중간에 예외를 주입하면 워터마크·이월·dropped_at 이 전부 이전 값이다 (R22 · A15)', () => {
    // 이월 INSERT 직후 강제 throw → 롤백 검증. 이 테스트가 없으면 원자성은 주장일 뿐이다
  })
  it('미완료 항목 0건이어도 확정되고 워터마크만 전진한다 (R5 · A5)', () => { /* ... */ })
  it('계획 대상 주에 이미 항목이 있으면 행을 추가할 뿐 병합하지 않는다 (시나리오 8)', () => { /* ... */ })
})
```

- [x] **Step 2: 실행해 실패 확인** — FAIL

- [x] **Step 3: 구현** — 순서는 technical-spec 의 7단계 그대로다. **순서 자체가 안전 장치다:**

1. **재판정** (순수 함수 호출, write 없음) → 범위·계획 대상 주가 `expectedRange` 와 다르면 `STALE_RANGE`
2. **pending 재조회** — 화면이 보낸 목록이 아니라 지금의 사실
3. **예외 대조** — `resolveDecisions`
4. **drop** (soft)
5. **이월 INSERT + 미완료 조각 재부모화** — UPDATE 가 아니라 INSERT 인 것이 Q12 의 핵심이다. 원본을 옮기면 `origin_week` 박제와 "그 주에 무엇이 남았는가"라는 과거 사실이 동시에 파괴된다. **조각은 옮긴다** — 조각은 "무엇을 할 것인가"이고 항목은 "그 주의 계획이었다"라는 서로 다른 사실이다
6. **주별 행** — 범위의 각 주 + 계획 대상 주. 없으면 스냅샷과 함께 생성, 있으면 `settled_at` 만
7. **워터마크 전진** — 마지막이라 앞에서 실패하면 같은 범위가 다음 실행에 그대로 다시 잡힌다

에러는 **`STALE_RANGE` 하나뿐**이다. `DECISION_MISSING`·`DECISION_UNKNOWN`·`REDUCED_OUT_OF_RANGE` 는 만들지 않는다 — 각각 "결정 없음 = 이월"·"무시"·"클램프"로 흡수됐다.

- [x] **Step 4: 통과 확인** — `pnpm test` PASS. `PRAGMA foreign_keys = ON` 이 켜져 있어야 `carry_from_id`·`tasks.week_item_id` FK 가 실제로 검증된다 (ADR-011 §7)

- [x] **Step 5: 커밋** — `feat: settle a week range in one transaction that absorbs stale exceptions`

---

### Task 7: 무효화 사건 `settled`

확정 1회가 주간 카드·오늘 목록·마일스톤·배너까지 건드린다. **범위를 renderer 가 다시 계산하지 않는다** — 확정 응답이 실어 보낸 주 키 목록을 payload 로 넘긴다.

**Files:**
- Modify: `src/renderer/shared/query/invalidate.ts`, `src/renderer/shared/query/keys.ts`(주석만)
- Test: `src/renderer/shared/query/invalidate.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
describe('settled', () => {
  it('범위의 주 · 계획 대상 주 · 오늘 · 마일스톤 · 배너를 무효화한다', () => {
    expect(keysToInvalidate({
      type: 'settled',
      payload: { weeks: ['2026-08-10', '2026-08-17'], targetWeek: '2026-08-24' },
      currentDayKey: '2026-08-20'
    })).toEqual([
      ['week', '2026-08-10'], ['week', '2026-08-17'], ['week', '2026-08-24'],
      ['today', '2026-08-20'], ['month'], ['review', 'pending']
    ])
  })
})
```

- [x] **Step 2: 실행해 실패 확인** — FAIL

- [x] **Step 3: 구현** — 유니온에 갈래를 더한다. `keys.reviewPending()` 은 M2 가 이미 만들어 뒀다 (지금까지 `clock-boundary` 만 썼다).

```ts
| { type: 'settled'
    payload: { weeks: readonly string[]; targetWeek: string }
    currentDayKey: string }
```

> **드로어·플래너 초안은 따로 적지 않는다.** 두 키가 `keys.week(w)` 의 하위라 주 키 무효화가 접두사로 함께 잡는다 (M3a 가 그렇게 배치했다). **긴 키로 짧은 키를 잡을 수는 없다** — M2 가 그 방향을 반대로 알고 버그를 남겼다.

- [x] **Step 4: 통과 확인** — `pnpm test && pnpm lint` PASS (초크포인트 밖 캐시 조작 0)

- [x] **Step 5: 커밋** — `feat: invalidate the settled weeks from the confirm response`

---

### Task 8: 미룬 것 3종 부활 — 요일 핍 · 오늘 배정 정렬 · 플래너 `다음 주`

Task 1 이 요일 필드를 만들었으므로 M3a 가 함께 미뤄 둔 셋이 한 번에 풀린다. **정산과 독립이므로 여기서 잘려도 정산은 성립한다.**

**Files:**
- Modify: `src/renderer/features/week/WeekItemRow.tsx`, `WeekCard.tsx`, `Planner.tsx`, `usePlanner.ts`, `useWeek.ts`
- Test: 각 모듈 옆 `*.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
it('요일 핍이 지난/오늘/앞으로/미배정 4상태를 구분한다', () => {
  // 색 단독 금지 (principles §3.5) — 오늘은 링, 지난 것은 채도 낮춤 + 지름 유지,
  // 미배정은 --ink-faint 이면서 지름이 작다. 두 채널을 쓴다
})
it('오늘 배정된 항목이 목록 상단으로 온다 (week-plan R7 · A8)', () => { /* ... */ })
it('플래너의 다음 주 세그먼트가 편집 대상 주를 바꾸고 라벨이 그 주를 가리킨다 (A3 · A5)', () => { /* ... */ })
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 요일 정보의 출처는 `useClock().weekdayIndex` **하나뿐**이다. renderer 에서 요일을 계산하지 않는다 (ESLint `TIME_SELECTORS` 가 막는다).

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: revive weekday-dependent week card behaviour now that the clock reports it`

---

### Task 9: 배너

**Files:**
- Create: `src/renderer/features/review/ReviewBanner.tsx`, `useReviewStatus.ts` + tests
- Modify: `src/renderer/features/week/WeekCard.tsx` (헤더 아래 슬롯)

- [ ] **Step 1: 실패하는 테스트 작성** — ux-spec §2 의 5상태 표를 그대로 옮긴다.

```tsx
it('빈 범위면 배너 자체를 렌더하지 않는다', () => { /* ... */ })
it('범위 1주이고 그 주가 오늘의 주면 "이번 주 마감"이다', () => { /* ... */ })
it('범위 2주 이상이면 범위 라벨을 쓴다', () => { /* ... */ })
it('넘어갈 항목이 0건이면 건수 대신 마감 문구를 쓴다 (R5)', () => { /* ... */ })
it('--danger 를 쓰지 않는다 — 정산 대기는 실패가 아니다 (principles §1·§2)', () => { /* ... */ })
it('"미달성"·"밀린"·"숙제"·"지연" 이 문구에 없다 (원칙 7)', () => { /* ... */ })
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — `--amber` 텍스트/보더 + `--glass` 표면, lucide `CalendarClock`. 주 라벨은 정정 ① 대로 `weekRangeLabel`.

배너에 닫기(×)를 둘 수 있으나 **로컬 상태로만** 숨긴다 — "무시했다"를 저장하면 저장값이 둘이 되어 워터마크 단독 판정이 깨진다. `review.dismissBanner` 채널을 **만들지 않는다.**

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: show the settlement banner above the week card`

---

### Task 10: 패널 1·2 — 요약과 끝낸 것들

**Files:**
- Create: `src/renderer/features/review/ReviewPanel.tsx`, `useReview.ts`, `SummarySection.tsx`, `CompletedSection.tsx` + tests
- Modify: `src/renderer/features/week/WeekCard.tsx` (패널이 카드를 대신한다 — 정정 ③)

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
it('한 일을 먼저 놓는다 — 공부한 날·소진이 남은 건수보다 앞선다 (R9 · A6)', () => { /* ... */ })
it('달성률 %를 주요 지표로 크게 띄우지 않는다', () => { /* ... */ })
it('공백 주는 판단 없이 사실로만 적고, 마지막 공부 주를 함께 보여준다 (R31 · A25)', () => { /* ... */ })
it('기록이 전혀 없는 범위는 주별 목록을 렌더하지 않는다', () => { /* ... */ })
it('끝낸 것들이 0건이면 섹션 자체를 숨긴다', () => { /* ... */ })
it('끝낸 것들에는 조작 컨트롤이 없다 (Q14 — 완료는 이미 만들어진 사실이다)', () => { /* ... */ })
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 소진 수는 M3a 의 `PomoDots` + 숫자 병기(`--font-mono`, tabular-nums). 예산 초과에 빨강·경고를 쓰지 않는다.

패널 진입은 M3a 의 플래너와 같은 모양이다 — `WeekCard` 가 `reviewing` 상태일 때 자기 대신 `ReviewPanel` 을 렌더하고, 닫을 때 진입 버튼으로 포커스를 되돌린다 (PRODUCT.md 접근성 §4). 되돌리지 않으면 포커스가 `<body>` 로 떨어진다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: render the settlement summary and the finished section`

---

### Task 11: 패널 3 — 남은 것들 3택

**Files:**
- Create: `src/renderer/shared/ui/Segmented.tsx`, `Stepper.tsx`, `src/renderer/features/review/PendingSection.tsx`, `PendingRow.tsx` + tests

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
it('모든 항목의 기본 선택이 "다음 주로" 다 (R12)', () => { /* ... */ })
it('아무것도 건드리지 않으면 exceptions 가 빈 배열로 나간다 (R13)', () => { /* ... */ })
it('선택 상태에 배경뿐 아니라 보더가 있다 (design-system ADR-006 §3)', () => {
  // --glass-strong 은 고대비 모드에서 사라진다. 배경만으로 선택을 표현하면 안 된다
})
it('보내주기의 --danger 는 아이콘에만 붙고 라벨은 --ink 다 (ADR-003 §5)', () => { /* ... */ })
it('줄여서를 고르면 스테퍼가 나오고 기본값이 이월 est 의 절반(올림)이다 (R15 · A10)', () => { /* ... */ })
it('스테퍼가 1 미만·이월 est 초과로 가지 않고, 끝에서 그 버튼만 비활성된다', () => { /* ... */ })
it('3주 이상 넘어온 항목이 상단에 오고 건수가 중립 사실 한 줄로 적힌다 (R34 · A26)', () => { /* ... */ })
it('그래도 기본 선택은 이월이다 — 클릭 1회 확정이 깨지지 않는다', () => { /* ... */ })
it('N주째 배지는 N ≥ 2 일 때만 나오고 색으로 강조하지 않는다', () => { /* ... */ })
it('조작 타깃이 --target-min 을 밑돌지 않는다', () => { /* ... */ })
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 정렬(`carryWeeks` 내림 → 주 오름 → 생성순)은 **화면이 한다.** 서버는 주·생성순으로만 준다.

세그먼트는 `aria-pressed` 를 쓰되 **시각 신호를 대체하지 않는다** — 스크린리더 전용이다. 360px 폭이라 세그먼트는 제목 아래 자기 줄로 내려간다 (정정 ③).

"버리기"·"삭제"·"정리하세요" 류 문구를 넣지 않는다. 잘려나간 몫이 이력에 안 남는다는 사실(R36)을 화면에서 경고하지 않는다 — 줄이는 것은 실패가 아니다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: offer carry, reduce and release for every remaining item`

---

### Task 12: 패널 4·5 — 안내 · 확정 · 예외 화면

**Files:**
- Create: `src/renderer/features/review/ConfirmSection.tsx` + test
- Modify: `ReviewPanel.tsx`, `useReview.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
it('계획에 없던 집중이 1 이상일 때만 안내가 나오고 "미분류" 라는 단어를 쓰지 않는다', () => { /* ... */ })
it('현재 뽀모 길이를 표시하되 조정 버튼은 없다 (이번 범위에서 뺐다)', () => { /* ... */ })

it('확정 라벨이 계획 대상 주에 따라 갈린다 (§7.1)', () => {
  // 오늘의 주 → "이번 주 시작", 다음 주 → "다음 주 시작"
})
it('이월 뽀모가 1 이상이면 중립 사실 한 줄이 나온다 (R40 · A28)', () => {
  // "이월 60 · 다음 주 예산 20" — 막지도 캡을 두지도 않는다
})
it('예산이 null 이면 예산 숫자를 지어내지 않는다 (정정 ②)', () => { /* ... */ })
it('확정 전 확인 다이얼로그가 없다', () => { /* ... */ })

it('확정 토스트가 사실만 말한다 — 축하·칭찬 없음', () => { /* ... */ })
it('응답에 자동 이월이 실려 오면 그 건수를 숨기지 않는다 (R30 · A23)', () => {
  // "그 사이 추가된 2건도 함께 넘어갔어요" — 사과·경고 금지
})

describe('STALE_RANGE 후처리 (ux-spec §8.1)', () => {
  it('범위가 커지는 경우도 처리한다 — 시나리오 14', () => {
    // 이전 판은 "토→일 전이에서는 확정 요청이 있을 수 없다"고 단정했고 그것은 틀렸다.
    // 워터마크가 밀려 있으면 토요일에도 패널이 열린다
  })
  it('기존 행의 선택과 스테퍼 값을 유지한다', () => { /* ... */ })
  it('새 remaining 이 더 작아졌으면 스테퍼 값을 상한으로 클램프한다', () => { /* ... */ })
  it('새로 들어온 행은 기본 선택 "다음 주로" 로 시작한다', () => { /* ... */ })
  it('선택을 전부 초기화하거나 패널을 닫지 않는다', () => { /* ... */ })
})

it('확정 실패 시 선택 상태를 유지하고 아무것도 반영되지 않았음을 알린다 (R22)', () => { /* ... */ })
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 확정 후 패널이 닫히고 배너가 사라진다. **플래너를 자동으로 열지 않는다** — 정산과 플래닝은 분리된 단계다.

확정 버튼은 스크롤 하단 고정으로 항상 도달 가능해야 한다 (ux-spec §10).

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: confirm the settlement and recover when the range shifts underneath`

---

### Task 13: 문서 갱신 + 마무리 검증

- [ ] **Step 1: 정정 3건을 기능 문서에 반영**
  - `ux-spec.md` §2·§3·§5.1 — `W35`·`W33–W35` 표기를 날짜 라벨로 (정정 ①)
  - `technical-spec.md` `review.getPending` 계약 + `ux-spec.md` §7.2 — `targetWeekBudget` nullable 과 예산 없음 문구 (정정 ②)
  - `ux-spec.md` §6 — 뽀모 길이 **진입점**이 pomo-baseline 마일스톤으로 미뤄졌다는 사실 (표시는 남는다)
  - `weekly-review/overview.md` 상태를 Draft → In Review

- [ ] **Step 2: 마일스톤 문서 갱신** — `PRODUCT.md`·`README.md` 에 M3b 완료와 남은 것(뽀모 길이 편집 UI·부하 그래프·드릴다운) 기록

- [ ] **Step 3: 자동 검증 5종**

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check && pnpm build
```

- [ ] **Step 4: 코어 루프 수동 검증** — 실물 앱을 눌러 확인한다. 자동 검증으로 대체하지 않는다.
  - [ ] 새 DB 로 첫 실행(평일) — 배너가 **뜨지 않는다** (A1)
  - [ ] `plan_lead_days` 를 그대로 두고 시계를 일요일로 옮겨 실행 — 배너가 뜨고 범위가 그 주 1개다 (A2)
  - [ ] 배너를 무시한 채 타이머 시작·완료, 오늘 목록 pull, 플래너 열기가 전부 동작한다 (A4)
  - [ ] 아무 항목도 건드리지 않고 확정 — 남은 항목 전체가 계획 대상 주에 생긴다 (A7)
  - [ ] 확정 직후 배너가 **즉시** 사라진다 (A16)
  - [ ] 한 항목을 `줄여서` 로 낮추고 확정 — 새 항목의 도트 수가 그 값이다 (A10)
  - [ ] 한 항목을 `보내주기` 로 확정 — 원본이 그 주에 남아 있고 목록에서 빠진다 (A14)
  - [ ] 패널을 열어둔 채 오늘 목록에서 항목을 완료 처리한 뒤 확정 — **성공하고** 그 항목은 이월되지 않는다 (A22)
  - [ ] 확정 후 주간 카드의 게이지·도트가 새 주 기준으로 다시 그려진다
  - [ ] 3주 공백을 만든 DB 로 실행 — 정산 화면이 **1개**이고 항목만 3주분이다 (A3)
  - [ ] 다크·라이트 양쪽에서 배너·패널을 본다 — **다크는 아직 한 번도 눈으로 확인된 적이 없다** (광원 실효 알파가 라이트의 2배다)

- [ ] **Step 5: 커밋 + PR** — `docs: record m3b completion` / PR 제목 `feat: settle a week range and carry the remainder forward`

---

## M3c(app-shell·pomo-baseline)로 넘기는 메모

1. **뽀모 길이 진입점이 정산에 빚으로 남아 있다.** PRD R24·R38 은 정산 패널에 진입점을 요구하고, ux-spec §6 이 문구까지 정해 뒀다. 이번에 표시만 만들었으므로 pomo-baseline 이 편집 UI 를 만들 때 `조정` 버튼과 **변경 전/후 주간 총 집중 시간 비교**(A29)를 함께 붙인다. 그 명령은 **정산 확정 트랜잭션의 일부가 아니다** — 독립 명령이고 효력은 다음 주 경계부터다 (ADR-013 §3).
2. **`weekly_capacity` 편집이 생기는 순간 세 가지가 함께 산다** — 요일별 부하 그래프(week-plan R22-2), 예산 프리필, 그리고 `targetWeekBudget` 이 실제 숫자를 갖는 경로(정정 ②가 만든 null 분기가 그때 비로소 드물어진다).
3. **패널 배치는 잠정이다** (정정 ③). app-shell 이 반응형 3구간을 정할 때 인라인/오버레이/탭 전체 화면을 확정하고, 그때 3택 세그먼트의 한 줄 배치(ux-spec §5.1 의 원래 그림)가 넓은 구간에서 살아난다.
4. **선언형 플래너 확정의 동시성 약점이 아직 열려 있다** (M3a 메모 #3). 정산은 "예외만 담고 서버가 재조회"로 닫았다. 항목 생성 경로가 플래너 말고 또 생기면 플래너도 같은 방식으로 옮긴다.
5. **월말 마일스톤 재설정은 v1 비범위다.** 이월이 `milestone_id` 를 승계하도록 만들어 뒀으므로(R35), milestones 기능이 붙는 순간 월 레이어가 주 경계에서 리셋되지 않는다.

---

## 자기 점검 — 기능 문서 대조

| 문서 절 | 반영 위치 |
|---|---|
| technical-spec §0 판정식 | Task 2 (경계 시나리오 15행 = 표 테스트) |
| technical-spec §0.2 부트스트랩·유실 폴백 | Task 2 (A1·A21) |
| technical-spec `getStatus`·`getPending` 계약 | Task 2·4. **`targetWeekBudget` 만 nullable 로 정정** |
| technical-spec `settle` 7단계 | Task 6 — 순서가 곧 안전 장치다 |
| technical-spec 파생식 표 | Task 3·4. 식을 새로 만들지 않고 M3a 의 `remainingPomos`·`weeksSince` 를 재사용 |
| technical-spec 캐시 무효화 표 | Task 7 |
| technical-spec 경계 시나리오 14 (범위가 **커지는** STALE) | Task 12 — spec 이 이전 판의 오판을 정정한 자리다 |
| ux-spec §2 배너 5상태 | Task 9. **주 라벨 표기를 정정 ①로 바꾼다** |
| ux-spec §3~§5 패널 | Task 10·11 |
| ux-spec §6 안내·길이 | Task 12 — 표시만. 진입점은 뺐다 |
| ux-spec §7 확정 | Task 12 |
| ux-spec §8.1 선택 유지 4규칙 | Task 12 |
| prd R37 스냅샷 | Task 5 |
| prd R35 승계·재부모화 | Task 6 |
| M3a 메모 #1 (`confirmPlan` 재사용 금지) | Task 6 — 이월은 별도 생성 경로이며 `origin_week` 를 승계한다 |
| M3a 메모 #2 (`ensure` 확장) | Task 5 |
| M3a 메모 #4 (`remainingPomos` 재사용) | Task 4·6 |
| M3a 메모 #5 (미룬 것 부활) | Task 1·8 |
