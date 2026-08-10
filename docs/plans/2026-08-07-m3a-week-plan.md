# M3a 주간 계획 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

**Goal:** 주간 항목을 만들고, 거기서 조각을 오늘로 가져오고, 그 조각으로 집중한 결과가 주간 카드 숫자로 되돌아오는 한 줄기를 화면에서 끝까지 통과시킨다.

**Architecture:** 승인된 스펙 [2026-08-07-m3a-week-plan-design.md](../superpowers/specs/2026-08-07-m3a-week-plan-design.md) 의 실행분이며, 3인 리뷰(옹호·적대·중립)로 결함 15건을 잡은 뒤의 2판이다. 소진 집계 술어를 리포지토리 SQL 한 곳에 가두고, 기타 행을 차액으로 정의하며([ADR-027](../architecture/decisions/adr-027-other-row-domain.md)), 플래너 확정을 선언형 전체 초안 한 트랜잭션으로 처리한다. 스키마는 M1 이 ADR-011 대로 이미 세웠으므로 **마이그레이션이 없다.**

**Tech Stack:** M2 스택 그대로 (Electron + electron-vite + React 19 + TS strict, better-sqlite3 + drizzle, zod 4, TanStack Query 5, Tailwind 4 + shadcn/ui, Vitest, uuid v7). 추가 의존성 없음.

## Global Constraints

M1·M2 계획의 Global Constraints 가 전부 그대로 적용된다 (pnpm 전용, BrowserWindow 보안 플래그, `handleIpc` 로만 IPC 등록, Drizzle import 는 `src/main/db/` 만, `src/shared/` 순수 TS, 시간은 `src/shared/time/` 초크포인트, 주 시작 월요일, UI 이모지 금지·토큰만, 커밋 영어 Conventional Commits, husky 훅 우회 금지). 여기에 이번 마일스톤의 것:

- **ADR-025**: 쿼리 키는 `keys.ts` 팩토리로만. 캐시 조작은 초크포인트 밖에서 금지 (ESLint 강제 중). 키 속 달력 키는 `useClock()` 또는 응답 저장값만 — **renderer 재계산 금지** (`new Date()`·`Date.now()` 는 ESLint `TIME_SELECTORS` 가 막는다).
- **ADR-027**: 기타 행 차액의 Σ 정의역은 **화면 목록에 표시되는 항목**(`is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL`)이다. 주간 총 소진은 그 주 focus 세션 수 전체이며 폐기·삭제가 이 값을 줄이지 않는다. 표시 조건은 세 갈래다.
- **ADR-015**: 유스케이스 하나 = `uow.run` 하나. 포트는 **유스케이스 단위**로 정의한다 — `update(id, patch)` 류 CRUD 포트 금지 ([ports.ts](../../src/main/services/ports.ts) 상단 주석).
- **작업 브랜치는 `feature/m3a-week-plan` 하나**이며 태스크마다 커밋한다.
- 유효 베이스라인·유효 예산의 결정 순서는 `src/main/services/baseline.ts` 한 곳에만 존재한다 (pomo-baseline R13).
- **`weekly_capacity` 는 미설정(NULL)이다.** 시딩하지 않는다 (pomo-baseline R8·R15).
- **`milestone_id` 는 항상 NULL.** 연결 칩·`M<n>` 배지를 만들지 않는다.
- **과적 표시에 `--danger`·경고 아이콘·단정 문구 금지.** `--amber` + `+N` 배지 + 질문형까지만 (R21, principles §1·§2).
- **접근성 기준선** (principles §7): 조작 타깃 `--target-min`(24px) 하한, 포커스 링 유지, 색 단독 구분 금지, `prefers-reduced-motion: reduce` 시 전이 즉시 반영.

---

## 이번 마일스톤에서 뺀 것 (사용자 결정 2026-08-07)

**"안 만든다"가 아니라 "지금은 값이 없어서 미룬다"** 이다. 각 항목이 언제 살아나는지 함께 적는다.

| 뺀 것 | 이유 | 언제 살아나나 |
|---|---|---|
| **"오늘이 무슨 요일인가" 정보 전체** | `useClock()` 은 `dayKey` 문자열만 주고 renderer 의 날짜 계산은 ESLint 가 막는다. 이 정보에 매달린 기능 3개를 함께 미룬다 | M3b 또는 app-shell 이 시간 정보를 더 필요로 할 때 `clock.now` 응답에 필드를 더해 한 번에 |
| ├ 요일 핍 4상태(지난/오늘/앞으로) | 위 | 위와 동시 |
| ├ 오늘 배정 항목 상단 정렬·강조 (R7·A8) | 위 | 위와 동시 |
| └ 플래너의 `다음 주` 세그먼트 (R3·R5·A3·A5) | 위 + 다음 주 계획은 확정해도 일반 뷰에 안 보여(ux-spec §5.6) M3a 에서 검증 가능한 것이 안내 문구뿐 | 위와 동시 |
| **요일별 부하 그래프** (R22-2) | `weekly_capacity` 가 NULL 이라 기준선이 없다. 기준 없는 막대 7개는 사용자가 판단할 근거가 되지 못한다 | M3b 가 정산에 capacity 편집 진입점을 만들면(pomo-baseline R25) 진짜 값이 된다 |
| **기타 행 드릴다운** (§6.4 4행) | 새 IPC 채널 + 상관 서브쿼리를 써서 만드는 것이 읽기 전용 이름 목록이다. 총합 숫자는 드릴다운 없이도 보인다 | 언제든 (독립적) |
| 마일스톤 연결 칩 | 스펙 결정 3. R6 이 미연결을 정상 상태로 정의 | milestones 기능 |
| 반응형 3구간·정산 모드 | app-shell(M4) / M3b | 각 마일스톤 |

**요일 핍은 `배정됨 / 미배정` 2상태로 만든다.** 색만으로 구분하지 않는다 — 배정됨은 `--teal` solid, 미배정은 `--ink-faint` 이면서 **지름이 더 작다** (principles §3.5 의 두 채널 규칙은 2상태에도 적용된다).

**M3a 에서 검증할 수 없는 인수 기준** (스펙 §2 표 + 이번 축소분):

| 인수 기준 | 상태 |
|---|---|
| A3·A5 (편집 대상 주 토글·라벨 파생) | 검증 불가 — `다음 주` 를 뺐다 |
| A7 (마일스톤 연결) | 검증 불가 — 마일스톤이 없다 |
| A8 (오늘 배정 상단 정렬) | 검증 불가 — 요일 정보를 뺐다 |
| A14·A15 (이월 배지 `N주째`) | **부분** — 이월 생성은 정산 소관. `originWeek` 이 앞선 주인 행을 테스트로 직접 심어 **계산식만** 검증한다 (Task 7) |
| A17 (다음 주 항목 드로어 pull) | 데이터는 열려 있으나 UI 도달 경로 없음 (주 네비게이션 비범위) |
| A22 (소급 task + 미분류 세션의 기타 행 합산·구분) | **부분** — "행 1개로 합쳐 표시된다"는 앞부분은 검증한다(Task 4). **"드릴다운에서 둘이 구분된다"는 뒷부분은 검증 불가** — 드릴다운을 뺐다 |
| A25·A26 (예산 프리필·스냅샷 불변) | **부분** — capacity 가 NULL 이라 프리필이 항상 없다. 저장·불변은 검증한다 |
| A29 마지막 절 (부하 그래프) | 검증 불가 — 그래프를 뺐다. 총량 과적(A29 앞부분)은 검증한다 |

---

## 차액과 표시 조건 — ADR-027 인용

이 계획서는 **결정하지 않는다.** [ADR-027](../architecture/decisions/adr-027-other-row-domain.md) 이 정한 것을 그대로 옮긴다.

```
Σ 의 정의역 = is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL   (= 목록에 보이는 항목)
기타 행 소진 = 주간 총 소진 − Σ(그 정의역의 항목 소진)
주간 총 소진 = count(focus 세션 WHERE local_week = 그 주)     ← 폐기·삭제가 줄이지 않는다

표시한다 ⟺ 미분류 focus 세션이 있다  OR  부모 없는 조각이 있다  OR  기타 행 소진 > 0
```

**세 번째 갈래를 빠뜨리면 A24 가 깨진다** — 폐기 항목의 소진만 있는 주에서 행이 숨겨져 그 뽀모가 화면에서 증발한다. 1판 계획서가 정확히 이 버그를 갖고 있었고, 테스트 세트가 그것을 비껴갔다.

---

## 파일 구조 (완료 시점 스냅샷, 신규·수정만)

```
src/
├── shared/
│   ├── ipc/
│   │   ├── channels.ts          # (수정) week.* invoke 채널 9종
│   │   ├── contracts.ts         # (수정) week.* req/res 스키마
│   │   └── api.ts               # (수정) window.api.week 타입
│   └── time/index.ts            # (수정) weeksSince · weekRangeLabel — 둘 다 신규
├── main/
│   ├── services/
│   │   ├── ports.ts             # (수정) Weeks·WeekItems 포트 확장
│   │   ├── baseline.ts          # (수정) effectiveBudget · budgetPrefill
│   │   └── week-plan.ts         # 신규 — 유스케이스 + 순수 함수 2종
│   ├── ipc/week.ts              # 신규 — week.* 핸들러
│   ├── index.ts                 # (수정) week 핸들러 등록
│   └── db/
│       └── repositories/
│           ├── drizzle.ts       # (수정) 두 리포지토리 구현
│           ├── test-helpers.ts  # 신규 — 계약 테스트 공용 셋업 (Task 2)
│           └── week-items.test.ts  # 신규 — 계약 테스트
├── preload/index.ts             # (수정) week.* invoke 표면
└── renderer/
    ├── app/
    │   ├── App.tsx              # (수정) 주간 카드를 ClockGate 안쪽에
    │   └── App.test.tsx         # (수정) window.api 목에 week 블록 9종 — 없으면 기존 테스트가 깨진다
    ├── shared/
    │   ├── query/keys.ts        # (수정) weekItems → week 로 교체
    │   ├── query/invalidate.ts  # (수정) 기존 4사건 키 정정 + 신규 2사건
    │   ├── query/events.test.ts # (수정) :91 이 팩토리를 직접 호출한다 — 함께 고쳐야 typecheck 통과
    │   ├── ui/PomoDots.tsx      # 신규
    │   ├── ui/Toast.tsx         # 신규 — pull 토스트. 코드베이스에 토스트가 없다
    │   └── ui/useReducedMotion.ts # 신규 — 모션 판정 한 곳 (게이지·드로어 공용)
    └── features/week/
        ├── useWeek.ts · WeekCard.tsx · WeekItemRow.tsx
        ├── OtherRow.tsx · BudgetGauge.tsx
        ├── ItemDrawer.tsx · useDrawer.ts
        ├── Planner.tsx · usePlanner.ts
tests → 각 모듈 옆 *.test.ts(x)
```

**renderer 테스트 파일은 전부 jsdom 도크블록으로 시작한다** (`vitest.config.ts` 의 기본 환경이 `'node'` 다):

```tsx
// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
```

**이벤트 채널(`EVENT_CHANNELS`)을 추가하지 않는다.** 확정·완료·폐기·pull 은 전부 renderer 가 시작하는 invoke 이므로, mutation `onSuccess` 에서 `dispatchInvalidation` 을 부른다 — M2 의 `pull-changed`·`task-toggled` 와 같은 패턴이다.

---

### Task 1: 유효 예산 계약 + weeks 포트 확장

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/services/baseline.ts`, `src/main/db/repositories/drizzle.ts`
- Test: `src/main/services/budget.test.ts` (신규 — `baseline.test.ts` 는 `db/repositories/` 에 이미 있으므로 basename 충돌을 피한다)

**Interfaces:**
- Produces: `effectiveBudget(repos, week): number | null` (`null` = **"기록 없음"**), `budgetPrefill(repos): number | null`, `WeeksRepository.plan(week)` / `.setPlan(week, budget)`

- [ ] **Step 1: 실패하는 테스트 작성** — 페이크 repos 로 충분하다 (SQL 이 아니라 결정 순서를 검증한다)

```ts
// src/main/services/budget.test.ts
import { describe, expect, it } from 'vitest'
import { budgetPrefill, effectiveBudget } from './baseline'
import type { Repositories, WeekPlan } from './ports'

function fakeRepos(o: { plan?: WeekPlan | null; settings?: Record<string, string> }): Repositories {
  const settings = o.settings ?? {}
  return {
    settings: { get: (k: string) => settings[k] ?? null, set: () => {}, updatedAt: () => null },
    weeks: { baseline: () => null, ensure: () => {}, plan: () => o.plan ?? null, setPlan: () => {} }
  } as unknown as Repositories
}

describe('effectiveBudget (pomo-baseline R11)', () => {
  it('weeks 행이 없으면 기록 없음(null)', () => {
    expect(effectiveBudget(fakeRepos({ plan: null }), '2026-08-03')).toBeNull()
  })

  it('행은 있는데 budget 이 NULL 이면 기록 없음(null)', () => {
    const repos = fakeRepos({ plan: { budget: null, capacity: null, plannedAt: null } })
    expect(effectiveBudget(repos, '2026-08-03')).toBeNull()
  })

  it('budget = 0 은 기록 없음이 아니라 개수 0 이다 (ADR-018 §1)', () => {
    const repos = fakeRepos({ plan: { budget: 0, capacity: null, plannedAt: null } })
    expect(effectiveBudget(repos, '2026-08-03')).toBe(0)
  })

  it('capacity 합으로 예산을 파생하지 않는다', () => {
    const repos = fakeRepos({
      plan: { budget: null, capacity: [4, 4, 4, 4, 4, 0, 0], plannedAt: null }
    })
    expect(effectiveBudget(repos, '2026-08-03')).toBeNull()
  })
})

describe('budgetPrefill (pomo-baseline R12)', () => {
  it('weekly_capacity 가 없으면 프리필하지 않는다 — M3a 는 항상 이 경로다', () => {
    expect(budgetPrefill(fakeRepos({}))).toBeNull()
  })

  it('있으면 합을 프리필한다', () => {
    expect(budgetPrefill(fakeRepos({ settings: { weekly_capacity: '[4,4,4,4,4,0,0]' } }))).toBe(20)
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test src/main/services/budget.test.ts` → FAIL (`effectiveBudget` 없음)

- [ ] **Step 3: 구현**

`ports.ts` 의 `WeeksRepository` 확장 (기존 `baseline`·`ensure` 는 그대로):

```ts
export type WeekPlan = {
  /** NULL = "기록 없음". 0 은 "예산 0 으로 하겠다"는 별개 사실이다 (ADR-018 §1). */
  budget: number | null
  /** 요일별 가용 뽀모 `[월..일]`. 미설정이면 null. M3a 에서는 항상 null 이다. */
  capacity: number[] | null
  /** 최초 확정 시각. 주중 재수정으로 갱신하지 않는다 (week-plan R23). */
  plannedAt: string | null
}

export interface WeeksRepository {
  baseline(week: string): Baseline | null
  ensure(week: string, baseline: Baseline): void
  /** 그 주 계획 스냅샷. 행이 없으면 null. */
  plan(week: string): WeekPlan | null
  /** 예산 저장 + `planned_at` 최초 1회만 기록. 행이 없으면 아무 것도 하지 않는다. */
  setPlan(week: string, budget: number | null): void
}
```

`baseline.ts` 에 추가:

```ts
/**
 * 유효 예산(week) 계약 (pomo-baseline R11). 반환 `null` 은 **"기록 없음"** 이며
 * "예산 0" 이 아니다 — 후자는 `0` 으로 돌아온다 (ADR-018 §1).
 *
 * **조회 시점에 `sum(weekly_capacity)` 로 예산을 파생하는 경로는 이 계약에 없다.**
 * capacity 는 입력 UI 의 프리필 재료일 뿐이다 (`budgetPrefill`).
 */
export function effectiveBudget(repos: Repositories, week: string): number | null {
  return repos.weeks.plan(week)?.budget ?? null
}

/**
 * 예산 입력의 기본값 프리필 (pomo-baseline R12). **조회 계약이 아니라 입력 UI 의
 * 관심사다.** `weekly_capacity` 미설정이면 `null` 을 돌려 필드를 빈 채로 둔다 —
 * M3a 에는 capacity 편집 UI 가 없으므로 항상 이 경로다.
 */
export function budgetPrefill(repos: Repositories): number | null {
  const raw = repos.settings.get('weekly_capacity')
  if (raw === null) return null
  return (JSON.parse(raw) as number[]).reduce((sum, n) => sum + n, 0)
}
```

`drizzle.ts` 의 `weeks` 블록에 추가:

```ts
plan: (week) => {
  const row = tx
    .select({ budget: weeks.budget, capacity: weeks.capacity, plannedAt: weeks.plannedAt })
    .from(weeks)
    .where(eq(weeks.week, week))
    .get()
  if (!row) return null
  return {
    budget: row.budget,
    capacity: row.capacity === null ? null : (JSON.parse(row.capacity) as number[]),
    plannedAt: row.plannedAt
  }
},

// planned_at 은 최초 확정 시각만 담는다 (R23·A31). COALESCE 가 그 규칙이다 —
// `set({ plannedAt: now() })` 로 쓰면 주중 재수정마다 갱신되어 "언제 계획했나"가
// "마지막으로 손댄 시각"으로 변질된다.
setPlan: (week, budget) => {
  tx.update(weeks)
    .set({ budget, plannedAt: sql`COALESCE(${weeks.plannedAt}, ${now()})` })
    .where(eq(weeks.week, week))
    .run()
}
```

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS, `pnpm typecheck` 에러 0

- [ ] **Step 5: 커밋** — `feat: add effective budget contract and weeks plan port`

---

### Task 2: 계약 테스트 헬퍼 + 주간 항목 리포지토리 (확정 · 소진 집계)

1판에서 이 태스크는 둘로 쪼개져 있었고, **읽기 태스크의 테스트가 쓰기 태스크의 `confirmPlan` 을 불러** 5스텝이 성립하지 않았다. 같은 테이블의 읽기/쓰기는 서로 없이 테스트되지 않으므로 하나로 합친다.

**Files:**
- Create: `src/main/db/repositories/test-helpers.ts`, `src/main/db/repositories/week-items.test.ts`, `src/main/services/week-plan.ts`
- Modify: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`
- Test: 위 `week-items.test.ts` + `src/main/services/week-plan.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `weeks.ensure`·`weeks.setPlan`, `effectiveBaseline`
- Produces: `testUow()`, `ensureWeeks()`; `WeekItemsRepository.confirmPlan` · `.listForWeek` · `.weekTotalSpent` · `.hasUnplannedActivity`; `otherRowSpent()` · `remainingPomos()` · `confirmWeekPlan()`

- [ ] **Step 1: 계약 테스트 헬퍼를 먼저 만든다**

기존 테스트 3개(`today.test.ts`·`seed.test.ts`·`domain.test.ts`)가 **각자 로컬로** `drizzleUowOnMemoryDb()` 를 선언하고 있고 반환 모양도 통일돼 있지 않다. 새 테스트가 쓸 공용 헬퍼를 만든다. **기존 3개 파일은 건드리지 않는다** — 옮기면 이 태스크가 M2 테스트까지 손대게 된다.

```ts
// src/main/db/repositories/test-helpers.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UnitOfWork } from '../../services/ports'
import { seedSettings } from '../../services/seed'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

export const TEST_BASELINE = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

/**
 * 인메모리 실 SQLite (ADR-023 §3) + FK ON + 마이그레이션 + **설정 시딩**.
 *
 * `seedSettings` 를 포함하는 이유: `effectiveBaseline`(services/baseline.ts)이 그 주
 * `weeks` 스냅샷이 없을 때 settings 의 `focus_min` 을 읽고 **없으면 throw** 한다.
 * 시딩 없이 `confirmWeekPlan` 을 부르면 `missing required setting 'focus_min'` 으로 죽는다.
 */
export function testUow(): { uow: UnitOfWork; db: ReturnType<typeof drizzle> } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  const uow = makeDrizzleUow(db)
  seedSettings(uow)
  return { uow, db }
}

/**
 * `sessions.local_week` 는 `weeks.week` 를 참조하는 FK 다 (schema.ts, ADR-019 §4).
 * 세션을 넣기 전에 그 주 행이 없으면 `FOREIGN KEY constraint failed` 로 죽는다.
 * **주 경계를 넘기는 테스트(A10)는 두 주를 모두 만들어야 한다.**
 */
export function ensureWeeks(uow: UnitOfWork, ...weekKeys: readonly string[]): void {
  uow.run((repos) => {
    for (const week of weekKeys) repos.weeks.ensure(week, TEST_BASELINE)
  })
}
```

- [ ] **Step 2: 실패하는 계약 테스트 작성**

```ts
// src/main/db/repositories/week-items.test.ts
import { describe, expect, it } from 'vitest'
import { otherRowSpent } from '../../services/week-plan'
import { ensureWeeks, testUow } from './test-helpers'

const WEEK = '2026-08-03' // 월요일
const NEXT = '2026-08-10' // 그 다음 월요일

function focusSession(id: string, taskId: string | null, localDate: string, localWeek: string) {
  return {
    id,
    startedAt: '2026-08-04T01:00:00.000Z',
    endedAt: '2026-08-04T01:25:00.000Z',
    durationSec: 1500,
    kind: 'focus' as const,
    taskId,
    localDate,
    localWeek
  }
}

describe('weekItems.listForWeek — 소진 집계 (R8)', () => {
  it('항목 소진은 그 항목의 주에 기록된 focus 세션만 센다 (A10)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK, NEXT) // 두 주 모두 — sessions.local_week FK

    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '논문 3장', estPomos: 5, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '3장 1절' })

      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      // 같은 task 인데 주 경계를 넘겨 다음 주로 기록된 세션
      repos.sessions.insert(focusSession('s2', 't1', '2026-08-10', NEXT))

      const rows = repos.weekItems.listForWeek(WEEK)
      expect(rows).toHaveLength(1)
      expect(rows[0].spentPomos).toBe(1) // s2 는 이 주 소진이 아니다
      // 총 소진에는 각자의 주에서 정확히 한 번씩 세어진다
      expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(1)
      expect(repos.weekItems.weekTotalSpent(NEXT)).toBe(1)
    })
  })

  it('focus 가 아닌 세션은 세지 않는다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 2, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })
      repos.sessions.insert({ ...focusSession('s1', 't1', '2026-08-04', WEEK), kind: 'short' })
      expect(repos.weekItems.listForWeek(WEEK)[0].spentPomos).toBe(0)
    })
  })

  it('폐기·시스템 항목은 목록에서 빠지고 생성순으로 정렬된다 (R10·R18)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      repos.weekItems.ensureSystemItem(WEEK)
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '먼저', estPomos: 1, days: [] },
          { id: null, title: '나중', estPomos: 1, days: [] }
        ]
      })
      // 정렬은 결과가 2개 이상일 때만 검증된다. 폐기 테스트와 정렬 테스트를 한 케이스에
      // 몰면 최종 배열이 1개라 정렬을 전혀 보지 못한다 (2판의 실수).
      expect(repos.weekItems.listForWeek(WEEK).map((r) => r.title)).toEqual(['먼저', '나중'])

      // 이제 '먼저'만 남기고 재확정 → '나중'이 폐기되고 시스템 항목도 계속 빠진다
      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '먼저', estPomos: 1, days: [] }]
      })
      expect(repos.weekItems.listForWeek(WEEK).map((r) => r.title)).toEqual(['먼저'])
    })
  })

  it('자식 조각 완료/전체 수를 함께 돌려준다 (완료 제안의 재료)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const itemId = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각1' })
      repos.tasks.create({ id: 't2', weekItemId: itemId, title: '조각2' })
      repos.tasks.toggleComplete('t1')

      const row = repos.weekItems.listForWeek(WEEK)[0]
      expect(row.childTotal).toBe(2)
      expect(row.childDone).toBe(1)
    })
  })

  it('자식이 0개면 childTotal·childDone 이 0 이다 (SUM 의 NULL 폴백)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      })
      const row = repos.weekItems.listForWeek(WEEK)[0]
      expect(row.childTotal).toBe(0)
      expect(row.childDone).toBe(0)
    })
  })
})

describe('weekItems.confirmPlan — 선언형 확정', () => {
  it('id 가 있으면 ID 로 매칭해 갱신하고 자식·origin_week 를 유지한다 (R23·A30)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '원래 제목', estPomos: 3, days: [0] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })

      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id, title: '고친 제목', estPomos: 5, days: [1, 3] }]
      })

      const row = repos.weekItems.listForWeek(WEEK)[0]
      expect(row.id).toBe(id) // 새 행이 만들어지지 않았다
      expect(row.title).toBe('고친 제목')
      expect(row.estPomos).toBe(5)
      expect(row.days).toEqual([1, 3])
      expect(row.childTotal).toBe(1) // 자식 조각이 살아 있다
      expect(row.originWeek).toBe(WEEK)
    })
  })

  it('목록에서 빠진 기존 항목은 폐기되고 자식·세션이 전부 남는다 (R24·A32)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: '보낼 항목', estPomos: 9, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      for (let i = 0; i < 9; i++) {
        repos.sessions.insert(focusSession(`s${i}`, 't1', '2026-08-04', WEEK))
      }

      const { droppedIds } = repos.weekItems.confirmPlan({ week: WEEK, items: [] })

      expect(droppedIds).toEqual([id])
      expect(repos.weekItems.listForWeek(WEEK)).toHaveLength(0) // 목록에서 사라졌다
      expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(9) // 총 소진은 줄지 않았다
      expect(repos.tasks.get('t1')).not.toBeNull() // 조각은 남았다
    })
  })

  it('폐기 항목의 소진이 기타 행 차액으로 나타난다 (A24 · ADR-027 §1)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const { createdIds } = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '남길 항목', estPomos: 2, days: [] },
          { id: null, title: '보낼 항목', estPomos: 3, days: [] }
        ]
      })
      repos.tasks.create({ id: 'keep', weekItemId: createdIds[0], title: 'a' })
      repos.tasks.create({ id: 'gone', weekItemId: createdIds[1], title: 'b' })
      repos.sessions.insert(focusSession('s1', 'keep', '2026-08-04', WEEK))
      repos.sessions.insert(focusSession('s2', 'gone', '2026-08-04', WEEK))
      repos.sessions.insert(focusSession('s3', 'gone', '2026-08-04', WEEK))
      repos.sessions.insert(focusSession('s4', 'gone', '2026-08-04', WEEK))

      repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '남길 항목', estPomos: 2, days: [] }]
      })

      const visible = repos.weekItems.listForWeek(WEEK)
      const total = repos.weekItems.weekTotalSpent(WEEK)
      expect(total).toBe(4)
      expect(visible[0].spentPomos).toBe(1)
      expect(otherRowSpent(total, visible)).toBe(3) // 보낸 항목의 3뽀모가 여기 있다
    })
  })

  it('다른 주 항목 id 를 보내면 거부한다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK, NEXT)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: NEXT,
        items: [{ id: null, title: '다음 주 것', estPomos: 1, days: [] }]
      }).createdIds[0]
      expect(() =>
        repos.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id, title: '훔치기', estPomos: 1, days: [] }]
        })
      ).toThrow()
    })
  })
})

describe('weekItems.hasUnplannedActivity — 기타 행 표시 조건 ①② (ADR-027 §3)', () => {
  it('소진 0 이어도 부모 없는 조각이 있으면 true (A23)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const sysId = repos.weekItems.ensureSystemItem(WEEK)
      repos.tasks.create({ id: 't1', weekItemId: sysId, title: '직접 추가' })
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
      expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(0)
    })
  })

  it('미분류 세션(task 미연결)만 있어도 true', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK) // 세션 FK
    uow.run((repos) => {
      repos.sessions.insert(focusSession('s1', null, '2026-08-04', WEEK))
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
    })
  })

  it('폐기 항목의 소진만 있는 주는 이 술어로 false 다 — 세 번째 갈래가 필요한 이유', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      repos.weekItems.confirmPlan({ week: WEEK, items: [] })

      // 미분류 세션도 부모 없는 조각도 없다 → 이 술어만으로는 행이 숨겨진다.
      expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(false)
      // 그런데 차액은 1 이다. Task 4 의 weekSummary 가 세 번째 갈래로 이것을 살린다.
      expect(otherRowSpent(1, repos.weekItems.listForWeek(WEEK))).toBe(1)
    })
  })

  it('세션도 조각도 없는 주는 false', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(false))
  })
})
```

순수 함수 테스트:

```ts
// src/main/services/week-plan.test.ts
// `ensureWeeks` 를 아직 import 하지 않는다 — 이 파일의 Task 2 분량은 세션을 넣지 않으므로
// 쓰이지 않고, `no-unused-vars` 가 error 라 lint 가 깨진다. Task 3 에서 넓힌다.
import { describe, expect, it } from 'vitest'
import { testUow } from '../db/repositories/test-helpers'
import { confirmWeekPlan, otherRowSpent, remainingPomos } from './week-plan'

const WEEK = '2026-08-03'

describe('otherRowSpent (ADR-027 §1)', () => {
  it('총 소진에서 보이는 항목 소진 합을 뺀 값이다', () => {
    expect(otherRowSpent(18, [{ spentPomos: 10 }])).toBe(8)
  })

  it('보이는 항목이 없으면 총 소진 전부가 기타 행이다', () => {
    expect(otherRowSpent(4, [])).toBe(4)
  })
})

describe('remainingPomos (R9·A12)', () => {
  it('남은 몫은 est − 소진이다', () => {
    expect(remainingPomos(5, 2)).toBe(3)
  })

  it('소진이 est 를 넘어도 음수가 아니라 0 이다', () => {
    expect(remainingPomos(3, 5)).toBe(0)
  })
})

describe('confirmWeekPlan', () => {
  it('planned_at 은 최초 확정만 담고 재확정으로 갱신되지 않는다 (R23·A31)', () => {
    const { uow } = testUow()
    confirmWeekPlan(uow, {
      week: WEEK,
      budget: 20,
      items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
    })
    const first = uow.run((r) => r.weeks.plan(WEEK)!.plannedAt)
    expect(first).not.toBeNull()

    confirmWeekPlan(uow, { week: WEEK, budget: 25, items: [] })
    const second = uow.run((r) => r.weeks.plan(WEEK)!)
    expect(second.plannedAt).toBe(first) // 갱신되지 않았다
    expect(second.budget).toBe(25) // 예산은 갱신됐다
  })

  it('예산을 비운 채 확정하면 budget 이 NULL 로 남는다 (capacity 미설정 경로)', () => {
    const { uow } = testUow()
    confirmWeekPlan(uow, {
      week: WEEK,
      budget: null,
      items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
    })
    expect(uow.run((r) => r.weeks.plan(WEEK)!.budget)).toBeNull()
  })

  it('과적이어도 확정은 성공한다 (R22 — 차단 0건)', () => {
    const { uow } = testUow()
    const result = confirmWeekPlan(uow, {
      week: WEEK,
      budget: 2,
      items: [{ id: null, title: 'A', estPomos: 50, days: [] }]
    })
    expect(result.week).toBe(WEEK)
    expect(uow.run((r) => r.weekItems.listForWeek(WEEK))).toHaveLength(1)
  })
})
```

- [ ] **Step 3: 실행해 실패 확인** — `pnpm test` → FAIL (`confirmPlan`·`listForWeek` 없음)

- [ ] **Step 4: 포트 확장**

```ts
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
  ensureSystemItem(week: string): string
  weekOf(weekItemId: string): string | null
  /**
   * 일반 뷰에 표시되는 항목 + 소진. **이 술어의 정의역이 곧 ADR-027 §1 의 Σ 다** —
   * `is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL`.
   * 폐기 항목을 포함시키면 A24 가 깨진다.
   */
  listForWeek(week: string): WeekItemRow[]
  /** 그 주 focus 세션 전체. 폐기·삭제가 줄이지 않는다 (ADR-027 §2). */
  weekTotalSpent(week: string): number
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
}
```

- [ ] **Step 5: 리포지토리 구현** — `drizzle.ts` 의 `weekItems` 블록에 추가. **소진 술어는 이 파일에만 존재한다.**

```ts
listForWeek: (week) => {
  const rows = tx
    .select({
      id: weekItems.id,
      title: weekItems.title,
      estPomos: weekItems.estPomos,
      days: weekItems.days,
      originWeek: weekItems.originWeek,
      completedAt: weekItems.completedAt
    })
    .from(weekItems)
    .where(
      and(
        eq(weekItems.week, week),
        eq(weekItems.isSystem, 0),
        isNull(weekItems.droppedAt),
        isNull(weekItems.deletedAt)
      )
    )
    .orderBy(asc(weekItems.createdAt), sql`week_items.rowid`)
    .all()

  return rows.map((r) => {
    /**
     * week-plan R8 의 집계 술어. `s.local_week = <항목의 week>` 조건이 핵심이다 —
     * 빠뜨리면 주 경계를 넘긴 세션이 두 주에서 세어지고, 에러 없이 숫자만 틀린다.
     * 이 술어는 이 파일 안에만 존재한다.
     *
     * **`tasks.deleted_at` 을 일부러 거르지 않는다.** 바로 아래 `counts` 는 거른다 —
     * 두 질의가 서로 다른 질문에 답하기 때문이다:
     *   · `spentPomos` = "이 항목 몫으로 실제로 한 집중" → 조각을 지워도 집중은 있었다
     *   · `counts`     = "지금 남아 있는 조각 중 몇 개를 끝냈나" → 완료 제안의 재료
     * 여기에 `deleted_at` 필터를 더하면 삭제된 조각의 소진이 항목에서 사라지는데
     * `weekTotalSpent` 는 그대로라, 차액이 조용히 기타 행으로 새어 A24 가 깨진다.
     * 비대칭이 버그로 보여도 고치지 말 것 — 차액 항등식이 이것에 의존한다 (ADR-027 §2).
     */
    const spentPomos =
      tx
        .select({ n: sql<number>`count(*)` })
        .from(sessions)
        .innerJoin(tasks, eq(sessions.taskId, tasks.id))
        .where(
          and(eq(tasks.weekItemId, r.id), eq(sessions.kind, 'focus'), eq(sessions.localWeek, week))
        )
        .get()?.n ?? 0

    // 자식 0행이면 SQLite 의 sum() 은 NULL 을 돌려준다 — count 는 0 이므로 total 만으로
    // 판정하지 않고 done 쪽에 폴백을 둔다.
    const counts = tx
      .select({
        total: sql<number>`count(*)`,
        done: sql<number | null>`sum(case when ${tasks.completedAt} is not null then 1 else 0 end)`
      })
      .from(tasks)
      .where(and(eq(tasks.weekItemId, r.id), isNull(tasks.deletedAt)))
      .get()

    return {
      id: r.id,
      title: r.title,
      estPomos: r.estPomos,
      days: JSON.parse(r.days) as number[],
      originWeek: r.originWeek,
      completedAt: r.completedAt,
      spentPomos,
      childTotal: counts?.total ?? 0,
      childDone: counts?.done ?? 0
    }
  })
},

weekTotalSpent: (week) =>
  tx
    .select({ n: sql<number>`count(*)` })
    .from(sessions)
    .where(and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus')))
    .get()?.n ?? 0,

hasUnplannedActivity: (week) => {
  const looseSession = tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus'), isNull(sessions.taskId)))
    .get()
  if (looseSession) return true

  const orphanTask = tx
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(weekItems, eq(tasks.weekItemId, weekItems.id))
    .where(and(eq(weekItems.week, week), eq(weekItems.isSystem, 1), isNull(tasks.deletedAt)))
    .get()
  return orphanTask !== undefined
},

confirmPlan: ({ week, items }) => {
  const existing = tx
    .select({ id: weekItems.id })
    .from(weekItems)
    .where(
      and(
        eq(weekItems.week, week),
        eq(weekItems.isSystem, 0),
        isNull(weekItems.droppedAt),
        isNull(weekItems.deletedAt)
      )
    )
    .all()
    .map((r) => r.id)

  const createdIds: string[] = []
  const kept = new Set<string>()

  for (const item of items) {
    const days = JSON.stringify(item.days)
    if (item.id === null) {
      const id = uuidv7()
      tx.insert(weekItems)
        .values({
          id,
          week,
          title: item.title,
          estPomos: item.estPomos,
          days,
          // 신규는 이 주가 최초 생성 주다. 이월만 원본 값을 승계한다 (R11) — 그 경로는
          // 정산(M3b)이 별도로 만든다. 이 메서드를 이월에 재사용하면 배지가 1 로 리셋된다.
          originWeek: week,
          isSystem: 0
        })
        .run()
      createdIds.push(id)
      continue
    }
    if (!existing.includes(item.id)) {
      throw new Error(`confirmPlan: item '${item.id}' does not belong to week ${week}`)
    }
    // origin_week·carry_from_id·milestone_id 는 건드리지 않는다 — 이력이 끊긴다 (R23).
    tx.update(weekItems)
      .set({ title: item.title, estPomos: item.estPomos, days })
      .where(eq(weekItems.id, item.id))
      .run()
    kept.add(item.id)
  }

  const droppedIds = existing.filter((id) => !kept.has(id))
  for (const id of droppedIds) {
    // 폐기는 삭제가 아니다 (ADR-014 §1) — 자식 조각·세션은 손대지 않는다.
    tx.update(weekItems).set({ droppedAt: now() }).where(eq(weekItems.id, id)).run()
  }

  return { createdIds, droppedIds }
}
```

- [ ] **Step 6: 서비스 구현** — `src/main/services/week-plan.ts`

```ts
import { effectiveBaseline } from './baseline'
import type { PlanDraftItem, UnitOfWork, WeekItemRow } from './ports'

/**
 * 기타 행 소진 — **차액으로 정의한다** (ADR-027 §1).
 *
 * `visibleItems` 는 **화면에 보이는 항목**(= `listForWeek` 의 결과)이어야 한다. 폐기 항목을
 * 넣으면 그 소진이 상쇄되어 어디에도 나타나지 않고 A24 가 깨진다.
 *
 * 클램프하지 않는다 — 술어가 옳으면 음수가 될 수 없고, 음수가 나온다면 그것은 숨겨야 할
 * 값이 아니라 드러나야 할 버그다.
 */
export function otherRowSpent(
  weekTotalSpent: number,
  visibleItems: readonly Pick<WeekItemRow, 'spentPomos'>[]
): number {
  return weekTotalSpent - visibleItems.reduce((sum, item) => sum + item.spentPomos, 0)
}

/**
 * 항목의 남은 몫 (R9·A12). 기준은 **항목 est** 이며 자식 조각 est 합이 아니다.
 * 0 에서 클램프한다 — 소진이 est 를 넘긴 항목의 남은 몫은 음수가 아니라 0 이다.
 *
 * 화면에 그리는 것은 정산(M3b)이지만 규칙의 소유는 week-plan R9 이므로 여기서 만든다.
 * 두 곳에서 각자 클램프하면 한쪽만 고쳐지는 날이 온다.
 */
export function remainingPomos(estPomos: number, spentPomos: number): number {
  return Math.max(0, estPomos - spentPomos)
}

/**
 * 플래너 확정 (R22~R24). **과적 여부와 무관하게 항상 성공한다** — 확정을 막는 경로가
 * 이 함수에 없다 (R22, 차단 0건). 전체가 트랜잭션 하나다 (ADR-015).
 */
export function confirmWeekPlan(
  uow: UnitOfWork,
  input: { week: string; budget: number | null; items: readonly PlanDraftItem[] }
): { week: string; droppedCount: number } {
  return uow.run((repos) => {
    // 행이 없으면 그 시점 유효 길이를 박제해 만든다 (ADR-013 §2). 있으면 덮지 않는다.
    // NOTE(M3b): weekly-review R37 은 capacity·예산까지 함께 박제하라고 요구한다.
    // M3a 는 capacity 가 항상 NULL 이라 무해하지만, 정산이 capacity 편집을 들이면
    // 플래너로 만든 주만 capacity 스냅샷이 비는 비대칭이 생긴다. 그때 ensure 를 확장할 것.
    repos.weeks.ensure(input.week, effectiveBaseline(repos, input.week))
    repos.weeks.setPlan(input.week, input.budget)
    const { droppedIds } = repos.weekItems.confirmPlan({ week: input.week, items: input.items })
    return { week: input.week, droppedCount: droppedIds.length }
  })
}
```

- [ ] **Step 7: 통과 확인** — `pnpm test` PASS, `pnpm lint` 통과

- [ ] **Step 8: 커밋** — `feat: add week item repository with spent aggregation and declarative confirm`

---

### Task 3: 드로어 · 완료 · 폐기 · 원클릭 pull

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/services/week-plan.ts`, `src/main/db/repositories/drizzle.ts`
- Test: `week-items.test.ts`(추가), `week-plan.test.ts`(추가)

**Interfaces:**
- Produces: `WeekItemsRepository.header` · `.childTasks` · `.nextPullable` · `.complete` · `.uncomplete` · `.drop`; `itemDrawer()` · `pullNextFromItem()` · `pullFromDrawer()` · `setItemCompleted()` · `dropItem()`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// week-items.test.ts 에 추가 (기존 import 에 이어서)
describe('weekItems.nextPullable — 원클릭 pull 대상', () => {
  it('유자격 = 미완료·미삭제·오늘 pull 없음, 생성순 첫 번째', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '첫째' })
      repos.tasks.create({ id: 't2', weekItemId: id, title: '둘째' })

      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBe('t1')
      repos.today.pull('t1', '2026-08-04')
      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBe('t2')
      repos.tasks.toggleComplete('t2')
      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBeNull()
    })
  })

  it('치운 조각은 다시 유자격이다 — removed_at 분기 (today-tasks R14)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      repos.today.pull('t1', '2026-08-04')
      // 그날 focus 세션이 있어야 remove 가 행 삭제가 아니라 removed_at 마킹이 된다.
      // 세션이 없으면 행이 지워져 `taskPulls IS NULL` 분기로 통과해버려,
      // 검증하려던 `removed_at IS NOT NULL` 경로가 한 번도 실행되지 않는다.
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))
      expect(repos.today.remove('t1', '2026-08-04')).toBe('marked')

      expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBe('t1')
    })
  })
})

describe('weekItems.childTasks — 드로어 목록 (§6.2)', () => {
  it('조각별 소진과 오늘 목록 상태를 함께 준다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
      }).createdIds[0]
      repos.tasks.create({ id: 't1', weekItemId: id, title: '조각1', estPomos: 2 })
      repos.tasks.create({ id: 't2', weekItemId: id, title: '조각2' })
      repos.today.pull('t2', '2026-08-04')
      repos.sessions.insert(focusSession('s1', 't1', '2026-08-04', WEEK))

      expect(repos.weekItems.childTasks(id, '2026-08-04')).toEqual([
        { taskId: 't1', title: '조각1', estPomos: 2, spentPomos: 1, completedAt: null, inToday: false },
        { taskId: 't2', title: '조각2', estPomos: null, spentPomos: 0, completedAt: null, inToday: true }
      ])
    })
  })
})

describe('weekItems.header — 드로어 헤더 (폐기 항목도 열린다)', () => {
  it('폐기된 항목의 주·완료 시각을 읽을 수 있다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    uow.run((repos) => {
      const id = repos.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
      }).createdIds[0]
      repos.weekItems.confirmPlan({ week: WEEK, items: [] })
      expect(repos.weekItems.header(id)).toEqual({ week: WEEK, completedAt: null })
    })
  })
})
```

```ts
// week-plan.test.ts 에 추가.
// 기존 test-helpers import 줄을 `import { ensureWeeks, testUow } from ...` 로 넓힌다 —
// Task 2 시점에는 ensureWeeks 가 필요 없었고, 세션을 넣는 여기서부터 필요해진다.
import { dropItem, itemDrawer, pullFromDrawer, pullNextFromItem, setItemCompleted } from './week-plan'

// 이 세 유스케이스는 `localKeys()` 로 오늘 날짜를 스스로 읽는다. 테스트가 날짜를
// 하드코딩하지 않는 이유다 — 어느 날 돌려도 통과해야 한다.
describe('pullNextFromItem — 원클릭 pull (§3.1·R27)', () => {
  it('생성순 다음 유자격 조각을 하나씩 가져온다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '첫째' })
      r.tasks.create({ id: 't2', weekItemId: id, title: '둘째' })
    })

    expect(pullNextFromItem(uow, id).pulled).toEqual({ taskId: 't1', title: '첫째' })
    expect(pullNextFromItem(uow, id).pulled).toEqual({ taskId: 't2', title: '둘째' })
  })

  it('유자격 조각이 0개면 던지지 않고 pulled: null 을 돌려준다 (드로어 폴백 신호)', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    const result = pullNextFromItem(uow, id)
    expect(result.pulled).toBeNull()
    expect(result.itemWeek).toBe(WEEK) // 화면이 무효화할 주를 알아야 한다
  })

  it('완료된 항목에서는 pull 할 수 없다 (R27) — pullFromDrawer 와 같은 가드다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
    setItemCompleted(uow, id, true)

    expect(() => pullNextFromItem(uow, id)).toThrow()
  })
})

describe('itemDrawer', () => {
  it('폐기된 항목도 열린다 — header 는 listForWeek 밖을 본다', () => {
    const { uow } = testUow()
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
    dropItem(uow, id)

    const drawer = itemDrawer(uow, id)
    expect(drawer.itemWeek).toBe(WEEK)
    expect(drawer.tasks.map((t) => t.taskId)).toEqual(['t1'])
  })

  it('없는 항목이면 던진다', () => {
    const { uow } = testUow()
    expect(() => itemDrawer(uow, 'nope')).toThrow()
  })
})

describe('dropItem — 폐기는 삭제가 아니다 (ADR-014 §1·ADR-027 §2)', () => {
  it('목록에서 빠지되 그 소진이 주간 총 소진에 남아 기타 행으로 흡수된다 (A24)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK) // 세션 FK
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      r.sessions.insert({
        id: 's1',
        startedAt: '2026-08-04T01:00:00.000Z',
        endedAt: '2026-08-04T01:25:00.000Z',
        durationSec: 1500,
        kind: 'focus',
        taskId: 't1',
        localDate: '2026-08-04',
        localWeek: WEEK
      })
    })

    expect(dropItem(uow, id).itemWeek).toBe(WEEK)
    uow.run((r) => {
      expect(r.weekItems.listForWeek(WEEK)).toHaveLength(0) // 목록에서 빠졌다
      expect(r.weekItems.weekTotalSpent(WEEK)).toBe(1) // 총 소진은 줄지 않는다
      expect(otherRowSpent(1, r.weekItems.listForWeek(WEEK))).toBe(1) // 기타 행이 받는다
      expect(r.weekItems.childTasks(id, '2026-08-04')).toHaveLength(1) // 조각도 남았다
    })
  })
})

describe('setItemCompleted (R25·R27·R28)', () => {
  it('완료 후 세션이 더 붙어도 completed_at 이 변하지 않는다 (A37)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))

    const at = setItemCompleted(uow, id, true).completedAt
    expect(at).not.toBeNull()

    uow.run((r) => {
      for (let i = 0; i < 5; i++) {
        r.sessions.insert({
          id: `s${i}`,
          startedAt: '2026-08-04T01:00:00.000Z',
          endedAt: '2026-08-04T01:25:00.000Z',
          durationSec: 1500,
          kind: 'focus',
          taskId: 't1',
          localDate: '2026-08-04',
          localWeek: WEEK
        })
      }
    })

    const row = uow.run((r) => r.weekItems.listForWeek(WEEK)[0])
    expect(row.spentPomos).toBe(5) // 소진은 계속 오른다
    expect(row.completedAt).toBe(at) // 완료 시각은 그대로다
  })

  it('완료를 해제하면 NULL 로 돌아간다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    setItemCompleted(uow, id, true)
    expect(setItemCompleted(uow, id, false).completedAt).toBeNull()
  })
})

describe('pullFromDrawer — R7·R27 을 서비스에서 강제한다', () => {
  it('완료된 항목에서는 pull 할 수 없다 (R27)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
    setItemCompleted(uow, id, true)

    expect(() => pullFromDrawer(uow, { weekItemId: id, taskIds: ['t1'], newTask: null })).toThrow()
  })

  it('완료된 조각은 pull 하지 않는다 (R7)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      r.tasks.toggleComplete('t1')
    })
    expect(() => pullFromDrawer(uow, { weekItemId: id, taskIds: ['t1'], newTask: null })).toThrow()
  })

  it('다른 항목의 조각을 끼워 넣을 수 없다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const { createdIds } = uow.run((r) =>
      r.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: 'A', estPomos: 1, days: [] },
          { id: null, title: 'B', estPomos: 1, days: [] }
        ]
      })
    )
    uow.run((r) => r.tasks.create({ id: 'tb', weekItemId: createdIds[1], title: 'B 의 조각' }))
    expect(() =>
      pullFromDrawer(uow, { weekItemId: createdIds[0], taskIds: ['tb'], newTask: null })
    ).toThrow()
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL

- [ ] **Step 3: 포트 확장**

```ts
export type ChildTaskRow = {
  taskId: string
  title: string
  estPomos: number | null
  spentPomos: number
  completedAt: string | null
  /** 그 날짜에 활성 pull 행이 있는가 (§6.2 `오늘 목록에`). */
  inToday: boolean
}

export interface WeekItemsRepository {
  // ...Task 2 의 것들
  /** 드로어 헤더. 폐기 항목도 읽을 수 있다 (listForWeek 로는 못 찾는다). 없으면 null. */
  header(weekItemId: string): { week: string; completedAt: string | null } | null
  childTasks(weekItemId: string, dayKey: string): ChildTaskRow[]
  /** 원클릭 pull 대상. 유자격 조각이 없으면 null (그때 화면은 드로어를 연다). */
  nextPullable(weekItemId: string, dayKey: string): string | null
  complete(weekItemId: string, at: string): void
  uncomplete(weekItemId: string): void
  drop(weekItemId: string): void
}
```

`complete`/`uncomplete` 를 **두 메서드로 나눈 이유:** `setCompleted(id, at | null)` 은 `update(id, patch)` 모양이라 ports.ts 상단이 금지하는 CRUD 포트다. 유스케이스 이름으로 나눈다.

- [ ] **Step 4: 리포지토리 구현**

```ts
header: (weekItemId) =>
  tx
    .select({ week: weekItems.week, completedAt: weekItems.completedAt })
    .from(weekItems)
    .where(eq(weekItems.id, weekItemId))
    .get() ?? null,

childTasks: (weekItemId, dayKey) => {
  const rows = tx
    .select({
      taskId: tasks.id,
      title: tasks.title,
      estPomos: tasks.estPomos,
      completedAt: tasks.completedAt
    })
    .from(tasks)
    .where(and(eq(tasks.weekItemId, weekItemId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.createdAt), sql`tasks.rowid`)
    .all()

  return rows.map((r) => {
    // 조각 단위 소진에는 주 조건을 걸지 않는다 — 이 숫자가 답하는 질문은 "이 조각으로
    // 몇 뽀모 했나"이지 "이 주에 몇 뽀모 했나"가 아니다. 주 조건은 항목 소진(R8)의 것이다.
    const spentPomos =
      tx
        .select({ n: sql<number>`count(*)` })
        .from(sessions)
        .where(and(eq(sessions.taskId, r.taskId), eq(sessions.kind, 'focus')))
        .get()?.n ?? 0

    const active = tx
      .select({ taskId: taskPulls.taskId })
      .from(taskPulls)
      .where(
        and(
          eq(taskPulls.taskId, r.taskId),
          eq(taskPulls.pullDate, dayKey),
          isNull(taskPulls.removedAt)
        )
      )
      .get()

    return { ...r, spentPomos, inToday: active !== undefined }
  })
},

// task_pulls 의 PK 가 (task_id, pull_date) 이고 조인 조건에 pullDate 가 고정돼 있으므로
// task 당 조인 행은 최대 1개다 — 중복 행이 나오지 않는다.
nextPullable: (weekItemId, dayKey) =>
  tx
    .select({ id: tasks.id })
    .from(tasks)
    .leftJoin(taskPulls, and(eq(taskPulls.taskId, tasks.id), eq(taskPulls.pullDate, dayKey)))
    .where(
      and(
        eq(tasks.weekItemId, weekItemId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        // 오늘 pull 행이 없거나, 있어도 치워진 행이면 다시 유자격이다 (R14).
        sql`(${taskPulls.taskId} IS NULL OR ${taskPulls.removedAt} IS NOT NULL)`
      )
    )
    .orderBy(asc(tasks.createdAt), sql`tasks.rowid`)
    .get()?.id ?? null,

complete: (weekItemId, at) => {
  tx.update(weekItems).set({ completedAt: at }).where(eq(weekItems.id, weekItemId)).run()
},

uncomplete: (weekItemId) => {
  tx.update(weekItems).set({ completedAt: null }).where(eq(weekItems.id, weekItemId)).run()
},

drop: (weekItemId) => {
  tx.update(weekItems).set({ droppedAt: now() }).where(eq(weekItems.id, weekItemId)).run()
}
```

- [ ] **Step 5: 유스케이스 구현** — `week-plan.ts` 에 추가

```ts
import { v7 as uuidv7 } from 'uuid'
import { localKeys, now } from '../../shared/time'
import type { ChildTaskRow } from './ports'

/** 드로어 한 화면 = 응답 하나. 폐기 항목도 열린다 (header 가 listForWeek 밖을 본다). */
export function itemDrawer(
  uow: UnitOfWork,
  weekItemId: string
): { itemWeek: string; completedAt: string | null; tasks: ChildTaskRow[] } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`itemDrawer: week item '${weekItemId}' not found`)
    return {
      itemWeek: header.week,
      completedAt: header.completedAt,
      tasks: repos.weekItems.childTasks(weekItemId, localDate)
    }
  })
}

/**
 * 원클릭 pull (§3.1). 유자격 조각이 없으면 `pulled: null` 을 돌려주고, 화면은 그것을
 * 신호로 드로어를 연다 — 첫 pull 은 선택이 아니라 생성이기 때문이다 (R12).
 */
export function pullNextFromItem(
  uow: UnitOfWork,
  weekItemId: string
): { pulled: { taskId: string; title: string } | null; itemWeek: string } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`pullNext: week item '${weekItemId}' not found`)
    // 완료된 항목은 pull 을 막는다 (R27). 화면도 막지만 계약이 최종 방어선이다.
    if (header.completedAt !== null) {
      throw new Error(`pullNext: item '${weekItemId}' is completed`)
    }

    const taskId = repos.weekItems.nextPullable(weekItemId, localDate)
    if (taskId === null) return { pulled: null, itemWeek: header.week }

    repos.today.pull(taskId, localDate)
    return { pulled: { taskId, title: repos.tasks.titleOf(taskId) ?? '' }, itemWeek: header.week }
  })
}

/**
 * 드로어의 `오늘로 가져오기` (§6.3) — 새 조각 생성 + 선택한 기존 조각을 한 트랜잭션으로.
 *
 * M2 의 `pullTask`(services/today.ts)와 같은 규율을 따른다: **완료 거부·소속 검증을
 * 서비스가 한다.** UI 비활성만으로는 IPC 를 직접 부르는 경로가 열린다.
 */
export function pullFromDrawer(
  uow: UnitOfWork,
  input: {
    weekItemId: string
    taskIds: readonly string[]
    newTask: { title: string; estPomos: number | null } | null
  }
): { itemWeek: string } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const header = repos.weekItems.header(input.weekItemId)
    if (header === null) throw new Error(`pullFromDrawer: item '${input.weekItemId}' not found`)
    if (header.completedAt !== null) {
      throw new Error(`pullFromDrawer: item '${input.weekItemId}' is completed`) // R27
    }

    for (const taskId of input.taskIds) {
      const task = repos.tasks.get(taskId)
      if (!task) throw new Error(`pullFromDrawer: task '${taskId}' not found`)
      if (task.weekItemId !== input.weekItemId) {
        throw new Error(`pullFromDrawer: task '${taskId}' does not belong to this item`)
      }
      if (task.completedAt !== null) {
        throw new Error(`pullFromDrawer: task '${taskId}' is already completed`) // R7
      }
    }

    if (input.newTask !== null) {
      const trimmed = input.newTask.title.trim()
      if (trimmed === '') throw new Error('pullFromDrawer: new task title must not be empty')
      const taskId = uuidv7()
      repos.tasks.create({
        id: taskId,
        weekItemId: input.weekItemId,
        title: trimmed,
        ...(input.newTask.estPomos === null ? {} : { estPomos: input.newTask.estPomos })
      })
      repos.today.pull(taskId, localDate)
    }
    for (const taskId of input.taskIds) repos.today.pull(taskId, localDate)

    return { itemWeek: header.week }
  })
}

/** 항목 완료 확정·해제 (R25·R27). 완료는 언제나 사용자 클릭이 만드는 사실이다. */
export function setItemCompleted(
  uow: UnitOfWork,
  weekItemId: string,
  completed: boolean
): { itemWeek: string; completedAt: string | null } {
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`setItemCompleted: item '${weekItemId}' not found`)
    if (!completed) {
      repos.weekItems.uncomplete(weekItemId)
      return { itemWeek: header.week, completedAt: null }
    }
    const at = now()
    repos.weekItems.complete(weekItemId, at)
    return { itemWeek: header.week, completedAt: at }
  })
}

/** `보내주기` (§6.3). 폐기이지 삭제가 아니다 — 자식 조각·세션은 남는다 (ADR-014 §1). */
export function dropItem(uow: UnitOfWork, weekItemId: string): { itemWeek: string } {
  return uow.run((repos) => {
    const header = repos.weekItems.header(weekItemId)
    if (header === null) throw new Error(`dropItem: item '${weekItemId}' not found`)
    repos.weekItems.drop(weekItemId)
    return { itemWeek: header.week }
  })
}
```

- [ ] **Step 6: 통과 확인** — `pnpm test` PASS

- [ ] **Step 7: 커밋** — `feat: add drawer, item completion, drop and one-click pull`

---

### Task 4: 주간 카드 조회 유스케이스 + IPC 9종

**Files:**
- Modify: `src/shared/ipc/{channels,contracts,api}.ts`, `src/preload/index.ts`, `src/main/index.ts`, `src/main/services/week-plan.ts`
- Create: `src/main/ipc/week.ts`
- Test: `week-plan.test.ts`(추가), `src/main/ipc/registration.test.ts`(기존 갱신)

**Interfaces:**
- Produces: `weekSummary()`, `planDraft()`; `window.api.week.{summary,planDraft,confirmPlan,drawer,pullNext,pullFromDrawer,complete,uncomplete,drop}`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// week-plan.test.ts 에 추가
import { weekSummary, planDraft } from './week-plan'

describe('weekSummary — 한 화면 = 한 응답', () => {
  it('등식이 성립한다: Σ(보이는 항목) + 기타 행 = 총 소진 (성공 지표)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 4, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      const s = (sid: string, taskId: string | null) => ({
        id: sid,
        startedAt: '2026-08-04T01:00:00.000Z',
        endedAt: '2026-08-04T01:25:00.000Z',
        durationSec: 1500,
        kind: 'focus' as const,
        taskId,
        localDate: '2026-08-04',
        localWeek: WEEK
      })
      r.sessions.insert(s('s1', 't1'))
      r.sessions.insert(s('s2', null))
      r.sessions.insert(s('s3', null))
    })

    const summary = weekSummary(uow, WEEK)
    expect(summary.totalSpent).toBe(3)
    expect(summary.items).toHaveLength(1)
    expect(summary.otherRow).toEqual({ visible: true, spentPomos: 2 })
    expect(
      summary.items.reduce((n, i) => n + i.spentPomos, 0) + summary.otherRow.spentPomos
    ).toBe(summary.totalSpent)
  })

  it('폐기 항목의 소진만 있는 주에도 기타 행이 보인다 (A24 · ADR-027 §3 세 번째 갈래)', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    const id = uow.run(
      (r) =>
        r.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
    )
    uow.run((r) => {
      r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
      for (let i = 0; i < 3; i++) {
        r.sessions.insert({
          id: `s${i}`,
          startedAt: '2026-08-04T01:00:00.000Z',
          endedAt: '2026-08-04T01:25:00.000Z',
          durationSec: 1500,
          kind: 'focus',
          taskId: 't1',
          localDate: '2026-08-04',
          localWeek: WEEK
        })
      }
      r.weekItems.confirmPlan({ week: WEEK, items: [] }) // 폐기
    })

    const summary = weekSummary(uow, WEEK)
    expect(summary.items).toHaveLength(0)
    // 미분류 세션도 부모 없는 조각도 없지만 차액이 3 이므로 행을 보여야 한다.
    expect(summary.otherRow).toEqual({ visible: true, spentPomos: 3 })
  })

  it('세션도 조각도 없으면 기타 행을 숨긴다', () => {
    const { uow } = testUow()
    ensureWeeks(uow, WEEK)
    expect(weekSummary(uow, WEEK).otherRow.visible).toBe(false)
  })

  it('weeks 행이 없으면 budget 이 null 이다 (기록 없음)', () => {
    const { uow } = testUow()
    expect(weekSummary(uow, WEEK).budget).toBeNull()
  })
})

describe('planDraft — 플래너 진입 프리필 (R16)', () => {
  it('활성 항목만 초안에 싣는다 — 폐기·시스템 항목은 빠진다', () => {
    const { uow } = testUow()
    const { createdIds } = uow.run((r) => {
      r.weekItems.ensureSystemItem(WEEK) // 기타 항목 — 초안에 나오면 안 된다
      return r.weekItems.confirmPlan({
        week: WEEK,
        items: [
          { id: null, title: '남길 것', estPomos: 4, days: [1, 3] },
          { id: null, title: '보낼 것', estPomos: 2, days: [] }
        ]
      })
    })
    uow.run((r) =>
      r.weekItems.confirmPlan({
        week: WEEK,
        items: [{ id: createdIds[0], title: '남길 것', estPomos: 4, days: [1, 3] }]
      })
    )

    const draft = planDraft(uow, WEEK)
    expect(draft.items).toEqual([
      { id: createdIds[0], title: '남길 것', estPomos: 4, days: [1, 3] }
    ])
  })

  it('capacity 미설정이면 prefill 이 null 이라 플래너 입력이 빈 채로 열린다 (A5)', () => {
    const { uow } = testUow() // seedSettings 는 weekly_capacity 를 넣지 않는다
    const draft = planDraft(uow, WEEK)
    expect(draft.prefill).toBeNull()
    expect(draft.budget).toBeNull() // 아직 weeks 행이 없다 = 기록 없음
  })

  it('확정된 예산은 budget 으로, 프리필 후보는 prefill 로 따로 실린다', () => {
    const { uow } = testUow()
    confirmWeekPlan(uow, { week: WEEK, budget: 18, items: [] })
    const draft = planDraft(uow, WEEK)
    expect(draft.budget).toBe(18) // 이미 정한 값
    expect(draft.prefill).toBeNull() // capacity 는 여전히 미설정
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 조회 유스케이스 구현**

```ts
export type WeekSummary = {
  week: string
  budget: number | null
  totalSpent: number
  items: WeekItemRow[]
  otherRow: { visible: boolean; spentPomos: number }
}

/** 일반 뷰 한 화면 = 응답 하나. 화면이 조각을 모아 조립하지 않게 한다. */
export function weekSummary(uow: UnitOfWork, week: string): WeekSummary {
  return uow.run((repos) => {
    const items = repos.weekItems.listForWeek(week)
    const totalSpent = repos.weekItems.weekTotalSpent(week)
    const spentPomos = otherRowSpent(totalSpent, items)
    return {
      week,
      budget: effectiveBudget(repos, week),
      totalSpent,
      items,
      otherRow: {
        // 표시 조건 세 갈래 (ADR-027 §3). 세 번째(`spentPomos > 0`)가 폐기·삭제로
        // 흘러든 소진을 잡는다 — 앞의 두 갈래만 보면 A24 가 깨진다.
        visible: repos.weekItems.hasUnplannedActivity(week) || spentPomos > 0,
        spentPomos
      }
    }
  })
}

/** 플래너 진입 시 초안 프리필. 기타 항목은 초안에 넣지 않는다 (R16). */
export function planDraft(
  uow: UnitOfWork,
  week: string
): { week: string; budget: number | null; prefill: number | null; items: PlanDraftItem[] } {
  return uow.run((repos) => ({
    week,
    budget: effectiveBudget(repos, week),
    prefill: budgetPrefill(repos),
    items: repos.weekItems.listForWeek(week).map((i) => ({
      id: i.id,
      title: i.title,
      estPomos: i.estPomos,
      days: i.days
    }))
  }))
}
```

- [ ] **Step 4: IPC 배선** — `channels.ts` 에 `week` 블록 9종을 더하고, `contracts.ts` 에 req/res 스키마(응답은 전부 `strictObject`), `api.ts`·`preload/index.ts`·`main/ipc/week.ts`·`main/index.ts` 를 채워 **채널 추가 4곳 규칙**을 지킨다. `main/ipc/week.ts` 는 M2 의 `today.ts` 와 같은 모양으로 `handleIpc` 만 쓴다.

```ts
// channels.ts
week: {
  summary: 'week:summary',
  planDraft: 'week:planDraft',
  confirmPlan: 'week:confirmPlan',
  drawer: 'week:drawer',
  pullNext: 'week:pullNext',
  pullFromDrawer: 'week:pullFromDrawer',
  complete: 'week:complete',
  uncomplete: 'week:uncomplete',
  drop: 'week:drop'
}
```

```ts
// contracts.ts
const weekItemRowSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  estPomos: z.int(),
  days: z.array(z.int().min(0).max(6)),
  originWeek: z.string(),
  completedAt: z.string().nullable(),
  spentPomos: z.int(),
  childTotal: z.int(),
  childDone: z.int()
})

// 사용자가 만드는 항목의 est 하한은 1 이다 (R6). 기타 항목은 이 경로를 거치지 않는다.
const planDraftItemSchema = z.strictObject({
  id: z.string().nullable(),
  title: z.string().min(1).max(40),
  estPomos: z.int().min(1),
  days: z.array(z.int().min(0).max(6))
})

const childTaskSchema = z.strictObject({
  taskId: z.string(),
  title: z.string(),
  estPomos: z.int().nullable(),
  spentPomos: z.int(),
  completedAt: z.string().nullable(),
  inToday: z.boolean()
})

week: {
  summary: {
    req: z.tuple([z.string()]),
    res: z.strictObject({
      week: z.string(),
      budget: z.int().nullable(),
      totalSpent: z.int(),
      items: z.array(weekItemRowSchema),
      otherRow: z.strictObject({ visible: z.boolean(), spentPomos: z.int() })
    })
  },
  planDraft: {
    req: z.tuple([z.string()]),
    res: z.strictObject({
      week: z.string(),
      budget: z.int().nullable(),
      prefill: z.int().nullable(),
      items: z.array(planDraftItemSchema)
    })
  },
  confirmPlan: {
    req: z.tuple([
      z.strictObject({
        week: z.string(),
        budget: z.int().min(0).nullable(),
        items: z.array(planDraftItemSchema)
      })
    ]),
    res: z.strictObject({ week: z.string(), droppedCount: z.int() })
  },
  drawer: {
    req: z.tuple([z.string()]),
    res: z.strictObject({
      itemWeek: z.string(),
      completedAt: z.string().nullable(),
      tasks: z.array(childTaskSchema)
    })
  },
  pullNext: {
    req: z.tuple([z.string()]),
    res: z.strictObject({
      itemWeek: z.string(),
      pulled: z.strictObject({ taskId: z.string(), title: z.string() }).nullable()
    })
  },
  pullFromDrawer: {
    req: z.tuple([
      z.strictObject({
        weekItemId: z.string(),
        taskIds: z.array(z.string()),
        newTask: z
          .strictObject({ title: z.string().min(1).max(40), estPomos: z.int().min(1).nullable() })
          .nullable()
      })
    ]),
    res: z.strictObject({ itemWeek: z.string() })
  },
  complete: {
    req: z.tuple([z.string()]),
    res: z.strictObject({ itemWeek: z.string(), completedAt: z.string().nullable() })
  },
  uncomplete: {
    req: z.tuple([z.string()]),
    res: z.strictObject({ itemWeek: z.string(), completedAt: z.string().nullable() })
  },
  drop: { req: z.tuple([z.string()]), res: z.strictObject({ itemWeek: z.string() }) }
}
```

- [ ] **Step 5: 통과 확인** — `pnpm test` PASS. `pnpm dev` 콘솔:
  `const { weekKey } = await window.api.clock.now()` → `await window.api.week.confirmPlan({ week: weekKey, budget: 20, items: [{ id: null, title: '테스트', estPomos: 3, days: [] }] })` → `await window.api.week.summary(weekKey)` 에 항목 1행.

- [ ] **Step 6: 커밋** — `feat: expose week plan use cases over validated ipc`

---

### Task 5: 쿼리 키 정정 — M2 의 무효화를 실제로 연결한다

**1판의 치명적 결함이 여기 있었다.** M2 는 `keys.weekItems(w)` = `['week', w, 'items']` 를 무효화하는데, 주간 카드 쿼리의 키는 `['week', w]` 다. TanStack Query 의 무효화는 **주어진 키를 접두사로 갖는 쿼리**를 잡으므로 **긴 키로 짧은 키를 잡을 수 없다.** 그대로 두면 세션을 기록해도 주간 카드가 갱신되지 않는다 — 이 마일스톤 Goal 의 마지막 화살표가 끊긴다.

`keys.weekItems` 는 **현재 어떤 쿼리도 쓰지 않는다**(실측 확인). 죽은 팩토리 항목을 남기면 나중에 누군가 그것을 쿼리 키로 쓰고 "무효화되는 줄" 알게 되므로 **제거**하고 `keys.week` 로 대체한다.

**Files:**
- Modify: `src/renderer/shared/query/keys.ts`, `src/renderer/shared/query/invalidate.ts`
- Test: `src/renderer/shared/query/invalidate.test.ts`(기존 4사건 갱신 + 신규 2사건)
- Test: `src/renderer/shared/query/events.test.ts` — **누락하면 typecheck 가 깨진다.** `:91` 이 `keys.weekItems('2026-08-03')` 를 **직접 호출**한다. 팩토리에서 항목을 지우는 순간 이 줄이 TS2339 로 죽는다. 코드베이스 전체에서 팩토리를 직접 부르는 유일한 자리이므로 `grep -rn "weekItems" src/` 로 0건이 될 때까지 확인한다

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 4사건의 기대값을 `['week', w]` 로 고치고, 신규 2사건을 더한다.

```ts
// invalidate.test.ts — 기존 session-recorded 기대값 수정
// payload 는 SessionRecorded 전체 필드를 채운다. 부분 객체를 넘기면 TS2739 다.
it('session-recorded 는 그 세션 주의 카드를 무효화한다', () => {
  expect(
    keysToInvalidate({
      type: 'session-recorded',
      payload: {
        sessionId: 's1',
        kind: 'focus',
        taskId: 't1',
        durationSec: 1500,
        localDate: '2026-08-05',
        localWeek: '2026-08-03'
      },
      currentDayKey: '2026-08-05'
    })
  ).toContainEqual(['week', '2026-08-03'])
})

describe('plan-confirmed', () => {
  it('확정한 주와 오늘 목록을 무효화한다', () => {
    expect(
      keysToInvalidate({
        type: 'plan-confirmed',
        payload: { week: '2026-08-03' },
        currentDayKey: '2026-08-05'
      })
    ).toEqual([['week', '2026-08-03'], ['today', '2026-08-05']])
  })
})

describe('item-changed', () => {
  it('그 항목의 주와 오늘 목록을 무효화한다', () => {
    expect(
      keysToInvalidate({
        type: 'item-changed',
        payload: { itemWeek: '2026-08-10' },
        currentDayKey: '2026-08-05'
      })
    ).toEqual([['week', '2026-08-10'], ['today', '2026-08-05']])
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`keys.ts` — `weekItems` 를 제거하고 `week` 를 넣는다:

```ts
/**
 * 주간 카드 한 화면 (summary). `['week', weekKey]` 이며 `weekAll()` prefix 에 걸린다.
 *
 * M2 의 `weekItems(weekKey)` = `['week', weekKey, 'items']` 를 대체한다. 그 키는 어떤
 * 쿼리도 쓰지 않는 상태였고, 더 긴 키로는 이 카드 쿼리를 무효화할 수 없었다 —
 * 무효화는 "주어진 키를 접두사로 갖는 쿼리"를 잡으므로 방향이 반대다.
 */
week: (weekKey: string) => ['week', weekKey] as const,
```

`invalidate.ts` — 기존 4사건에서 `keys.weekItems(...)` 를 `keys.week(...)` 로 바꾸고, 유니온·`switch` 에 두 갈래를 더한다:

```ts
| { type: 'plan-confirmed'; payload: { week: string }; currentDayKey: string }
| { type: 'item-changed'; payload: { itemWeek: string }; currentDayKey: string }
```

```ts
case 'plan-confirmed':
  // 항목이 늘거나 폐기되면 그 주 카드와, 그 항목에서 pull 해둔 오늘 목록이 함께 변한다.
  // 확정 주가 오늘 주가 아니어도 오늘을 무효화한다 — 판정 비용이 재조회 비용보다 크다.
  return [keys.week(e.payload.week), keys.today(e.currentDayKey)]
case 'item-changed':
  // 완료·완료 해제·폐기·pull 이 모두 이 갈래다 — 바뀌는 캐시 집합이 같다.
  return [keys.week(e.payload.itemWeek), keys.today(e.currentDayKey)]
```

`events.test.ts:91` 의 기대값도 함께 고친다 — 이 파일은 무효화 **배선**(main 이벤트가 초크포인트를 실제로 태우는지)을 보는 쪽이라 키 정정에 함께 딸려온다:

```ts
// events.test.ts:91 — before: keys.weekItems('2026-08-03')
expect(invalidated).toContainEqual(keys.week('2026-08-03'))
```

> **설계 스펙 §7 의 채널 이름을 고쳤다.** 스펙은 `item-completed` 로 적었지만 완료·완료 해제·폐기·pull 이 **무효화하는 캐시 집합이 동일**하므로 갈래를 넷으로 쪼갤 이유가 없다. 이름을 `item-changed` 로 넓혔고, 이 계획서가 그 정정의 근거다. 스펙 문구를 소급 수정하지는 않는다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS, `pnpm lint` 통과 (초크포인트 밖 캐시 조작 0). `grep -rn "weekItems" src/` 가 **0건**이어야 한다 — 남아 있으면 죽은 팩토리를 지우지 못한 것이다

- [ ] **Step 5: 커밋** — `fix: point week invalidation at the key the card query uses`

---

### Task 6: 뽀모 도트 컴포넌트

**Files:**
- Create: `src/renderer/shared/ui/PomoDots.tsx`, `PomoDots.test.tsx`

> **renderer 테스트는 jsdom 을 명시적으로 켜야 한다.** `vitest.config.ts` 의 기본
> `environment` 는 `'node'` 다. 도크블록 없이 `render()` 를 부르면 `document is not
> defined` 로 즉사한다. `toBeInTheDocument` 같은 매처도 타입 import 가 있어야 한다.
> **Task 6·7·8·9 의 모든 렌더 테스트 파일 첫 두 줄은 아래와 같다** (`src/renderer/features/today/TodayList.test.tsx:1` 과 같은 관용구):
>
> ```tsx
> // @vitest-environment jsdom
> import type {} from '@testing-library/jest-dom/vitest'
> ```

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PomoDots } from './PomoDots'

describe('PomoDots', () => {
  it('default: 채움 = 소진, 미채움 = 남은 est', () => {
    render(<PomoDots spent={2} est={5} />)
    expect(screen.getAllByTestId('pomo-dot-filled')).toHaveLength(2)
    expect(screen.getAllByTestId('pomo-dot-empty')).toHaveLength(3)
    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  it('default: 초과분은 extra 도트 + +N 배지', () => {
    render(<PomoDots spent={7} est={5} />)
    expect(screen.getAllByTestId('pomo-dot-extra')).toHaveLength(2)
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryAllByTestId('pomo-dot-empty')).toHaveLength(0)
  })

  it('neutral(기타 행): 소진만 채우고 미채움·extra·+N 을 렌더하지 않는다 (§3.4)', () => {
    render(<PomoDots spent={3} est={0} variant="neutral" />)
    expect(screen.getAllByTestId('pomo-dot-filled')).toHaveLength(3)
    expect(screen.queryAllByTestId('pomo-dot-empty')).toHaveLength(0)
    expect(screen.queryAllByTestId('pomo-dot-extra')).toHaveLength(0)
    expect(screen.getByText('3')).toBeInTheDocument() // 소진 단독
    expect(screen.queryByText('3/0')).not.toBeInTheDocument()
  })

  it('이모지를 쓰지 않는다 (principles §6)', () => {
    const { container } = render(<PomoDots spent={7} est={5} />)
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  // principles §4 — 초과 글로우는 정적이다. 무한 펄스는 금지다.
  // 1·2판은 이 규칙을 산문으로만 적어 검증되지 않았다. 여기서 테스트로 못 박는다.
  it('초과 상태에 무한 애니메이션을 쓰지 않는다', () => {
    const { container } = render(<PomoDots spent={7} est={5} />)
    const animated = container.querySelectorAll('[class*="animate-"]')
    expect(animated).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 도트는 토큰 기반 커스텀(SVG/CSS), 초과 배지의 불꽃은 lucide `Flame` **컴포넌트**다. 채움 `--teal`, 미채움 `--ink-faint`, extra `--amber`. 숫자는 `--font-mono` + `tabular-nums`. 초과 글로우는 **정적**이다 — 무한 펄스 금지 (principles §4).

도트 자체에는 전이가 없다(개수가 바뀌면 즉시 다시 그린다). 모션이 붙는 것은 게이지 바뿐이며 그 `prefers-reduced-motion` 처리는 Task 7 이 소유한다 — 여기서 중복 구현하지 않는다.

`neutral` 변형이 존재하는 이유를 파일 주석에 남긴다: 기타 행은 est 가 0 이라 default 규칙을 그대로 적용하면 **모든 도트가 초과로 렌더된다** (§3.4).

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: add pomo dots with default and neutral variants`

---

### Task 7: 주간 카드 일반 뷰 — 행 · 게이지 · 기타 행 · 완료 제안 · 빈 상태

**Files:**
- Create: `src/renderer/features/week/{useWeek.ts,WeekCard.tsx,WeekItemRow.tsx,OtherRow.tsx,BudgetGauge.tsx}`
- Create: `src/renderer/shared/ui/useReducedMotion.ts` — 모션 판정 한 곳. Task 8 의 드로어도 이걸 쓴다
- Modify: `src/renderer/app/App.tsx`
- Modify: `src/shared/time/index.ts` — `weeksSince` · `weekRangeLabel` 신규. **두 함수 모두 아직 없다.** 이 파일이 내보내는 것은 `now, dayKey, weekKey, monthKey, localKeys, nowMs, instantFromMs, calendarKeys, startOfNextLocalDayMs` 뿐이다
- Modify: `src/renderer/app/App.test.tsx` — **누락하면 기존 테스트가 깨진다** (아래 Step 1 마지막 항목)
- Test: `WeekCard.test.tsx`, `BudgetGauge.test.tsx`, `WeekItemRow.test.tsx`, `src/shared/time/index.test.ts`(기존 갱신)

- [ ] **Step 1: 실패하는 테스트 작성** — 렌더 계약만 (도메인 로직은 main 테스트가 덮는다)

**렌더 테스트 4개 파일 전부 Task 6 의 jsdom 도크블록 2줄로 시작한다.**

**카드 골격** (§2) — 1·2판이 통째로 빠뜨린 부분이다
- eyebrow `WEEK`, 제목 `이번 주 할당`, 주 범위 `8/3 – 8/9` 가 렌더된다
- 주 범위는 `weekRangeLabel(weekKey)` 의 결과다. 구분자는 **en dash(`–`)**이고 앞뒤 공백이 있다
- 주 번호 라벨(`W32`)은 **렌더하지 않는다.** ux-spec §2 가 "표시할지 TBD" 로 열어둔 항목이고, 열어둔 것은 안 만드는 쪽이 기본이다 — 필요해지면 그때 스펙에서 닫는다
- **항목 목록만 스크롤한다.** 목록 영역에 `overflow-y: auto` 가 있고, 게이지는 그 **바깥**에 있다
- **게이지는 카드 하단에 고정된다** — 게이지 컨테이너에 `flex-shrink-0` 이 있다. 항목이 20개여도 게이지가 화면 밖으로 밀려나지 않는다. 이것이 §7 제목의 "카드 하단 고정"이며, 예산 대비 소진은 이 화면이 존재하는 이유다

**항목 행**
- 제목·도트·요일 핍 7개(월요일 시작)가 렌더된다
- 자식 조각이 0개면 `· 조각 0/0` 표기를 **숨긴다** (§3.1)
- 요일 핍: 배정됨은 `--teal` solid, 미배정은 `--ink-faint` 이면서 **지름이 다르다** — 색 클래스만 다르고 모양이 같은 구현은 실패해야 한다. 불투명도 클래스 0개 (principles §3.5)
- **요일 핍에 요일 식별 수단이 있다**: 각 핍의 `aria-label` 이 `월`…`일` 이고, 배정 여부가 `aria-pressed` 로 노출된다. 이건 "오늘이 무슨 요일인가"(범위에서 뺀 것)가 아니라 **인덱스→요일 이름 매핑**이다 — 순수 상수이므로 뺀 범위와 무관하며, 없으면 스크린 리더에 점 7개가 구분 없이 읽힌다
- **이월 배지**: `originWeek` 이 2주 전이면 `3주째` 가 렌더되고, 같은 주면 배지가 없다. 계산식은 `(week − originWeek)/7 + 1` 이며 **주 키 문자열 두 개의 차이로 구한다** — `originWeek` 과 `week` 둘 다 응답에 실려 오므로 renderer 날짜 계산이 아니다 (A14·A15 부분 검증)
- **완료 제안** (§3.3·§4): `childTotal > 0 && childDone === childTotal && completedAt === null` 이면 `할 일을 다 끝냈어요 — 이 할당도 완료할까요?` + `완료로 표시` 버튼. 거절 버튼은 없다
- 자식이 0개면 완료 제안이 뜨지 않는다 (§4)
- **완료 상태**: 제목 취소선, pull 버튼 자리에 `완료됨` 비활성 라벨, `완료 해제` 액션
- **완료 + 추가 소진**: `completedAt` 있고 `spent > est` 면 `+N` 을 **그대로 표시**하고 완료 제안은 **다시 뜨지 않는다** (R28·A37)
- **pull 버튼 라벨은 `+ 오늘로`** (§3.1). `오늘로 가져오기` 는 드로어 푸터의 문구이고 이 자리에 쓰지 않는다 — 하나는 원클릭, 하나는 선택 후 확정이다
- 모든 조작 요소가 `--target-min`(24px) 하한을 지킨다 (캐럿·pull 버튼). jsdom 은 레이아웃을 계산하지 않으므로 **토큰 클래스 존재로 검증**하고, 실제 픽셀은 Step 4 의 `pnpm dev` 수동 확인 몫이다

**게이지** (§7) — **세 상태다. `null` 과 `0` 을 한 갈래로 합치지 않는다** (ux-spec §7, 2026-08-10 결정)
- `budget === null` → 바 없음 + `<소진> / 미설정` + `예산을 정하면 예산 대비 소진이 보여요`
- `budget === 0` → 바 없음 + **소진 숫자만**. `/ 미설정` 도 보조 문구도 **렌더하지 않는다**
  - 테스트로 못 박는다: `expect(screen.queryByText(/예산을 정하면/)).not.toBeInTheDocument()` — 예산을 0 으로 **정한** 사용자에게 "정하면"이라고 말하면 거짓이다
  - 두 상태 공통: `소진 / 0` 도 `0 / 0` 도 렌더하지 않고 나눗셈을 하지 않는다 (A27)
- 예산 있음·여유 → `<소진> / <예산>` + `--teal` 바 + `예산은 추정치예요 — 넘어가도 괜찮아요`
- 예산 20·소진 23 → `+3` 배지, 문구는 같음, **`--danger` 클래스 0개 · lucide `AlertTriangle` 0개**
- **`prefers-reduced-motion: reduce` 에서 바에 전이가 없다** — 산문이 아니라 테스트다:

```tsx
// BudgetGauge.test.tsx
it('reduced-motion 에서 바 전이를 끈다 (principles §4)', () => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {}
  })) as unknown as typeof window.matchMedia

  const { container } = render(<BudgetGauge budget={20} spent={5} />)
  expect(container.querySelector('[data-motion="reduced"]')).not.toBeNull()
})
```

**기타 행** (§3.4)
- `otherRow.visible` 이 true 면 목록 **맨 아래**에 `기타 — 계획에 없던 집중` 이 `neutral` 도트로 렌더된다
- est·요일 핍·이월 배지·pull 버튼이 **없다**
- 점선 테두리(`--glass-border-soft`)를 쓰되 `--ink-faint` 로 낮추지 않는다 — 실제로 한 집중이다

**빈 상태** (§8)
- 항목 0 · 세션 0 → `이번 주 할당을 잡으면 뽀모 예산이 여기 보여요` + `+ 이번 주 할당 잡기`
- 항목 0 · 기타 행 있음 → 기타 행 + 그 아래 `계획이 없어도 기록은 남아요`
- 활성 항목 0 · 전부 완료 → `이번 주 할당을 다 끝냈어요` + CTA `수정`

**`weeksSince` · `weekRangeLabel` 단위 테스트** (`src/shared/time/index.test.ts` 에 추가)

```ts
describe('weeksSince (week-plan R11)', () => {
  it('같은 주면 1 주째다 — 0 이 아니다', () => {
    expect(weeksSince('2026-08-03', '2026-08-03')).toBe(1)
  })

  it('2주 전에 생긴 항목은 3주째다', () => {
    expect(weeksSince('2026-07-20', '2026-08-03')).toBe(3)
  })

  it('월 경계를 넘어도 주 수로 센다', () => {
    expect(weeksSince('2026-07-27', '2026-08-03')).toBe(2)
  })
})

describe('weekRangeLabel (ux-spec §2)', () => {
  it('월요일 키를 그 주 월~일 범위로 그린다', () => {
    expect(weekRangeLabel('2026-08-03')).toBe('8/3 – 8/9')
  })

  it('월 경계를 넘는 주도 양쪽 월을 적는다', () => {
    expect(weekRangeLabel('2026-08-31')).toBe('8/31 – 9/6')
  })
})
```

**`App.test.tsx` 회귀** — 이 항목을 빠뜨리면 **기존에 통과하던 테스트가 깨진다**

`App.tsx` 에 주간 카드가 들어가면 `useWeek` 의 `useMutation({ mutationFn: api.week.pullNext })` 가 **렌더 도중 프로퍼티를 읽는다.** `src/renderer/shared/api.ts` 의 `api` 는 접근 시점에 `Reflect.get(window.api, prop)` 하는 Proxy 이고, `App.test.tsx:29` 의 목에는 `clock`·`today`·`timer` 만 있고 **`week` 가 없다.** 결과는 `Cannot read properties of undefined` 이며, `queryFn` 과 달리 React Query 가 삼켜주지 않는다.

```ts
// App.test.tsx 의 window.api 목에 추가 — 9종 전부 필요하다 (일부만 넣으면 같은 방식으로 죽는다)
week: {
  summary: vi.fn().mockResolvedValue({
    week: '2026-08-03',
    budget: null,
    totalSpent: 0,
    items: [],
    otherRow: { visible: false, spentPomos: 0 }
  }),
  planDraft: vi.fn(),
  confirmPlan: vi.fn(),
  drawer: vi.fn(),
  pullNext: vi.fn(),
  pullFromDrawer: vi.fn(),
  complete: vi.fn(),
  uncomplete: vi.fn(),
  drop: vi.fn()
}
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현**

```ts
// useWeek.ts
export function useWeek() {
  const { weekKey, dayKey } = useClock()
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: keys.week(weekKey),
    queryFn: () => api.week.summary(weekKey)
  })
  const invalidateItem = (r: { itemWeek: string }) =>
    dispatchInvalidation(qc, {
      type: 'item-changed',
      payload: { itemWeek: r.itemWeek },
      currentDayKey: dayKey
    })
  const pullNext = useMutation({ mutationFn: api.week.pullNext, onSuccess: invalidateItem })
  const complete = useMutation({ mutationFn: api.week.complete, onSuccess: invalidateItem })
  const uncomplete = useMutation({ mutationFn: api.week.uncomplete, onSuccess: invalidateItem })
  const drop = useMutation({ mutationFn: api.week.drop, onSuccess: invalidateItem })
  return { weekKey, dayKey, query, pullNext, complete, uncomplete, drop }
}
```

**`src/shared/time/index.ts` 에 순수 함수 2종을 더한다.** 둘 다 **달력 키를 받아 달력 키 산술만** 한다 — 파일 상단 주석이 금지하는 "저장된 순간(UTC)을 파싱해 달력 키를 **재파생**"하는 것이 아니다. 이미 고정된 키끼리의 계산이므로 규칙 안이다. renderer 가 아니라 shared 이므로 시간 초크포인트(ADR-009 §3)도 지킨다.

```ts
/** 달력 키 → epoch day. DST 를 타지 않도록 UTC 로만 센다 (로컬 자정 산술은 전환일에 ±1시간 어긋난다). */
function dayNumber(calendarKey: string): number {
  const [y, m, d] = calendarKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/**
 * 이월 배지 `N주째` (week-plan R11). 두 주 키의 차이 ÷ 7 + 1.
 * 항목이 만들어진 주가 곧 1주째다 — 0 주째는 없다. 이월 **사슬 길이로 세지 않는다**
 * (중간에 한 주를 건너뛰어도 경과한 주 수가 답이다).
 */
export function weeksSince(originWeek: string, week: string): number {
  return Math.floor((dayNumber(week) - dayNumber(originWeek)) / 7) + 1
}

/** 카드 헤더의 주 범위 `8/3 – 8/9` (ux-spec §2). 구분자는 en dash 이고 앞뒤에 공백이 있다. */
export function weekRangeLabel(week: string): string {
  const startMs = dayNumber(week) * 86_400_000
  const label = (ms: number): string => {
    const d = new Date(ms)
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
  }
  return `${label(startMs)} – ${label(startMs + 6 * 86_400_000)}`
}
```

**카드 골격** (§2) — 게이지가 스크롤로 밀려나지 않게 만드는 것이 핵심이다:

```tsx
// WeekCard.tsx — 세로 3단. 가운데만 늘어나고 스크롤한다.
<section className="flex h-full flex-col">
  <header className="flex-shrink-0">
    <p>WEEK</p>
    <h2>이번 주 할당</h2>
    <p>{weekRangeLabel(weekKey)}</p>
  </header>

  <div className="min-h-0 flex-1 overflow-y-auto">{/* 항목 행 + 기타 행 */}</div>

  {/* 게이지는 목록 바깥이다. flex-shrink-0 이 없으면 항목이 쌓일 때 밀려 나간다 */}
  <div className="flex-shrink-0">
    <BudgetGauge budget={budget} spent={totalSpent} />
  </div>
</section>
```

`min-h-0` 이 빠지면 flex 자식의 기본 `min-height: auto` 때문에 목록이 줄지 않고 **카드 전체가 늘어나 게이지가 뷰포트 밖으로 나간다.** 예산 대비 소진은 이 화면이 존재하는 이유이므로 항상 보여야 한다.

`App.tsx` 에 주간 카드를 더한다. **`ClockGate` 안쪽이다** — M2 의 콜드 스타트 크래시(`7e0d472`)가 같은 자리에서 났다. 반응형은 만들지 않는다.

모션: 게이지 바 변화는 `prefers-reduced-motion: reduce` 시 전이 없이 즉시 반영한다 (§9). 판정은 `src/renderer/shared/ui/useReducedMotion.ts` 한 곳에서만 하고(`matchMedia('(prefers-reduced-motion: reduce)')`), 컨테이너에 `data-motion="reduced"` 를 달아 그 속성으로 전이 클래스를 끈다 — 위 테스트가 이 속성을 본다. **Task 8 의 드로어 전이도 같은 훅을 쓴다** (판정을 두 번 만들지 않는다). 전역 `transition: none !important` 킬은 **폐기된 패턴**이므로 쓰지 않는다 (principles §4).

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS. `pnpm dev`: 콘솔로 항목을 만들고 카드에 행이 보이는지, **타이머로 1뽀모를 태우면 도트와 게이지가 함께 오르는지** 확인 (Task 5 의 키 정정이 실제로 동작하는지 여기서 드러난다).

- [ ] **Step 5: 커밋** — `feat: add week card normal view with gauge, other row and completion`

---

### Task 8: 항목 드로어

**Files:**
- Create: `src/renderer/features/week/{ItemDrawer.tsx,useDrawer.ts}`
- Create: `src/renderer/shared/ui/Toast.tsx` — **토스트가 코드베이스에 없다.** `src/renderer/shared/ui/` 에는 `button.tsx` 하나뿐이다. 이 계획서가 요구하는 pull 토스트의 구현처를 여기로 못 박는다. shadcn sonner 를 새로 들이지 않는다 — 필요한 것은 한 줄 알림 하나다
- Modify: `WeekItemRow.tsx`
- Test: `ItemDrawer.test.tsx`, `src/renderer/shared/ui/Toast.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성** — 파일 첫 두 줄은 Task 6 의 jsdom 도크블록이다

**토스트** (`Toast.test.tsx`)
- `role="status"` 이고 `aria-live="polite"` 다 — pull 은 사용자가 방금 누른 결과이므로 `assertive` 가 아니다
- 메시지가 렌더되고, `--layer-toast` 레이어에 놓인다
- 자동으로 사라진다 (타이머는 `vi.useFakeTimers()` 로 검증)

**드로어** (`ItemDrawer.test.tsx`)
- 캐럿 클릭으로 인라인 펼침. **모달이 아니다** — `role="dialog"` 를 쓰지 않는다. 동시에 하나만 열린다
- 캐럿에 `aria-expanded` 와 `aria-controls` 가 있고 열림/닫힘에 따라 값이 바뀐다
- 조각 0개: 목록 영역 없이 `오늘 할 몫을 쪼개서 적어요 — 이게 첫 조각이 돼요` 만
- 조각 ≥ 1: 라벨 `이 할당의 조각 — 오늘 할 것을 고르세요`, 새 입력 라벨 `또는 새 조각 추가`
- **푸터 버튼 2개** (§6.2): `닫기` · `오늘로 가져오기`(primary). `닫기` 는 선택 상태를 폐기하고 드로어를 닫는다 (§6.3)
- `inToday` 인 조각은 상태 라벨 `오늘 목록에` + 선택 불가, 완료된 조각은 상태 라벨 `완료` + 취소선 + 선택 불가
- 항목 완료 상태: `오늘로 가져오기` 비활성 + `완료된 할당이에요 — 해제하면 다시 가져올 수 있어요`
- 항목 완료 + 소진 > est: 도트에 `+N` 을 그대로 표시하고 `초과했어요` 류 문구를 붙이지 않는다 (§6.4)
- 항목 액션 `완료로 표시` / `완료 해제` / `보내주기` 세 개가 있다 (§6.1)
- `보내주기`: 확인 1회 `이 할당을 보내줄까요? 지금까지 한 집중과 조각은 남아요.` · `--danger` 는 **hover 에만** · 문구는 `버리기` 가 아니다
- 원클릭 pull 이 `pulled === null` 로 오면 드로어가 열린다 (§3.1 폴백)
- pull 성공 시 토스트 `오늘로 가져왔어요 — <조각 제목>`
- 드로어가 닫힐 때 포커스가 캐럿으로 돌아온다 (PRODUCT.md 접근성 §4)
- **모든 조작 요소가 `--target-min`(24px) 하한을 지킨다** — 조각 선택 행·푸터 2버튼·항목 액션 3개. jsdom 은 레이아웃을 계산하지 않으므로 실측 대신 **토큰 클래스 존재로 검증**한다 (`min-h-[--target-min]` 이 붙어 있는지). 실제 픽셀은 Step 4 의 `pnpm dev` 수동 확인 몫이다

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 기타 행의 캐럿은 M3a 에서 **렌더하지 않는다** (드릴다운을 뺐다).

드로어 펼침/접힘 전이는 §9 가 허용하지만 `prefers-reduced-motion: reduce` 에서는 전이 없이 즉시 반영한다. Task 7 의 게이지와 **같은 방식**을 쓴다 — 미디어 쿼리를 읽어 `data-motion="reduced"` 를 달고 그 속성으로 전이를 끈다. 판정 로직을 두 번 쓰지 않도록 Task 7 에서 만든 훅을 재사용한다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS. `pnpm dev`: 조각 0개 항목의 `+ 오늘로` → 드로어 열림 → 새 조각 적고 `오늘로 가져오기` → 오늘 목록에 등장.

- [ ] **Step 5: 커밋** — `feat: add inline item drawer with first-piece creation flow`

---

### Task 9: 플래너 모드 (이번 주 전용)

**Files:**
- Create: `src/renderer/features/week/{Planner.tsx,usePlanner.ts}`
- Modify: `WeekCard.tsx`
- Test: `Planner.test.tsx`

**편집 대상 주 토글이 없다.** 항상 오늘이 속한 주를 편집한다 — `다음 주` 는 이번 마일스톤에서 뺐다. 헤더·확정 버튼 라벨은 `이번 주 계획` · `이번 주 시작` 으로 고정한다. 빈 상태 CTA 도 `+ 이번 주 할당 잡기` 고정이다.

- [ ] **Step 1: 실패하는 테스트 작성** — 파일 첫 두 줄은 Task 6 의 jsdom 도크블록이다
- ① 예산: `prefill === null` 이면 입력이 **비어 있고** `예산을 정하면 과적을 알려줘요` 가 뜬다. 라벨은 `이번 주 예산 (추정치)`
- ② 항목: est 스테퍼 라벨은 `예상 뽀모`, **하한 1** — 1에서 감소를 눌러도 0이 되지 않는다 (A6). 제목 최대 40자
- ② 초안 행 표기는 `[M2] 제목  월수금  (뽀모 3)  [×]` — est 는 행에서 `(뽀모 3)` 형태로 읽힌다 (§5.3)
- ④ 계획 합계 바: `계획 합계 <합> / 예산 <예산>` + 진행 바 (§5.5). 게이지(§7)는 플래너에서 숨겨지고 **이것이 그 자리를 대신한다**
- ② `항목 추가` 후 **제목 입력 포커스가 유지**되고 요일 선택이 초기화된다 (§5.3)
- ③ 요일 칩 7개가 **월요일부터** 배열되고, 라벨은 `언제 (선택)`. 미선택 초안 행에는 `미배치` 라고 적는다
- ③ 요일 칩 토글 시 **제목 입력 포커스를 잃지 않는다** (§5.4)
- ④ 과적: est 합 > 예산이면 `+N 과적이에요. 예상 뽀모를 줄일까요, 항목을 덜어낼까요?` 가 뜨고, **`--danger`·경고 아이콘 0개**이며 확정 버튼이 **활성**이다 (A29)
- ④ 과적 안내에 `다음 주` 라는 단어가 등장하지 않는다 (R22 — 이 화면에 없는 액션 금지)
- `×` 의 두 의미 (§5.3.1): 신규 초안 행은 확인 없이 사라진다. **기존 항목 행은 제거되지 않고 `보내줄 예정` 취소선 + 되돌리기 링크로 바뀌며**, 확인 1회 `이 할당을 보내줄까요? 지금까지 한 집중과 조각은 남아요.` 를 거친다
- 되돌리기를 누르면 초안 행이 원래대로 복구된다
- `취소` 는 확인 없이 초안 전체를 폐기한다 (`보내줄 예정` 표시도 함께)
- 확정 후 일반 뷰로 복귀한다
- **확정·취소로 일반 뷰에 돌아가면 포커스가 플래너를 열었던 버튼으로 귀속된다** (PRODUCT.md 접근성 §4). 플래너가 사라지면서 포커스가 `<body>` 로 떨어지면 키보드 사용자는 위치를 잃는다. 진입 경로가 둘(빈 상태 CTA · `수정`)이므로 **열 때 누른 요소를 기억**했다가 그쪽으로 돌려준다
- 모든 조작 요소가 `--target-min`(24px) 하한을 지킨다 (요일 칩 7개·est 스테퍼 ±·초안 행 `×`). Task 8 과 같은 이유로 jsdom 에서는 **토큰 클래스 존재**로 검증하고 실제 픽셀은 Step 4 수동 확인이다

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 4단계(예산·항목·요일·경고)를 한 화면에 위에서 아래로 쌓는다. 마법사·단계 전환 없음. 확정은 `api.week.confirmPlan` 한 번이다.

`dispatchInvalidation` 은 **인자 2개**다 — `QueryClient` 를 첫 인자로 받고, 이벤트에 `currentDayKey` 가 필수다 (Task 5 의 유니온 정의). 둘 중 하나라도 빠지면 타입 에러다:

```ts
const qc = useQueryClient()
const { weekKey, dayKey } = useClock()

const confirm = useMutation({
  mutationFn: api.week.confirmPlan,
  onSuccess: () =>
    dispatchInvalidation(qc, {
      type: 'plan-confirmed',
      payload: { week: weekKey },
      currentDayKey: dayKey
    })
})
```

  요일 부하 그래프는 만들지 않는다 (범위 축소). 총량 과적 바만 그린다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS. `pnpm dev` 전 구간 수동 검증: 플래너 → 항목 2개 → 확정 → 일반 뷰에 등장 → `+ 오늘로` → 타이머 → 도트 상승.

- [ ] **Step 5: 커밋** — `feat: add planner mode with non-blocking overload warning`

---

### Task 10: 문서 갱신 + 마무리 검증

**Files:**
- Modify: `docs/features/week-plan/prd.md`(R9 가정 블록), `PRODUCT.md`, `README.md`

> **`budget = 0` 은 여기서 정하지 않는다 — 이미 닫혔다.** ux-spec §7 의 TBD 와 PRD R20 의
> `⚠️ 가정` 블록은 이 계획서와 **같은 PR** 에서 결정으로 교체됐다(2026-08-10): 바를 숨기고
> **보조 문구 없이 소진 숫자만**. 계획서가 화면 결정을 만들면 안 되기 때문에 스펙 쪽에
> 적었고(docs/CLAUDE.md), Task 7 의 게이지 계약은 그 결정을 **인용**할 뿐이다.
> 착수 시점에 두 문서에 TBD·가정 블록이 남아 있다면 병합 사고이므로 멈추고 확인한다.

- [ ] **Step 1: R9 미결 종결 반영** — `week-plan/prd.md` R9 의 `> ⚠️ 가정:` 블록을 결정으로 교체한다. 드로어에서 "항목 est vs 자식 조각 est 합" 어긋남을 **표시하지 않는다.** 이유(두 값이 독립이라는 R9 자신의 정의 + 원칙 6)를 남기고 설계 스펙 §6 을 근거로 인용한다. **가정 블록을 조용히 지우지 않는다** — 결정으로 바뀌었음을 본문에 적는다.

- [ ] **Step 2: 전체 검증 일괄 실행** — `pnpm test && pnpm lint && pnpm typecheck && pnpm format:check && pnpm build` 전부 0 에러.

- [ ] **Step 3: 코어 루프 수동 검증 체크리스트**
  - 계획 0개 상태에서 타이머·오늘 목록이 여전히 전부 동작한다 (원칙 1)
  - 플래너 확정 → 일반 뷰 → `+ 오늘로` → 재생 → 완료 → **항목 도트와 주간 게이지가 함께** 오른다
  - 조각 0개 항목의 `+ 오늘로` 가 드로어를 연다
  - 자식 조각을 전부 완료하면 완료 제안이 뜨고, `완료로 표시` 를 눌러야 완료된다. 무시하면 active 로 남는다
  - 완료 후 그 조각으로 세션을 더 태우면 소진과 `+N` 은 오르되 완료 제안이 다시 뜨지 않는다
  - 항목을 초안에서 `×` 하고 확정 → 목록에서 사라지되 주간 총 소진은 그대로, **그 소진이 기타 행에 나타난다**
  - 예산 20 · 소진 23 상태에서 빨간색·경고 아이콘이 없다
  - 예산을 **비운 채** 확정하면 게이지가 `<소진> / 미설정` + `예산을 정하면 …` 이고 `소진 / 0` 이 아니다
  - 예산을 **0 으로** 확정하면 소진 숫자만 보이고 `/ 미설정` 도 `예산을 정하면 …` 도 **없다** (ux-spec §7 · A27)
  - 항목을 20개 만들어도 게이지가 카드 하단에 남아 있다 — 목록만 스크롤한다 (§2)

- [ ] **Step 4: 문서 갱신** — PRODUCT.md·README 의 구현 현황을 M3a 상태로 갱신하고, README 계획 표에 이 계획서 행을 추가한다. 마일스톤 지도를 `M3a 완료 → M3b 정산(다음)` 으로 옮긴다. **이번에 뺀 것들(요일 정보·부하 그래프·드릴다운)이 M3b 에서 살아난다는 사실을 함께 적는다.**

- [ ] **Step 5: 커밋** — `docs: close the r9 open question and update status after m3a`

---

## M3b 로 넘기는 메모

정산 계획서를 쓸 때 반드시 확인할 것.

1. **`confirmPlan` 을 이월에 재사용하지 말 것.** 신규 항목에 `originWeek: week` 를 무조건 박는다. R11 은 이월 항목이 원본의 `origin_week` 를 **승계**하라고 요구하므로, 재사용하면 배지가 영원히 `1주째` 로 리셋된다. R35 의 미완료 조각 재부모화도 이 메서드에 없다. 이월은 별도 생성 경로가 필요하다.
2. **`weeks.ensure` 는 길이 3종만 박제한다.** weekly-review R37 은 capacity·예산까지 함께 요구한다. M3a 는 capacity 가 항상 NULL 이라 무해하지만, 정산이 capacity 편집 진입점을 들이는 순간(pomo-baseline R25) **플래너로 만든 주만 capacity 스냅샷이 비는 비대칭**이 생긴다.
3. **선언형 확정의 동시성 약점.** 플래너를 열어둔 채 다른 경로로 항목이 생기면 확정 시 "목록에 없음 = 폐기"로 판정된다. M3a 는 항목 생성 경로가 플래너뿐이라 발생하지 않는다. 정산은 같은 문제를 **예외만 담고 서버가 재조회**하는 방식으로 닫았다(R29). M3b 에서 이 충돌이 실제로 나면 플래너도 그 방식으로 옮긴다.
4. **`remainingPomos`(week-plan.ts)를 쓸 것.** 남은 몫 클램프는 M3a 가 만들어 뒀다. 정산이 자기 클램프를 다시 만들면 두 곳이 갈린다.
5. **이번에 뺀 것들이 M3b 와 함께 살아난다** — 요일 정보(`clock.now` 응답 확장), 요일별 부하 그래프(capacity 편집 진입점이 생기면), 플래너의 `다음 주` 세그먼트.

---

## 자기 점검 (스펙·리뷰 대조)

**스펙 대조**

| 스펙 절 | 반영 위치 |
|---|---|
| §3 가용량 미설정 4경로 | Task 1(프리필 null) · Task 7(게이지 `미설정`) · Task 9(예산 힌트). 부하 그래프는 범위에서 뺐다 |
| §4.1 술어 한 곳 | Task 2 Step 5 의 `listForWeek` 안. 세션을 세는 다른 곳은 `weekTotalSpent`·`childTasks` 이며 **주 조건이 붙는 것은 앞의 둘뿐**이다(`childTasks` 는 의도적으로 뺀다 — 다른 질문에 답한다) |
| §4.2 차액 | Task 2 의 `otherRowSpent` + Task 4 의 `weekSummary`. 정의역은 ADR-027 인용 |
| §4.3 포트 목록 | Task 1·2·3. `complete`/`uncomplete` 로 나눠 CRUD 금지 규칙 준수 |
| §5 선언형 확정 | Task 2 |
| §6 R9 종결 | Task 10 Step 1 |
| §7 무효화 | Task 5 — **스펙 §7 의 "저절로 동작한다"는 틀렸다.** 키 방향이 반대라 연결되지 않았고 이 계획서가 정정한다 |
| §8 ClockGate | Task 7 Step 3 |
| §10 함정 7개 | Task 1(planned_at) · 2(local_week·ID 매칭·폐기≠삭제) · 6(neutral 도트) · 7(ClockGate·이월 배지 계산식) |
| §11 테스트 전략 | Task 2·3·4 의 계약/서비스 테스트 + 순수 함수(`remainingPomos`·`otherRowSpent`, Task 2) + `weeksSince`·`weekRangeLabel`(Task 7) |

**스펙 문구를 두 군데 정정했다** (스펙 본문은 소급 수정하지 않는다):

| 스펙 | 정정 | 근거 |
|---|---|---|
| §7 "M3a 가 주간 쿼리를 붙이면 저절로 동작한다" | **틀렸다.** 키 방향이 반대라 연결되지 않는다 | Task 5 |
| §7 채널명 `item-completed` | `item-changed` 로 넓혔다 — 완료·해제·폐기·pull 이 무효화하는 캐시 집합이 같다 | Task 5 |

---

**1판 리뷰 처리** — 리뷰어가 잡은 **15건** + 검증 중 내가 추가로 잡은 **6건**

(2판은 이 표를 "15건"이라 부르면서 21행을 나열했다. 구분해 적는다.)

*리뷰어 지적 15건*

| 결함 | 처리 | 2판 리뷰 재검증 |
|---|---|---|
| `withTestUow` 부재 | Task 2 Step 1 에서 `testUow`·`ensureWeeks` 를 실제로 만든다 (시딩 포함) | 해결 (실행 확인) |
| Task 2↔3 의존 역전 | 하나로 합쳤다 | 해결 |
| FK 위반 테스트 2건 | `ensureWeeks(uow, WEEK, NEXT)` 를 세션 테스트에 넣었다 | 해결 (실행 확인) |
| settings 시딩 누락 | `testUow` 가 `seedSettings` 를 부른다 | 해결 (실행 확인) |
| `week:drawer` 유스케이스 부재 | Task 3 의 `itemDrawer` + 포트 `header` | 해결 · **3판에서 테스트 추가** |
| 다음 주 키 경로 부재 | 범위에서 뺐다 (사용자 결정) | 해결 |
| 무효화 키 방향 오류 | Task 5 | 해결 · **3판에서 `events.test.ts` 추가** |
| 기타 행 표시 조건 불완전 | ADR-027 §3 + Task 4 의 세 번째 갈래 + 전용 테스트 2건 | 해결 |
| 완료 제안·확정 전면 누락 | Task 3(서비스) · 7(제안·행 상태) · 8(드로어 액션) | 해결 |
| 이월 배지 계산식 거처 미정 | Task 7 | **2판은 시그니처만 적었다** — 3판이 구현·테스트·Files 를 채웠다 |
| `budget = 0` 분기 | Task 7 게이지 계약 | **2판은 `null` 과 합쳐 거짓말을 했다** — 3판이 3상태로 분리(ux-spec §7 결정) |
| 남은 몫 클램프 부재 | Task 2 의 `remainingPomos` | 해결 |
| 문구 13개 | Task 7·8·9 의 렌더 계약에 원문으로 | **2판은 8개를 더 빠뜨렸다** — 3판이 §2 카드 골격 3개 + 드로어 `닫기` + 플래너 4개를 추가 |
| 접근성 5건 | 아래 별도 표 | **부분** — 3판에서 마저 채웠다 |
| CRUD 포트 | `complete`/`uncomplete` 분리 | 해결 |

*내가 추가로 잡은 6건*

| 결함 | 처리 |
|---|---|
| 계획서가 결정을 만듦 (Σ 정의역) | ADR-027 로 옮기고 계획서는 인용만 한다 |
| 채널 수 불일치 | 9종으로 통일 (드릴다운을 뺐으므로 Task 4 에서 끝난다) |
| `nextPullable` 의 removed_at 분기 미검증 | Task 3 Step 1 에 focus 세션을 먼저 넣어 `'marked'` 경로를 강제한다 |
| `sum()` NULL 타입 거짓말 | `sql<number \| null>` 로 선언하고 폴백을 둔다 (Task 2) |
| `baseline.test.ts` basename 충돌 | `budget.test.ts` 로 |
| 테스트 import 누락 | 모든 스니펫에 import 를 넣었다 |

**접근성 — 항목별 실제 위치** (2판은 이 줄에서 없는 것을 있다고 적었다)

| 항목 | 위치 | 2판 상태 |
|---|---|---|
| 요일 핍 2채널(색+지름) | Task 7 Step 1 | 있었음 |
| 요일 핍 요일 식별(`aria-label` `월`…`일`) | Task 7 Step 1 | **없었음** — 3판 추가 |
| `--target-min` | Task 7·8·9 Step 1 | Task 8 에 없었음 — 3판 추가. jsdom 검증 한계도 명시 |
| `aria-expanded`·`aria-controls` | Task 8 Step 1 | 있었음 |
| 드로어 닫힘 시 포커스 귀속 | Task 8 Step 1 | 있었음 |
| 플래너 확정·취소 후 포커스 귀속 | Task 9 Step 1 | **없었음** — 3판 추가 |
| 플래너 입력 포커스 유지 | Task 9 Step 1 | 있었음 |
| `prefers-reduced-motion` | **Task 7 게이지 테스트 · Task 8 드로어** | **2판은 "Task 6·7" 이라 적었으나 Task 6 엔 아무것도 없었고 Task 7 도 산문뿐이었다** — 3판이 게이지에 실테스트를 넣고, Task 6 은 "도트엔 전이가 없다"로 정정 |
| 토스트 `role="status"` | Task 8 Step 1 | **없었음** (토스트 구현처 자체가 없었다) — 3판 추가 |

---

**2판 리뷰가 잡은 것의 처리**

*실행을 막던 것 7건 — 전부 3판에서 닫았다*

| 결함 | 처리 |
|---|---|
| `App.test.tsx` 목에 `week` 없음 → 기존 테스트 붕괴 | Task 7 Files + 9종 목 블록 |
| `events.test.ts:91` 이 삭제될 팩토리를 직접 호출 | Task 5 Files + 기대값 교체 + `grep` 확인 |
| 렌더 테스트에 jsdom 도크블록 없음 | 파일 구조 절 + Task 6·7·8·9 에 2줄 명시 |
| `session-recorded` payload 를 주석으로 생략 | 6필드 전부 채움 |
| `weeksSince` 구현처·테스트 없음 | `shared/time` 구현 + 경계 테스트 3개 + `weekRangeLabel` 동반 |
| 미사용 import 3건 (`no-unused-vars` = error) | Task 2 import 축소 + Task 3·4 는 **테스트를 추가해** 사용처를 만듦 |
| Task 9 `dispatchInvalidation` 인자 누락 | `qc` + `currentDayKey` 를 갖춘 호출 코드로 교체 |

*무테스트 산출물 4건 — 3판에서 전부 테스트 추가*

`itemDrawer`(폐기 항목 열림·부재 시 throw) · `pullNextFromItem`(순차 pull·`null` 폴백·완료 가드) · `dropItem`(A24 항등식) · `planDraft`(활성만·프리필 null·budget 분리)

*UX 3건*

| 결함 | 처리 |
|---|---|
| §2 카드 골격 전면 누락 — **게이지가 스크롤로 밀려남** | Task 7 Step 1·3 에 3단 레이아웃(`min-h-0`·`overflow-y-auto`·`flex-shrink-0`) + 수동 검증 항목 |
| `budget = 0` 이 거짓을 말하고 ux-spec TBD 를 조용히 닫음 | **ux-spec §7 · PRD R20 을 같은 PR 에서 결정으로 교체**하고 계획서는 인용만 |
| 정렬 테스트가 정렬을 보지 않음 (최종 배열 1개) | 2개 시점의 순서를 먼저 검증한 뒤 재확정 |

---

**여전히 남는 한계 — 착수자가 알고 시작해야 한다**

1. **`--target-min` 은 jsdom 에서 실측되지 않는다.** 토큰 클래스 존재만 본다. 실제 24px 보장은 Task 7·8·9 Step 4 의 `pnpm dev` 수동 확인에 의존한다.
2. **대비비(4.5:1 / 3:1)를 자동 검증하지 않는다.** 토큰 조합은 design-system 이 보증한 것을 쓰되, 새 조합(기타 행 점선 + `--ink-dim` 등)은 눈으로 확인한다.
3. **A22 의 뒷부분·A3·A5·A7·A8·A29 마지막 절은 이 마일스톤에서 검증 불가**다 (위 표).
4. **렌더 테스트는 계약만 본다.** "보기 좋은가"는 테스트가 답하지 않는다 — 각 Task Step 4 의 `pnpm dev` 확인이 그 자리다.
