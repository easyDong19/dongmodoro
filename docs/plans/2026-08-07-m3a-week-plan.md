# M3a 주간 계획 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

**Goal:** 주간 항목을 만들고, 거기서 조각을 오늘로 가져오고, 그 조각으로 집중한 결과가 주간 카드 숫자로 되돌아오는 한 줄기를 화면에서 끝까지 통과시킨다. 정산·마일스톤·가용량 편집·반응형 셸은 만들지 않는다.

**Architecture:** 승인된 스펙 [docs/superpowers/specs/2026-08-07-m3a-week-plan-design.md](../superpowers/specs/2026-08-07-m3a-week-plan-design.md) 의 실행분이다. 소진 집계 술어를 리포지토리 SQL 한 곳에 가두고, 기타 행을 차액으로 정의하며, 플래너 확정을 선언형 전체 초안 한 트랜잭션으로 처리한다. 스키마는 M1 이 ADR-011 대로 이미 세웠으므로 **마이그레이션이 없다.**

**Tech Stack:** M2 스택 그대로 (Electron + electron-vite + React 19 + TS strict, better-sqlite3 + drizzle, zod 4, TanStack Query 5, Tailwind 4 + shadcn/ui, Vitest, uuid v7). 추가 의존성 없음.

## Global Constraints

M1·M2 계획의 Global Constraints 가 전부 그대로 적용된다 (pnpm 전용, BrowserWindow 보안 플래그, `handleIpc` 로만 IPC 등록, Drizzle import 는 `src/main/db/` 만, `src/shared/` 순수 TS, 시간은 `src/shared/time/` 초크포인트, 주 시작 월요일, UI 이모지 금지·토큰만, 커밋 영어 Conventional Commits, husky 훅 우회 금지). 여기에 이번 마일스톤의 것:

- **ADR-025**: 쿼리 키는 `keys.ts` 팩토리로만. 캐시 조작은 초크포인트 밖에서 금지 (ESLint 강제 중). 키 속 달력 키는 `useClock()` 또는 응답/payload 저장값만 — renderer 재계산 금지.
- **ADR-015**: 유스케이스 하나 = `uow.run` 하나. 포트는 **유스케이스 단위**로 정의한다 — `findAll`/`update(id, patch)` 류 CRUD 포트 금지 ([ports.ts](../../src/main/services/ports.ts) 파일 상단 주석).
- **작업 브랜치는 `feature/m3a-week-plan` 하나**이며 태스크마다 커밋한다.
- 유효 베이스라인·유효 예산의 결정 순서는 `src/main/services/baseline.ts` 한 곳에만 존재한다 (pomo-baseline R13).
- **`weekly_capacity` 는 미설정(NULL)이다.** 시딩하지 않는다 (pomo-baseline R8·R15). 그 결과의 화면 동작은 스펙 §3 표를 따른다.
- **`milestone_id` 는 항상 NULL.** 연결 칩·`M<n>` 배지를 만들지 않는다.
- **과적 표시에 `--danger`·경고 아이콘·단정 문구 금지.** `--amber` + `+N` 배지 + 질문형까지만 (week-plan R21, principles §1·§2).

**계획 밖:** 정산 전체(M3b), 마일스톤 기능, 가용량·뽀모 길이 편집 UI, 반응형 3단계·프레임리스 타이틀바·트레이(app-shell), 주 네비게이션, 항목 우선순위 정렬, 미래 날짜 pull.

---

## 차액 공식의 정의역 — 착수 전에 읽을 것

week-plan R17 의 본문은 Σ 의 정의역을 "그 주의 `is_system = 0` 인 항목 전체"라고 쓴다. **여기서 폐기(`dropped_at` 있음) 항목이 포함되는지가 본문만으로는 애매하다.** 인수 기준 A24 로 역산해 확정한다.

> A24: 3뽀모를 소진한 항목을 폐기하면 항목은 목록에서 사라지지만 주간 총 소진은 줄지 않고, **그 3뽀모가 기타 행 값에 나타난다.**

폐기 항목의 소진이 기타 행에 **나타나려면** Σ 에서 빠져 있어야 한다. 따라서:

```
Σ 의 정의역 = 일반 뷰 목록에 실제로 표시되는 항목
            = is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL
            = listForWeek(week) 의 결과 그대로
```

이렇게 두면 화면의 등식이 **문자 그대로** 성립한다: `게이지 소진 = Σ(보이는 항목) + 기타 행`. 폐기 항목을 Σ 에 포함시키면 A24 가 깨지고 3뽀모가 화면 어디에도 나타나지 않는다.

---

## 파일 구조 (완료 시점 스냅샷, 신규·수정만)

```
src/
├── shared/
│   └── ipc/
│       ├── channels.ts          # (수정) week.* invoke 채널 8종
│       ├── contracts.ts         # (수정) week.* req/res 스키마
│       └── api.ts               # (수정) window.api.week 타입
├── main/
│   ├── services/
│   │   ├── ports.ts             # (수정) WeeksRepository·WeekItemsRepository 확장
│   │   ├── baseline.ts          # (수정) effectiveBudget + budgetPrefill 추가
│   │   └── week-plan.ts         # 신규 — 주간 카드 유스케이스 7종 + 차액 순수 함수
│   ├── ipc/
│   │   └── week.ts              # 신규 — week.* 핸들러
│   ├── index.ts                 # (수정) week 핸들러 등록
│   └── db/repositories/
│       └── drizzle.ts           # (수정) 두 리포지토리 구현 추가
├── preload/
│   └── index.ts                 # (수정) week.* invoke 표면
└── renderer/
    ├── app/App.tsx              # (수정) 주간 카드를 ClockGate 안쪽에 추가
    └── shared/
        ├── query/
        │   ├── keys.ts          # (수정) week(weekKey) 키 추가
        │   └── invalidate.ts    # (수정) InvalidationEvent 2종 추가
        └── ui/
            └── PomoDots.tsx     # 신규 — 뽀모 도트 (default·neutral 두 변형)
    └── features/week/
        ├── useWeek.ts           # 조회 + mutation 훅
        ├── WeekCard.tsx         # 모드 전환 껍데기 (일반 뷰 / 플래너)
        ├── WeekItemRow.tsx      # 항목 행 + 요일 핍
        ├── OtherRow.tsx         # 기타 행 (neutral 도트)
        ├── BudgetGauge.tsx      # 예산 게이지
        ├── ItemDrawer.tsx       # 항목 드로어 (인라인)
        └── Planner.tsx          # 플래너 5단계
tests → 각 모듈 옆 *.test.ts(x)
```

**중요 — 이벤트 채널을 추가하지 않는다.** 확정·완료·폐기·pull 은 전부 **renderer 가 시작하는 invoke** 다. M2 의 `pull-changed`·`task-toggled` 와 같이 mutation 의 `onSuccess` 에서 `dispatchInvalidation` 을 부르면 된다. `EVENT_CHANNELS`(main→renderer push)는 손대지 않는다 — 새로 넣는 것은 `InvalidationEvent` 유니온의 변형 2개뿐이다 (Task 6).

---

### Task 1: 유효 예산 계약 + weeks 포트 확장

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/services/baseline.ts`, `src/main/db/repositories/drizzle.ts`
- Test: `src/main/services/baseline.test.ts` (신규)

**Interfaces:**
- Produces: `effectiveBudget(repos, week): number | null` — `null` 은 **"기록 없음"** 이다. `budgetPrefill(repos): number | null`. `WeeksRepository.plan(week)` / `.setPlan(week, budget)`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/main/services/baseline.test.ts` 에 추가한다. 인메모리 페이크 repos 로 충분하다 (SQL 이 아니라 결정 순서를 검증한다):

```ts
import { describe, expect, it } from 'vitest'
import { budgetPrefill, effectiveBudget } from './baseline'
import type { Repositories } from './ports'

function fakeRepos(o: {
  plan?: { budget: number | null; capacity: number[] | null; plannedAt: string | null } | null
  settings?: Record<string, string>
}): Repositories {
  const settings = o.settings ?? {}
  return {
    settings: { get: (k) => settings[k] ?? null, set: () => {}, updatedAt: () => null },
    weeks: { baseline: () => null, ensure: () => {}, plan: () => o.plan ?? null, setPlan: () => {} }
  } as unknown as Repositories
}

describe('effectiveBudget', () => {
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

  it('capacity 합으로 예산을 파생하지 않는다 (pomo-baseline R11)', () => {
    // 행은 있고 budget 은 NULL, capacity 는 있다 → 그래도 기록 없음이다.
    const repos = fakeRepos({ plan: { budget: null, capacity: [4, 4, 4, 4, 4, 0, 0], plannedAt: null } })
    expect(effectiveBudget(repos, '2026-08-03')).toBeNull()
  })
})

describe('budgetPrefill', () => {
  it('weekly_capacity 가 없으면 프리필하지 않는다 (R12)', () => {
    expect(budgetPrefill(fakeRepos({}))).toBeNull()
  })

  it('있으면 합을 프리필한다', () => {
    const repos = fakeRepos({ settings: { weekly_capacity: '[4,4,4,4,4,0,0]' } })
    expect(budgetPrefill(repos)).toBe(20)
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test src/main/services/baseline.test.ts` → FAIL (`effectiveBudget` 없음)

- [ ] **Step 3: 구현**

`ports.ts` 의 `WeeksRepository` 에 두 메서드를 더한다 (기존 `baseline`·`ensure` 는 그대로):

```ts
export type WeekPlan = {
  /** NULL = "기록 없음". 0 은 "예산 0 으로 하겠다"는 별개 사실이다 (ADR-018 §1). */
  budget: number | null
  /** 요일별 가용 뽀모 `[월..일]`. 미설정이면 null. */
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

`baseline.ts` 에 두 함수를 더한다:

```ts
/**
 * 유효 예산(week) 계약 (pomo-baseline R11). 반환 `null` 은 **"기록 없음"** 이며
 * "예산 0" 이 아니다 — 후자는 `0` 으로 돌아온다 (ADR-018 §1).
 *
 * **조회 시점에 `sum(weekly_capacity)` 로 예산을 파생하는 경로는 이 계약에 없다** (R11).
 * capacity 는 입력 UI 의 프리필 재료일 뿐이다 (`budgetPrefill`).
 */
export function effectiveBudget(repos: Repositories, week: string): number | null {
  return repos.weeks.plan(week)?.budget ?? null
}

/**
 * 예산 입력 필드의 기본값 프리필 (pomo-baseline R12). **조회 계약이 아니라 입력 UI 의
 * 관심사다** — 프리필 값은 사용자가 확정해야 비로소 저장된다.
 * `weekly_capacity` 미설정이면 `null` 을 돌려 필드를 빈 채로 둔다.
 */
export function budgetPrefill(repos: Repositories): number | null {
  const raw = repos.settings.get('weekly_capacity')
  if (raw === null) return null
  const capacity = JSON.parse(raw) as number[]
  return capacity.reduce((sum, n) => sum + n, 0)
}
```

`drizzle.ts` 의 `weeks` 블록에 구현을 더한다:

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

// planned_at 은 최초 확정 시각만 담는다 (week-plan R23·A31). COALESCE 가 그 규칙이다 —
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

### Task 2: 소진 집계 — 술어를 SQL 한 곳에

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`
- Create: `src/main/services/week-plan.ts`
- Test: `src/main/db/repositories/week-items.test.ts` (신규), `src/main/services/week-plan.test.ts` (신규)

**Interfaces:**
- Produces: `WeekItemsRepository.listForWeek(week): WeekItemRow[]`, `.weekTotalSpent(week): number`, `.hasUnplannedActivity(week): boolean`; `otherRowSpent(total, items): number`

- [ ] **Step 1: 실패하는 계약 테스트 작성** — 인메모리 실 SQLite (ADR-023 §3). M1 Task 5·M2 Task 6 과 같은 헬퍼를 쓴다.

```ts
// src/main/db/repositories/week-items.test.ts
import { describe, expect, it } from 'vitest'
import { withTestUow } from './test-helpers' // M2 계약 테스트가 쓰는 헬퍼와 동일

const WEEK = '2026-08-03' // 월요일
const NEXT = '2026-08-10'
const BASE = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

describe('weekItems.listForWeek', () => {
  it('항목 소진은 그 항목의 주에 기록된 focus 세션만 센다 (R8 · A10)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const itemId = repos.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: null, title: '논문 3장', estPomos: 5, days: [] }]
        }).createdIds[0]
        repos.tasks.create({ id: 't1', weekItemId: itemId, title: '3장 1절' })

        // 같은 주 세션 1개
        repos.sessions.insert({
          id: 's1', startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:25:00.000Z',
          durationSec: 1500, kind: 'focus', taskId: 't1',
          localDate: '2026-08-04', localWeek: WEEK
        })
        // 자정·주 경계를 넘겨 다음 주로 기록된 세션 1개 — 같은 task 인데 주가 다르다
        repos.sessions.insert({
          id: 's2', startedAt: '2026-08-09T14:50:00.000Z', endedAt: '2026-08-09T15:15:00.000Z',
          durationSec: 1500, kind: 'focus', taskId: 't1',
          localDate: '2026-08-10', localWeek: NEXT
        })

        const rows = repos.weekItems.listForWeek(WEEK)
        expect(rows).toHaveLength(1)
        // s2 는 NEXT 주에 기록됐으므로 이 항목의 소진에 들어가지 않는다.
        expect(rows[0].spentPomos).toBe(1)
        // 그러나 주간 총 소진에는 각자의 주에서 정확히 한 번씩 세어진다.
        expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(1)
        expect(repos.weekItems.weekTotalSpent(NEXT)).toBe(1)
      })
    })
  })

  it('focus 가 아닌 세션은 세지 않는다', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const itemId = repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: 'A', estPomos: 2, days: [] }]
        }).createdIds[0]
        repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각' })
        repos.sessions.insert({
          id: 's1', startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:05:00.000Z',
          durationSec: 300, kind: 'short', taskId: 't1',
          localDate: '2026-08-04', localWeek: WEEK
        })
        expect(repos.weekItems.listForWeek(WEEK)[0].spentPomos).toBe(0)
      })
    })
  })

  it('폐기·시스템 항목은 목록에서 빠지고 생성순으로 정렬된다 (R10 · R18)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        repos.weekItems.ensureSystemItem(WEEK)
        const { createdIds } = repos.weekItems.confirmPlan({
          week: WEEK,
          items: [
            { id: null, title: '먼저', estPomos: 1, days: [] },
            { id: null, title: '나중', estPomos: 1, days: [] }
          ]
        })
        // 두 번째 확정에서 '나중' 을 목록에서 빼면 폐기된다.
        repos.weekItems.confirmPlan({
          week: WEEK,
          items: [{ id: createdIds[0], title: '먼저', estPomos: 1, days: [] }]
        })

        const rows = repos.weekItems.listForWeek(WEEK)
        expect(rows.map((r) => r.title)).toEqual(['먼저'])
      })
    })
  })

  it('자식 조각 완료/전체 수를 함께 돌려준다 (§3.1 조각 카운트)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const itemId = repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
        repos.tasks.create({ id: 't1', weekItemId: itemId, title: '조각1' })
        repos.tasks.create({ id: 't2', weekItemId: itemId, title: '조각2' })
        repos.tasks.toggleComplete('t1')

        const row = repos.weekItems.listForWeek(WEEK)[0]
        expect(row.childTotal).toBe(2)
        expect(row.childDone).toBe(1)
      })
    })
  })
})

describe('weekItems.hasUnplannedActivity', () => {
  it('소진 0 이어도 부모 없는 조각이 있으면 true (R17 · A23)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        const sysId = repos.weekItems.ensureSystemItem(WEEK)
        repos.tasks.create({ id: 't1', weekItemId: sysId, title: '직접 추가' })
        expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
        expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(0)
      })
    })
  })

  it('미분류 세션(task 미연결)만 있어도 true', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.sessions.insert({
          id: 's1', startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:25:00.000Z',
          durationSec: 1500, kind: 'focus', taskId: null,
          localDate: '2026-08-04', localWeek: WEEK
        })
        expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(true)
      })
    })
  })

  it('세션도 조각도 없는 주는 false', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        expect(repos.weekItems.hasUnplannedActivity(WEEK)).toBe(false)
      })
    })
  })
})
```

그리고 차액 순수 함수 테스트:

```ts
// src/main/services/week-plan.test.ts
import { describe, expect, it } from 'vitest'
import { otherRowSpent } from './week-plan'

describe('otherRowSpent', () => {
  it('총 소진에서 보이는 항목 소진 합을 뺀 값이다 (R17)', () => {
    expect(otherRowSpent(18, [{ spentPomos: 10 }])).toBe(8)
  })

  it('폐기 항목의 소진이 여기로 흡수된다 (A24)', () => {
    // 총 5뽀모 중 3뽀모가 폐기된 항목 것 → 보이는 항목은 2뽀모만 들고 있다.
    expect(otherRowSpent(5, [{ spentPomos: 2 }])).toBe(3)
  })

  it('보이는 항목이 없으면 총 소진 전부가 기타 행이다', () => {
    expect(otherRowSpent(4, [])).toBe(4)
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL

- [ ] **Step 3: 구현**

`ports.ts` 에 타입과 메서드를 더한다:

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

export interface WeekItemsRepository {
  ensureSystemItem(week: string): string
  weekOf(weekItemId: string): string | null
  /**
   * 일반 뷰에 표시되는 항목 + 소진. 정의역이 곧 차액 공식의 Σ 다 —
   * `is_system = 0 AND dropped_at IS NULL AND deleted_at IS NULL`.
   * 폐기 항목을 포함시키면 A24 가 깨진다 (계획서 "차액 공식의 정의역" 절).
   */
  listForWeek(week: string): WeekItemRow[]
  /** 그 주 focus 세션 전체 (기타·미분류 포함). 게이지 소진이자 차액의 피감수. */
  weekTotalSpent(week: string): number
  /** 기타 행 **표시 조건** — 미분류 focus 세션 또는 부모 없는 조각이 하나라도 있는가 (R17). */
  hasUnplannedActivity(week: string): boolean
}
```

`week-plan.ts` 를 만든다:

```ts
import type { WeekItemRow } from './ports'

/**
 * 기타 행 소진 — **차액으로 정의한다** (week-plan R17, ADR-012 §4).
 * 독립 계산하면 ① 시스템 항목 이중 계상 ② 폐기 항목 소진 누락이 열린다.
 *
 * `items` 는 **화면에 보이는 항목**(= `listForWeek` 의 결과)이어야 한다. 폐기 항목을
 * 넣으면 그 소진이 어디에도 나타나지 않아 A24 가 깨진다.
 *
 * 클램프하지 않는다 — 술어가 옳으면 음수가 될 수 없고, 음수가 나온다면 그것은
 * 숨겨야 할 값이 아니라 드러나야 할 버그다.
 */
export function otherRowSpent(
  weekTotalSpent: number,
  visibleItems: readonly Pick<WeekItemRow, 'spentPomos'>[]
): number {
  const planned = visibleItems.reduce((sum, item) => sum + item.spentPomos, 0)
  return weekTotalSpent - planned
}
```

`drizzle.ts` 의 `weekItems` 블록에 더한다. **소진 술어는 이 파일에만 존재한다:**

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
     * 이 술어는 이 파일 안에만 존재한다 (R8, 성공 지표).
     */
    const spentPomos =
      tx
        .select({ n: sql<number>`count(*)` })
        .from(sessions)
        .innerJoin(tasks, eq(sessions.taskId, tasks.id))
        .where(
          and(
            eq(tasks.weekItemId, r.id),
            eq(sessions.kind, 'focus'),
            eq(sessions.localWeek, week)
          )
        )
        .get()?.n ?? 0

    const childCounts =
      tx
        .select({
          total: sql<number>`count(*)`,
          done: sql<number>`sum(case when ${tasks.completedAt} is not null then 1 else 0 end)`
        })
        .from(tasks)
        .where(and(eq(tasks.weekItemId, r.id), isNull(tasks.deletedAt)))
        .get() ?? { total: 0, done: 0 }

    return {
      id: r.id,
      title: r.title,
      estPomos: r.estPomos,
      days: JSON.parse(r.days) as number[],
      originWeek: r.originWeek,
      completedAt: r.completedAt,
      spentPomos,
      childTotal: childCounts.total,
      childDone: childCounts.done ?? 0
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
    .where(
      and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus'), isNull(sessions.taskId))
    )
    .get()
  if (looseSession) return true

  const orphanTask = tx
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(weekItems, eq(tasks.weekItemId, weekItems.id))
    .where(
      and(eq(weekItems.week, week), eq(weekItems.isSystem, 1), isNull(tasks.deletedAt))
    )
    .get()
  return orphanTask !== undefined
}
```

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: aggregate week item spent pomos with the week predicate`

---

### Task 3: 플래너 확정 트랜잭션

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/services/week-plan.ts`, `src/main/db/repositories/drizzle.ts`
- Test: `src/main/db/repositories/week-items.test.ts`(추가), `src/main/services/week-plan.test.ts`(추가)

**Interfaces:**
- Consumes: Task 1 의 `weeks.ensure`·`weeks.setPlan`, `effectiveBaseline`
- Produces: `WeekItemsRepository.confirmPlan(input): { createdIds: string[]; droppedIds: string[] }`, `confirmWeekPlan(uow, input): { week: string; droppedCount: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// week-items.test.ts 에 추가
describe('weekItems.confirmPlan', () => {
  it('id 가 있으면 ID 로 매칭해 갱신하고 자식·origin_week 를 유지한다 (R23 · A30)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const id = repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: '원래 제목', estPomos: 3, days: [0] }]
        }).createdIds[0]
        repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })

        repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id, title: '고친 제목', estPomos: 5, days: [1, 3] }]
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
  })

  it('목록에서 빠진 기존 항목은 폐기되고 자식·세션이 전부 남는다 (R24 · A32)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const id = repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: '보낼 항목', estPomos: 9, days: [] }]
        }).createdIds[0]
        repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
        for (let i = 0; i < 9; i++) {
          repos.sessions.insert({
            id: `s${i}`, startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:25:00.000Z',
            durationSec: 1500, kind: 'focus', taskId: 't1',
            localDate: '2026-08-04', localWeek: WEEK
          })
        }

        const { droppedIds } = repos.weekItems.confirmPlan({ week: WEEK, items: [] })

        expect(droppedIds).toEqual([id])
        expect(repos.weekItems.listForWeek(WEEK)).toHaveLength(0) // 목록에서 사라졌다
        expect(repos.weekItems.weekTotalSpent(WEEK)).toBe(9)      // 총 소진은 줄지 않았다
        expect(repos.tasks.get('t1')).not.toBeNull()              // 조각은 남았다
      })
    })
  })

  it('폐기된 항목의 소진이 기타 행 차액으로 나타난다 (A24)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const { createdIds } = repos.weekItems.confirmPlan({
          week: WEEK,
          items: [
            { id: null, title: '남길 항목', estPomos: 2, days: [] },
            { id: null, title: '보낼 항목', estPomos: 3, days: [] }
          ]
        })
        repos.tasks.create({ id: 'keep', weekItemId: createdIds[0], title: 'a' })
        repos.tasks.create({ id: 'gone', weekItemId: createdIds[1], title: 'b' })
        const mk = (id: string, taskId: string) =>
          repos.sessions.insert({
            id, startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:25:00.000Z',
            durationSec: 1500, kind: 'focus', taskId,
            localDate: '2026-08-04', localWeek: WEEK
          })
        mk('s1', 'keep')
        mk('s2', 'gone'); mk('s3', 'gone'); mk('s4', 'gone')

        repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: createdIds[0], title: '남길 항목', estPomos: 2, days: [] }]
        })

        const visible = repos.weekItems.listForWeek(WEEK)
        const total = repos.weekItems.weekTotalSpent(WEEK)
        expect(total).toBe(4)
        expect(visible[0].spentPomos).toBe(1)
        expect(otherRowSpent(total, visible)).toBe(3) // 보낸 항목의 3뽀모가 여기 있다
      })
    })
  })
})
```

서비스 레벨:

```ts
// week-plan.test.ts 에 추가
describe('confirmWeekPlan', () => {
  it('planned_at 은 최초 확정만 담고 재확정으로 갱신되지 않는다 (R23 · A31)', () => {
    withTestUow((uow) => {
      confirmWeekPlan(uow, { week: WEEK, budget: 20, items: [{ id: null, title: 'A', estPomos: 1, days: [] }] })
      const first = uow.run((r) => r.weeks.plan(WEEK)!.plannedAt)
      expect(first).not.toBeNull()

      confirmWeekPlan(uow, { week: WEEK, budget: 25, items: [] })
      const second = uow.run((r) => r.weeks.plan(WEEK)!)
      expect(second.plannedAt).toBe(first) // 갱신되지 않았다
      expect(second.budget).toBe(25)       // 예산은 갱신됐다
    })
  })

  it('예산을 비운 채 확정하면 budget 이 NULL 로 남는다 (capacity 미설정 경로)', () => {
    withTestUow((uow) => {
      confirmWeekPlan(uow, { week: WEEK, budget: null, items: [{ id: null, title: 'A', estPomos: 1, days: [] }] })
      expect(uow.run((r) => r.weeks.plan(WEEK)!.budget)).toBeNull()
    })
  })

  it('과적이어도 확정은 성공한다 (R22 — 차단 0건)', () => {
    withTestUow((uow) => {
      const result = confirmWeekPlan(uow, {
        week: WEEK, budget: 2,
        items: [{ id: null, title: 'A', estPomos: 50, days: [] }]
      })
      expect(result.week).toBe(WEEK)
      expect(uow.run((r) => r.weekItems.listForWeek(WEEK))).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL

- [ ] **Step 3: 구현**

`ports.ts`:

```ts
export type PlanDraftItem = {
  /** null = 이 초안에서 새로 추가된 행. 값이 있으면 기존 항목이다. */
  id: string | null
  title: string
  estPomos: number
  days: number[]
}

export interface WeekItemsRepository {
  // ...앞의 것들
  /**
   * 선언형 확정 (week-plan R23·R24). 요청 목록이 그 주 계획의 **전체**다.
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

`drizzle.ts`:

```ts
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
          originWeek: week, // 신규는 이 주가 최초 생성 주다. 이월만 원본 값을 승계한다 (R11).
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

`week-plan.ts` 에 유스케이스를 더한다:

```ts
import { effectiveBaseline } from './baseline'
import type { PlanDraftItem, UnitOfWork } from './ports'

/**
 * 플래너 확정 (week-plan R22~R24). **과적 여부와 무관하게 항상 성공한다** — 계획 확정을
 * 막는 경로가 이 함수에 없다 (R22, 차단 0건).
 *
 * 전체가 트랜잭션 하나다 (ADR-015): weeks 행 보장 → 예산·planned_at → 항목 upsert·폐기.
 */
export function confirmWeekPlan(
  uow: UnitOfWork,
  input: { week: string; budget: number | null; items: readonly PlanDraftItem[] }
): { week: string; droppedCount: number } {
  return uow.run((repos) => {
    // 행이 없으면 그 시점 유효 길이를 박제해 만든다 (ADR-013 §2). 있으면 덮지 않는다.
    repos.weeks.ensure(input.week, effectiveBaseline(repos, input.week))
    repos.weeks.setPlan(input.week, input.budget)
    const { droppedIds } = repos.weekItems.confirmPlan({ week: input.week, items: input.items })
    return { week: input.week, droppedCount: droppedIds.length }
  })
}
```

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: confirm week plan as one declarative transaction`

---

### Task 4: 드로어 데이터 · 완료 · 폐기 · 원클릭 pull

**Files:**
- Modify: `src/main/services/ports.ts`, `src/main/services/week-plan.ts`, `src/main/db/repositories/drizzle.ts`
- Test: `src/main/db/repositories/week-items.test.ts`(추가), `src/main/services/week-plan.test.ts`(추가)

**Interfaces:**
- Produces: `WeekItemsRepository.childTasks(itemId, dayKey)`, `.nextPullable(itemId, dayKey)`, `.setCompleted(itemId, at)`, `.drop(itemId)`, `.unplannedBreakdown(week)`; `pullNextFromItem(uow, itemId)`, `setItemCompleted(uow, itemId, completed)`, `dropItem(uow, itemId)`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// week-items.test.ts 에 추가
describe('weekItems.nextPullable', () => {
  it('유자격 조각 = 미완료·미삭제·오늘 pull 없음, 생성순 첫 번째 (§3.1)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const id = repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
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
  })

  it('치운 조각은 다시 유자격이다 (today-tasks R14)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const id = repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
        repos.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
        repos.today.pull('t1', '2026-08-04')
        repos.today.remove('t1', '2026-08-04')
        expect(repos.weekItems.nextPullable(id, '2026-08-04')).toBe('t1')
      })
    })
  })
})

describe('weekItems.childTasks', () => {
  it('조각별 소진과 오늘 목록 상태를 함께 준다 (§6.2)', () => {
    withTestUow((uow) => {
      uow.run((repos) => {
        repos.weeks.ensure(WEEK, BASE)
        const id = repos.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
        repos.tasks.create({ id: 't1', weekItemId: id, title: '조각1', estPomos: 2 })
        repos.tasks.create({ id: 't2', weekItemId: id, title: '조각2' })
        repos.today.pull('t2', '2026-08-04')
        repos.sessions.insert({
          id: 's1', startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:25:00.000Z',
          durationSec: 1500, kind: 'focus', taskId: 't1',
          localDate: '2026-08-04', localWeek: WEEK
        })

        const rows = repos.weekItems.childTasks(id, '2026-08-04')
        expect(rows).toEqual([
          { taskId: 't1', title: '조각1', estPomos: 2, spentPomos: 1, completedAt: null, inToday: false },
          { taskId: 't2', title: '조각2', estPomos: null, spentPomos: 0, completedAt: null, inToday: true }
        ])
      })
    })
  })
})
```

서비스 레벨:

```ts
// week-plan.test.ts 에 추가
describe('setItemCompleted', () => {
  it('완료 후 세션이 더 붙어도 completed_at 이 변하지 않는다 (R28 · A37)', () => {
    withTestUow((uow) => {
      const week = WEEK
      const id = uow.run((r) => {
        r.weeks.ensure(week, BASE)
        return r.weekItems.confirmPlan({
          week, items: [{ id: null, title: 'A', estPomos: 3, days: [] }]
        }).createdIds[0]
      })
      uow.run((r) => r.tasks.create({ id: 't1', weekItemId: id, title: '조각' }))
      const at = setItemCompleted(uow, id, true).completedAt
      expect(at).not.toBeNull()

      uow.run((r) => {
        for (let i = 0; i < 5; i++) {
          r.sessions.insert({
            id: `s${i}`, startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:25:00.000Z',
            durationSec: 1500, kind: 'focus', taskId: 't1',
            localDate: '2026-08-04', localWeek: week
          })
        }
      })

      const row = uow.run((r) => r.weekItems.listForWeek(week)[0])
      expect(row.spentPomos).toBe(5)      // 소진은 계속 오른다
      expect(row.completedAt).toBe(at)    // 완료 시각은 그대로다
    })
  })

  it('완료를 해제하면 NULL 로 돌아간다 (R27)', () => {
    withTestUow((uow) => {
      const id = uow.run((r) => {
        r.weeks.ensure(WEEK, BASE)
        return r.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: 'A', estPomos: 1, days: [] }]
        }).createdIds[0]
      })
      setItemCompleted(uow, id, true)
      expect(setItemCompleted(uow, id, false).completedAt).toBeNull()
    })
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL

- [ ] **Step 3: 구현**

`ports.ts`:

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

/** 기타 행 드릴다운 (§6.4) — 읽기 전용 두 그룹. */
export type UnplannedBreakdown = {
  named: { title: string; spentPomos: number }[]
  /** task 에 연결되지 않은 focus 세션 수. */
  anonymousPomos: number
}

export interface WeekItemsRepository {
  // ...앞의 것들
  childTasks(weekItemId: string, dayKey: string): ChildTaskRow[]
  /** 원클릭 pull 대상. 유자격 조각이 없으면 null (그때 화면은 드로어를 연다). */
  nextPullable(weekItemId: string, dayKey: string): string | null
  /** `at` 이 null 이면 완료 해제. */
  setCompleted(weekItemId: string, at: string | null): void
  drop(weekItemId: string): void
  unplannedBreakdown(week: string): UnplannedBreakdown
}
```

`drizzle.ts` 구현:

```ts
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

nextPullable: (weekItemId, dayKey) =>
  tx
    .select({ id: tasks.id })
    .from(tasks)
    .leftJoin(
      taskPulls,
      and(eq(taskPulls.taskId, tasks.id), eq(taskPulls.pullDate, dayKey))
    )
    .where(
      and(
        eq(tasks.weekItemId, weekItemId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        // 오늘 pull 행이 없거나, 있어도 치워진(removed) 행이면 다시 유자격이다 (R14).
        sql`(${taskPulls.taskId} IS NULL OR ${taskPulls.removedAt} IS NOT NULL)`
      )
    )
    .orderBy(asc(tasks.createdAt), sql`tasks.rowid`)
    .get()?.id ?? null,

setCompleted: (weekItemId, at) => {
  tx.update(weekItems).set({ completedAt: at }).where(eq(weekItems.id, weekItemId)).run()
},

drop: (weekItemId) => {
  tx.update(weekItems).set({ droppedAt: now() }).where(eq(weekItems.id, weekItemId)).run()
},

unplannedBreakdown: (week) => {
  const named = tx
    .select({
      title: tasks.title,
      spentPomos: sql<number>`(
        select count(*) from sessions s
        where s.task_id = ${tasks.id} and s.kind = 'focus' and s.local_week = ${week}
      )`
    })
    .from(tasks)
    .innerJoin(weekItems, eq(tasks.weekItemId, weekItems.id))
    .where(and(eq(weekItems.week, week), eq(weekItems.isSystem, 1), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.createdAt))
    .all()

  const anonymousPomos =
    tx
      .select({ n: sql<number>`count(*)` })
      .from(sessions)
      .where(
        and(eq(sessions.localWeek, week), eq(sessions.kind, 'focus'), isNull(sessions.taskId))
      )
      .get()?.n ?? 0

  return { named, anonymousPomos }
}
```

`week-plan.ts` 유스케이스:

```ts
import { v7 as uuidv7 } from 'uuid'
import { localKeys, now } from '../../shared/time'

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
    const itemWeek = repos.weekItems.weekOf(weekItemId)
    if (itemWeek === null) throw new Error(`pullNext: week item '${weekItemId}' not found`)

    const taskId = repos.weekItems.nextPullable(weekItemId, localDate)
    if (taskId === null) return { pulled: null, itemWeek }

    repos.today.pull(taskId, localDate)
    return { pulled: { taskId, title: repos.tasks.titleOf(taskId) ?? '' }, itemWeek }
  })
}

/** 드로어의 `오늘로 가져오기` — 새 조각 생성 + 선택한 기존 조각을 한 트랜잭션으로 (§6.3). */
export function pullFromDrawer(
  uow: UnitOfWork,
  input: { weekItemId: string; taskIds: readonly string[]; newTask: { title: string; estPomos: number | null } | null }
): { itemWeek: string } {
  const { localDate } = localKeys()
  return uow.run((repos) => {
    const itemWeek = repos.weekItems.weekOf(input.weekItemId)
    if (itemWeek === null) throw new Error(`pullFromDrawer: item '${input.weekItemId}' not found`)

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

    return { itemWeek }
  })
}

/** 항목 완료 확정·해제 (R25·R27). 완료는 언제나 사용자 클릭이 만드는 사실이다. */
export function setItemCompleted(
  uow: UnitOfWork,
  weekItemId: string,
  completed: boolean
): { itemWeek: string; completedAt: string | null } {
  return uow.run((repos) => {
    const itemWeek = repos.weekItems.weekOf(weekItemId)
    if (itemWeek === null) throw new Error(`setItemCompleted: item '${weekItemId}' not found`)
    const at = completed ? now() : null
    repos.weekItems.setCompleted(weekItemId, at)
    return { itemWeek, completedAt: at }
  })
}

/** `보내주기` (§6.3). 폐기이지 삭제가 아니다 — 자식 조각·세션은 남는다 (ADR-014 §1). */
export function dropItem(uow: UnitOfWork, weekItemId: string): { itemWeek: string } {
  return uow.run((repos) => {
    const itemWeek = repos.weekItems.weekOf(weekItemId)
    if (itemWeek === null) throw new Error(`dropItem: item '${weekItemId}' not found`)
    repos.weekItems.drop(weekItemId)
    return { itemWeek }
  })
}
```

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: add drawer queries, item completion, drop and one-click pull`

---

### Task 5: 주간 카드 조회 유스케이스 + IPC 8종

**Files:**
- Modify: `src/shared/ipc/channels.ts`, `src/shared/ipc/contracts.ts`, `src/shared/ipc/api.ts`, `src/preload/index.ts`, `src/main/index.ts`, `src/main/services/week-plan.ts`
- Create: `src/main/ipc/week.ts`
- Test: `src/main/services/week-plan.test.ts`(추가), `src/main/ipc/registration.test.ts`(기존 갱신)

**Interfaces:**
- Consumes: Task 1–4 전부
- Produces: `window.api.week.{summary,planDraft,confirmPlan,drawer,pullNext,pullFromDrawer,setCompleted,drop}`

- [ ] **Step 1: 실패하는 테스트 작성** — 조회 유스케이스가 차액·표시 조건을 조립하는지:

```ts
// week-plan.test.ts 에 추가
describe('weekSummary', () => {
  it('보이는 항목 + 기타 행 + 게이지가 한 응답으로 나오고 등식이 성립한다 (성공 지표)', () => {
    withTestUow((uow) => {
      // 항목 1개(1뽀모) + 미분류 세션 2개 = 총 3뽀모
      const id = uow.run((r) => {
        r.weeks.ensure(WEEK, BASE)
        return r.weekItems.confirmPlan({
          week: WEEK, items: [{ id: null, title: 'A', estPomos: 4, days: [] }]
        }).createdIds[0]
      })
      uow.run((r) => {
        r.tasks.create({ id: 't1', weekItemId: id, title: '조각' })
        r.sessions.insert({ id: 's1', startedAt: '2026-08-04T01:00:00.000Z', endedAt: '2026-08-04T01:25:00.000Z', durationSec: 1500, kind: 'focus', taskId: 't1', localDate: '2026-08-04', localWeek: WEEK })
        r.sessions.insert({ id: 's2', startedAt: '2026-08-04T02:00:00.000Z', endedAt: '2026-08-04T02:25:00.000Z', durationSec: 1500, kind: 'focus', taskId: null, localDate: '2026-08-04', localWeek: WEEK })
        r.sessions.insert({ id: 's3', startedAt: '2026-08-04T03:00:00.000Z', endedAt: '2026-08-04T03:25:00.000Z', durationSec: 1500, kind: 'focus', taskId: null, localDate: '2026-08-04', localWeek: WEEK })
      })

      const s = weekSummary(uow, WEEK)
      expect(s.totalSpent).toBe(3)
      expect(s.items).toHaveLength(1)
      expect(s.otherRow).toEqual({ visible: true, spentPomos: 2 })
      // 등식: 게이지 소진 == Σ(보이는 항목) + 기타 행
      expect(s.items.reduce((n, i) => n + i.spentPomos, 0) + s.otherRow.spentPomos).toBe(s.totalSpent)
    })
  })

  it('세션도 조각도 없으면 기타 행을 숨긴다 (R17)', () => {
    withTestUow((uow) => {
      uow.run((r) => r.weeks.ensure(WEEK, BASE))
      expect(weekSummary(uow, WEEK).otherRow.visible).toBe(false)
    })
  })

  it('weeks 행이 없으면 budget 이 null 이다 (기록 없음 — §7)', () => {
    withTestUow((uow) => {
      expect(weekSummary(uow, WEEK).budget).toBeNull()
    })
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL

- [ ] **Step 3: 구현**

`week-plan.ts` 에 조회 2종을 더한다:

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
    return {
      week,
      budget: effectiveBudget(repos, week),
      totalSpent,
      items,
      otherRow: {
        visible: repos.weekItems.hasUnplannedActivity(week),
        spentPomos: otherRowSpent(totalSpent, items)
      }
    }
  })
}

/** 플래너 진입 시 초안 프리필 (§5.2·§5.3). 기타 항목은 초안에 넣지 않는다 (R16). */
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

`channels.ts` 에 더한다:

```ts
week: {
  summary: 'week:summary',
  planDraft: 'week:planDraft',
  confirmPlan: 'week:confirmPlan',
  drawer: 'week:drawer',
  pullNext: 'week:pullNext',
  pullFromDrawer: 'week:pullFromDrawer',
  setCompleted: 'week:setCompleted',
  drop: 'week:drop'
}
```

`contracts.ts` 에 스키마를 더한다 (응답은 전부 `strictObject`):

```ts
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

const planDraftItemSchema = z.strictObject({
  id: z.string().nullable(),
  title: z.string().min(1).max(40),
  estPomos: z.int().min(1), // 사용자가 만드는 항목의 하한 1 (R6). 기타 항목은 이 경로를 거치지 않는다.
  days: z.array(z.int().min(0).max(6))
})

// contracts 에 추가
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
      tasks: z.array(
        z.strictObject({
          taskId: z.string(),
          title: z.string(),
          estPomos: z.int().nullable(),
          spentPomos: z.int(),
          completedAt: z.string().nullable(),
          inToday: z.boolean()
        })
      )
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
        newTask: z.strictObject({ title: z.string().min(1).max(40), estPomos: z.int().min(1).nullable() }).nullable()
      })
    ]),
    res: z.strictObject({ itemWeek: z.string() })
  },
  setCompleted: {
    req: z.tuple([z.string(), z.boolean()]),
    res: z.strictObject({ itemWeek: z.string(), completedAt: z.string().nullable() })
  },
  drop: {
    req: z.tuple([z.string()]),
    res: z.strictObject({ itemWeek: z.string() })
  }
}
```

`src/main/ipc/week.ts` 를 만들고 `handleIpc` 로만 등록한다 (M2 의 `today.ts` 와 같은 모양). `api.ts`·`preload/index.ts`·`main/index.ts` 를 채워 **채널 추가 4곳 규칙**을 지킨다.

기타 행 드릴다운(`unplannedBreakdown`)은 드로어 응답과 성격이 달라 `week:drawer` 에 섞지 않는다 — Task 9 에서 별도 채널 `week:unplanned` 로 추가한다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS. `pnpm dev` 콘솔에서:
  `await window.api.week.confirmPlan({ week: (await window.api.clock.now()).weekKey, budget: 20, items: [{ id: null, title: '테스트', estPomos: 3, days: [] }] })` → `await window.api.week.summary((await window.api.clock.now()).weekKey)` 에 항목 1행.

- [ ] **Step 5: 커밋** — `feat: expose week plan use cases over validated ipc`

---

### Task 6: 무효화 초크포인트 확장

**Files:**
- Modify: `src/renderer/shared/query/keys.ts`, `src/renderer/shared/query/invalidate.ts`
- Test: `src/renderer/shared/query/invalidate.test.ts`(기존에 추가)

**Interfaces:**
- Produces: `keys.week(weekKey)`, `InvalidationEvent` 의 `'plan-confirmed'` · `'item-changed'` 변형

**이벤트 채널을 추가하지 않는다.** 이 태스크가 다루는 것은 `InvalidationEvent` 유니온이며, `EVENT_CHANNELS`(main→renderer push)는 손대지 않는다. 확정·완료·폐기·pull 은 renderer 가 시작한 invoke 이므로 mutation `onSuccess` 에서 `dispatchInvalidation` 을 부른다 — M2 의 `pull-changed`·`task-toggled` 와 같은 패턴이다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// invalidate.test.ts 에 추가
describe('plan-confirmed', () => {
  it('확정한 주와 오늘 목록을 무효화한다 (그 주가 오늘 주일 때)', () => {
    expect(
      keysToInvalidate({
        type: 'plan-confirmed',
        payload: { week: '2026-08-03' },
        currentDayKey: '2026-08-05'
      })
    ).toEqual([['week', '2026-08-03'], ['week', '2026-08-03', 'items'], ['today', '2026-08-05']])
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
    ).toEqual([['week', '2026-08-10'], ['week', '2026-08-10', 'items'], ['today', '2026-08-05']])
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL

- [ ] **Step 3: 구현**

`keys.ts` 에 한 줄 더한다 (`weekItems` 는 그대로 둔다 — M2 사건들이 이미 쓰고 있다):

```ts
/** 주간 카드 한 화면 (summary). `['week', weekKey]` 는 `weekAll()` prefix 에 그대로 걸린다. */
week: (weekKey: string) => ['week', weekKey] as const,
```

`invalidate.ts` 의 유니온과 `switch` 에 두 갈래를 더한다:

```ts
| { type: 'plan-confirmed'; payload: { week: string }; currentDayKey: string }
| { type: 'item-changed'; payload: { itemWeek: string }; currentDayKey: string }
```

```ts
case 'plan-confirmed':
  // 항목이 늘거나 폐기되면 그 주 카드와, 그 항목에서 pull 해둔 오늘 목록이 함께 변한다.
  return [
    keys.week(e.payload.week),
    keys.weekItems(e.payload.week),
    keys.today(e.currentDayKey)
  ]
case 'item-changed':
  // 완료·완료 해제·폐기·pull 이 모두 이 갈래다 — 바뀌는 캐시 집합이 같다.
  return [
    keys.week(e.payload.itemWeek),
    keys.weekItems(e.payload.itemWeek),
    keys.today(e.currentDayKey)
  ]
```

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS, `pnpm lint` 통과 (초크포인트 밖 캐시 조작 0)

- [ ] **Step 5: 커밋** — `feat: add week plan invalidation events to the choke point`

---

### Task 7: 뽀모 도트 컴포넌트

**Files:**
- Create: `src/renderer/shared/ui/PomoDots.tsx`
- Test: `src/renderer/shared/ui/PomoDots.test.tsx`

**Interfaces:**
- Produces: `<PomoDots spent={n} est={n} variant="default" | "neutral" />`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
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

  it('neutral(기타 행): 소진 개수만 채우고 미채움·extra·+N 을 렌더하지 않는다 (§3.4)', () => {
    render(<PomoDots spent={3} est={0} variant="neutral" />)
    expect(screen.getAllByTestId('pomo-dot-filled')).toHaveLength(3)
    expect(screen.queryAllByTestId('pomo-dot-empty')).toHaveLength(0)
    expect(screen.queryAllByTestId('pomo-dot-extra')).toHaveLength(0)
    // 숫자는 소진 단독 — `3/0` 을 쓰지 않는다.
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('3/0')).not.toBeInTheDocument()
  })

  it('이모지를 쓰지 않는다 (principles §6)', () => {
    const { container } = render(<PomoDots spent={7} est={5} />)
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 도트는 토큰 기반 커스텀(SVG/CSS), 초과 배지의 불꽃은 lucide `Flame` **컴포넌트**다. 이모지 금지. 채움 `--teal`, 미채움 `--ink-faint`, extra `--amber`. 숫자는 `--font-mono` + `tabular-nums`.

`neutral` 변형이 존재하는 이유를 파일 주석에 남긴다: 기타 행은 est 가 0 이라 default 규칙을 그대로 적용하면 **모든 도트가 초과로 렌더된다** (§3.4).

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS

- [ ] **Step 5: 커밋** — `feat: add pomo dots with default and neutral variants`

---

### Task 8: 주간 카드 일반 뷰

**Files:**
- Create: `src/renderer/features/week/useWeek.ts`, `WeekCard.tsx`, `WeekItemRow.tsx`, `OtherRow.tsx`, `BudgetGauge.tsx`
- Modify: `src/renderer/app/App.tsx`
- Test: `WeekCard.test.tsx`, `BudgetGauge.test.tsx`

**Interfaces:**
- Consumes: `keys.week(weekKey)`, `useClock()`, `api.week.*`, `dispatchInvalidation`, `<PomoDots />`
- Produces: `<WeekCard />`

- [ ] **Step 1: 실패하는 테스트 작성** — 렌더 계약만 (도메인 로직은 main 테스트가 덮는다):
  - 항목 행에 제목·도트·조각 카운트·요일 핍 7개(월요일 시작)가 렌더된다
  - `otherRow.visible` 이 true 면 `기타 — 계획에 없던 집중` 행이 **목록 맨 아래**에 렌더되고, `neutral` 도트를 쓴다
  - 게이지: `budget === null` 이면 바가 없고 `<소진> / 미설정` + `예산을 정하면 예산 대비 소진이 보여요`
  - 게이지: 소진 23 · 예산 20 이면 `+3` 배지가 있고 **`--danger` 클래스·lucide `AlertTriangle` 이 0개**
  - 빈 상태(항목 0 · 세션 0): `이번 주 할당을 잡으면 뽀모 예산이 여기 보여요` + CTA
  - 완료 항목: 제목 취소선, pull 버튼 자리에 `완료됨` 비활성 라벨
  - 자식 조각 0개면 `· 조각 0/0` 표기를 **숨긴다** (§3.1)

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`useWeek.ts`:

```ts
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
  const setCompleted = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.week.setCompleted(id, done),
    onSuccess: invalidateItem
  })
  const drop = useMutation({ mutationFn: api.week.drop, onSuccess: invalidateItem })
  return { weekKey, dayKey, query, pullNext, setCompleted, drop }
}
```

요일 핍은 **색과 모양 두 채널**로 구분한다 (§3.2, principles §3.5) — 미배정 solid 작게 / 지난 요일 **윤곽선만** / 오늘 **바깥 링** + `--amber` / 다가올 요일 solid `--teal`. **불투명도로 지난 요일을 표현하지 않는다.**

`App.tsx` 에 주간 카드를 더한다. **`ClockGate` 안쪽이다** — M2 의 콜드 스타트 크래시(`7e0d472`)가 같은 자리에서 났다. 반응형은 만들지 않는다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS. `pnpm dev`: 콘솔로 항목을 만들고 카드에 행이 보이는지, 타이머로 1뽀모 태우면 도트와 게이지가 함께 오르는지 확인.

- [ ] **Step 5: 커밋** — `feat: add week card normal view with gauge and other row`

---

### Task 9: 항목 드로어

**Files:**
- Create: `src/renderer/features/week/ItemDrawer.tsx`, `useDrawer.ts`
- Modify: `src/renderer/features/week/WeekItemRow.tsx`, `src/shared/ipc/{channels,contracts,api}.ts`, `src/preload/index.ts`, `src/main/ipc/week.ts`
- Test: `ItemDrawer.test.tsx`

**Interfaces:**
- Consumes: `api.week.drawer`, `api.week.pullFromDrawer`, `api.week.unplanned`
- Produces: `<ItemDrawer itemId={...} />`

- [ ] **Step 1: 실패하는 테스트 작성**
  - 캐럿 클릭으로 인라인 펼침, **모달이 아니다** (`role="dialog"` 를 쓰지 않는다), 동시에 하나만 열린다
  - 조각 0개: 목록 영역 없이 `오늘 할 몫을 쪼개서 적어요 — 이게 첫 조각이 돼요` 만
  - 조각 ≥ 1: 라벨 `이 할당의 조각 — 오늘 할 것을 고르세요`, 새 입력 라벨 `또는 새 조각 추가`
  - `inToday` 인 조각은 상태 라벨 `오늘 목록에` + 선택 불가
  - 항목 완료 상태: `오늘로 가져오기` 비활성 + `완료된 할당이에요 — 해제하면 다시 가져올 수 있어요`
  - `보내주기`는 확인 1회 (`이 할당을 보내줄까요? 지금까지 한 집중과 조각은 남아요.`), `--danger` 는 **hover 에만**
  - 기타 행 드릴다운: 두 그룹(`이름을 남긴 것` / `이름 없는 집중`)이 **읽기 전용** — 생성·pull·완료·폐기 버튼 0개
  - 원클릭 pull 이 `pulled === null` 로 오면 드로어가 열린다 (§3.1 폴백)

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 기타 행 드릴다운용 채널 `week:unplanned` 를 추가한다 (req `[z.string()]`, res `strictObject({ named: array(strictObject({ title, spentPomos })), anonymousPomos })`). 채널 추가 4곳 규칙을 지킨다.

  `이름 없는 집중` 문구는 `뽀모 N — 어떤 일에도 연결되지 않았어요` 한 줄이다.

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS. `pnpm dev`: 조각 0개 항목의 `+ 오늘로` → 드로어 열림 → 새 조각 적고 `오늘로 가져오기` → 오늘 목록에 등장.

- [ ] **Step 5: 커밋** — `feat: add inline item drawer with first-piece creation flow`

---

### Task 10: 플래너 모드

**Files:**
- Create: `src/renderer/features/week/Planner.tsx`, `usePlanner.ts`
- Modify: `src/renderer/features/week/WeekCard.tsx`
- Test: `Planner.test.tsx`

**Interfaces:**
- Consumes: `api.week.planDraft`, `api.week.confirmPlan`, `useClock()`
- Produces: `<Planner />` — `WeekCard` 의 두 번째 모드

- [ ] **Step 1: 실패하는 테스트 작성**
  - ⓞ 편집 대상 주: 2개 세그먼트(`이번 주`·`다음 주`)가 **항상** 렌더된다. 드롭다운으로 접지 않는다
  - 기본 선택이 `week_of(오늘 + plan_lead_days)` 다 — 일요일 목킹이면 `다음 주`, 평일이면 `이번 주`
  - **라벨 파생**: 선택이 `다음 주` 면 헤더·확정 버튼이 모두 "다음 주" (요일에서 직접 파생하지 않는다 — R5·A5)
  - ① 예산: `prefill === null` 이면 입력이 비어 있고 `예산을 정하면 과적을 알려줘요` 가 뜬다
  - ② 항목: est 스테퍼 하한 1 — 1에서 감소를 눌러도 0이 되지 않는다 (A6)
  - ③ 요일 칩 7개가 **월요일부터** 배열된다
  - ④ 과적: est 합 > 예산이면 `+N 과적이에요. 예상 뽀모를 줄일까요, 항목을 덜어낼까요?` 가 뜨고, **`--danger`·경고 아이콘 0개**이며 확정 버튼이 **활성**이다 (A29)
  - ④ 과적 안내에 `다음 주` 라는 단어가 등장하지 않는다 (R22 — 이 화면에 없는 액션 금지)
  - `×` 의 두 의미: 신규 초안 행은 확인 없이 사라지고, **기존 항목 행은 제거되지 않고 `보내줄 예정` 취소선 + 되돌리기 링크로 바뀐다** (§5.3.1)
  - capacity 미설정: 부하 그래프의 **막대는 그려지고 기준선이 없다** (§5.5)
  - 확정 후 편집 대상이 `다음 주` 였으면 안내 `다음 주 계획을 저장했어요 — 다음 주가 되면 여기에 보여요.`

- [ ] **Step 2: 실행해 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 5단계를 한 화면에 위에서 아래로 쌓는다. 마법사·단계 전환 없음.

  편집 대상 주 전환 시 미저장 변경이 있으면 확인 1회: `고치던 내용이 있어요 — 저장하지 않고 다른 주로 갈까요?` (`--danger` 금지).

  요일 칩 토글은 부분 갱신으로 처리해 **제목 입력 포커스를 잃지 않게** 한다 (§5.4).

  부하 = `Σ(항목 est / 배정 요일 수)`, 배정된 요일에만 분산. **미배치 항목은 산입하지 않는다.**

- [ ] **Step 4: 통과 확인** — `pnpm test` PASS. `pnpm dev` 전 구간 수동 검증: 플래너 → 항목 2개 → 확정 → 일반 뷰에 등장 → `+ 오늘로` → 타이머 → 도트 상승.

- [ ] **Step 5: 커밋** — `feat: add planner mode with week target toggle and non-blocking warnings`

---

### Task 11: 미결 종결 문서화 + 마무리 검증

**Files:**
- Modify: `docs/features/week-plan/prd.md`(R9 가정 블록), `PRODUCT.md`, `README.md`

- [ ] **Step 1: R9 미결 종결 반영** — `docs/features/week-plan/prd.md` R9 의 `> ⚠️ 가정:` 블록을 결정으로 교체한다. 표시하지 않기로 한 이유(두 값이 독립적이라는 R9 자체의 정의 + 원칙 6)를 남기고, 근거로 이 계획서와 설계 스펙을 인용한다. **가정 블록을 조용히 지우지 않는다** — 결정으로 바뀌었음을 본문에 적는다.

- [ ] **Step 2: 전체 검증 일괄 실행** — `pnpm test && pnpm lint && pnpm typecheck && pnpm format:check && pnpm build` 전부 0 에러.

- [ ] **Step 3: 코어 루프 수동 검증 체크리스트**
  - 계획 0개 상태에서 타이머·오늘 목록이 여전히 전부 동작한다 (원칙 1)
  - 플래너 확정 → 일반 뷰 → `+ 오늘로` → 재생 → 완료 → **항목 도트와 주간 게이지가 함께** 오른다
  - 조각 0개 항목의 `+ 오늘로` 가 드로어를 연다
  - 항목을 초안에서 `×` 하고 확정 → 목록에서 사라지되 주간 총 소진은 그대로, 그 소진이 기타 행에 나타난다
  - 일요일로 시스템 시계를 옮기고 플래너를 열면 `다음 주` 가 기본 선택이고, `이번 주` 로 바꾸면 이번 주 항목이 초안에 채워진다
  - 예산 20 · 소진 23 상태에서 빨간색·경고 아이콘이 없다

- [ ] **Step 4: 문서 갱신** — PRODUCT.md·README 의 구현 현황을 M3a 상태로 갱신하고, README 계획 표에 이 계획서 행을 추가한다. 마일스톤 지도를 `M3a 완료 → M3b 정산(다음)` 으로 옮긴다.

- [ ] **Step 5: 커밋** — `docs: close the r9 open question and update status after m3a`

---

## 자기 점검 (계획 작성 후 스펙 대조)

- **스펙 §3(가용량 미설정 4경로)** → Task 1(프리필 null)·Task 8(게이지 `미설정`)·Task 10(예산 힌트·부하 기준선 없음)에 분산 반영.
- **스펙 §4.1(술어 한 곳)** → Task 2 Step 3 의 `listForWeek` 안에만 존재. 다른 태스크가 세션을 세지 않는다.
- **스펙 §4.2(차액)** → Task 2 의 `otherRowSpent` + Task 5 의 `weekSummary` 조립. 정의역 확정은 계획서 상단 별도 절.
- **스펙 §5(선언형 확정)** → Task 3.
- **스펙 §6(R9 종결)** → Task 11 Step 1 에서 문서 반영.
- **스펙 §7(무효화)** → Task 6. 이벤트 채널을 추가하지 않는다는 사실을 파일 구조 절과 Task 6 머리에 두 번 적었다.
- **스펙 §8(ClockGate)** → Task 8 Step 3.
- **스펙 §10(함정 7개)** → 각각 Task 1(planned_at)·2(local_week)·3(ID 매칭·폐기≠삭제)·7(neutral 도트)·8(ClockGate)의 테스트로 내려갔다. 이월 배지 계산식은 M3a 가 표시만 하므로 Task 8 의 렌더 계약에서 `originWeek` 파생으로 확인한다.
- **타입 일관성**: `WeekItemRow`(Task 2) → `weekItemRowSchema`(Task 5) 필드가 1:1 이다. `PlanDraftItem`(Task 3) → `planDraftItemSchema`(Task 5) 도 마찬가지. `itemWeek` 라는 이름을 Task 4·5·6 에서 동일하게 쓴다 (M2 의 `pull-changed` payload 와 같은 이름).
