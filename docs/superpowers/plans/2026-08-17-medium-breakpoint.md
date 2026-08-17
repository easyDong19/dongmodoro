# 미디엄 구간 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 창 폭 720–1199px 에서 MONTH 컬럼을 접고 우측 오버레이로 전환해, 화면 절반 크기의 창에서도 타이머가 눌리지 않게 한다.

**Architecture:** `useBreakpoint()` 훅 하나가 `matchMedia` 로 구간(`wide` / `medium`)을 판정하고, `App` 이 그 값으로 MONTH 컬럼을 자리에 두거나 오버레이로 넘긴다. 마일스톤·캘린더 카드 묶음은 `MonthColumn` 한 컴포넌트로 뽑아 두 자리가 같은 것을 렌더한다. 오버레이는 우측 계획 컬럼(WEEK·TODAY) 위를 덮으므로 타이머는 어떤 상태에서도 가려지지 않는다.

**Tech Stack:** React 19 · TypeScript · Tailwind v4 · vitest + @testing-library/react · Electron (main 프로세스의 `BrowserWindow`)

**Spec:** [docs/superpowers/specs/2026-08-17-medium-breakpoint-design.md](../specs/2026-08-17-medium-breakpoint-design.md)

## Global Constraints

- **경계값 리터럴은 `src/shared/layout/breakpoints.ts` 한 곳에만 존재한다.** 다른 파일에 `720` · `1200` 을 직접 적지 않는다 (design-system ADR-001 §2).
- **UI 에 이모지 금지.** 아이콘은 lucide-react 컴포넌트만 쓴다 (principles §6).
- **색·radius·모션·레이어는 토큰 이름으로만.** raw hex/px 직접 기입 금지 (principles §5).
- **커밋 메시지는 제목·본문 전부 영어.** Conventional Commits 형식. 한글은 백틱 안에서도 로컬 커밋에서는 금지다 (`commit-msg` 훅이 한글 0건을 강제한다).
- **도메인 용어는 CONTEXT.md 를 따른다** — `할 일`(작업·태스크 아님), `정산`(리뷰 아님), `뽀모`(뽀모도로 아님).
- **카드의 `aria-label` 소유자는 셸의 `<section>` 하나뿐이다.** 카드 컴포넌트가 같은 이름을 또 붙이면 같은 이름의 region 이 중첩되어 `getByRole('region')` 이 갈라진다.
- 모든 테스트 명령은 워크트리 루트에서 `pnpm vitest run <path>` 로 실행한다.

---

### Task 1: 브레이크포인트 상수와 `useBreakpoint` 훅

구간 판정의 단일 출처를 만든다. 이 태스크가 끝나도 화면은 아무것도 변하지 않는다 — 훅을 아직 아무도 쓰지 않기 때문이다.

**Files:**
- Create: `src/shared/layout/breakpoints.ts`
- Create: `src/renderer/shared/layout/useBreakpoint.ts`
- Create: `src/renderer/shared/layout/testViewport.ts`
- Test: `src/renderer/shared/layout/useBreakpoint.test.ts`

**Interfaces:**
- Produces: `BP_MEDIUM: 720` · `BP_WIDE: 1200` · `type Breakpoint = 'wide' | 'medium'` (from `@shared/layout/breakpoints`)
- Produces: `useBreakpoint(): Breakpoint` (from `@renderer/shared/layout/useBreakpoint`)
- Produces: `installMatchMedia(): void` · `setViewportWidth(width: number): void` (from `@renderer/shared/layout/testViewport`) — 테스트 전용
- Consumes: 없음

**설계 메모 — 미디어 쿼리가 하나뿐인 이유.** 구간이 셋이면 쿼리도 둘일 것 같지만, 이번 범위에서 내로우는 창 최소 폭(Task 6)으로 진입 자체를 막는다. 따라서 `(min-width: 1200px)` 하나로 `wide` / `medium` 이 갈린다. 720px 미만은 훅 입장에서 `medium` 으로 보이며, 그 폭에 도달할 방법이 없다는 것이 그 판정을 무해하게 만든다.

**설계 메모 — 폴백이 `wide` 인 이유.** `matchMedia` 가 없는 환경(기존 테스트의 jsdom)에서 `wide` 로 떨어진다. 이 폴백이 있어야 `matchMedia` 를 목으로 세우지 않은 기존 794개 테스트가 지금 그대로 통과한다.

- [ ] **Step 1: 테스트 헬퍼를 먼저 만든다**

jsdom 에는 `matchMedia` 가 없어, 구간을 만들려면 목을 세우는 수밖에 없다. 두 테스트 파일이 같이 쓸 것이므로 헬퍼로 뽑는다.

`src/renderer/shared/layout/testViewport.ts`:

```ts
/**
 * **테스트 전용.** jsdom 에는 `matchMedia` 가 없어서 구간을 만들 방법이 이것뿐이다.
 *
 * 실제 브라우저의 `MediaQueryList` 는 창이 바뀌면 `matches` 가 따라 바뀌고 `change` 가
 * 발화한다. 그 두 가지만 흉내 낸다 — `matches` 를 게터로 두어 폭이 바뀌면 즉시 따라오게
 * 하고, 등록된 리스너를 폭 변경 시 전부 호출한다.
 */
type Listener = () => void

const listeners = new Set<Listener>()
let currentWidth = 1280

/** 현재 창 폭을 바꾸고 구독자에게 알린다. `act()` 안에서 호출한다. */
export function setViewportWidth(width: number): void {
  currentWidth = width
  for (const listener of [...listeners]) listener()
}

/** `window.matchMedia` 를 목으로 세운다. 각 테스트의 `beforeEach` 에서 호출한다. */
export function installMatchMedia(width = 1280): void {
  currentWidth = width
  listeners.clear()

  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? '0')
    return {
      get matches() {
        return currentWidth >= min
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => void listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => void listeners.delete(listener),
      addListener: (listener: Listener) => void listeners.add(listener),
      removeListener: (listener: Listener) => void listeners.delete(listener),
      dispatchEvent: () => false
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/renderer/shared/layout/useBreakpoint.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { installMatchMedia, setViewportWidth } from './testViewport'
import { useBreakpoint } from './useBreakpoint'

describe('useBreakpoint — 구간 판정 (design-system ADR-001)', () => {
  beforeEach(() => installMatchMedia())

  it('1200px 이상은 와이드다', () => {
    installMatchMedia(1200)
    expect(renderHook(() => useBreakpoint()).result.current).toBe('wide')
  })

  it('1199px 은 미디엄이다 — 경계는 이상/미만이다', () => {
    installMatchMedia(1199)
    expect(renderHook(() => useBreakpoint()).result.current).toBe('medium')
  })

  it('720px 은 미디엄이다', () => {
    installMatchMedia(720)
    expect(renderHook(() => useBreakpoint()).result.current).toBe('medium')
  })

  it('창을 좁히면 와이드에서 미디엄으로 따라 바뀐다', () => {
    installMatchMedia(1280)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('wide')

    act(() => setViewportWidth(900))
    expect(result.current).toBe('medium')

    act(() => setViewportWidth(1280))
    expect(result.current).toBe('wide')
  })

  it('matchMedia 가 없는 환경에서는 던지지 않고 와이드로 떨어진다', () => {
    // @ts-expect-error — 판정 수단이 없는 환경을 재현한다
    delete window.matchMedia
    expect(() => renderHook(() => useBreakpoint())).not.toThrow()
    expect(renderHook(() => useBreakpoint()).result.current).toBe('wide')
  })

  it('언마운트하면 리스너를 정리한다', () => {
    installMatchMedia(1280)
    const { unmount } = renderHook(() => useBreakpoint())
    unmount()
    // 정리되지 않았다면 이 호출이 언마운트된 훅의 setState 를 때려 경고가 난다
    expect(() => act(() => setViewportWidth(900))).not.toThrow()
  })
})
```

- [ ] **Step 3: 테스트가 실패하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/shared/layout/useBreakpoint.test.ts`
Expected: FAIL — `Failed to resolve import "./useBreakpoint"`

- [ ] **Step 4: 상수 파일을 만든다**

`src/shared/layout/breakpoints.ts`:

```ts
/**
 * 반응형 구간 경계. **값의 출처는 [tokens.md §4](../../../docs/design-system/tokens.md)** 이고
 * 이 파일은 그 이식본이다 — 코드에서 경계값 리터럴이 존재하는 유일한 자리다.
 *
 * 미디어 쿼리는 `var()` 를 해석하지 못해 CSS 커스텀 프로퍼티로 소비할 수 없다. 그래서
 * 브레이크포인트만은 토큰 체계의 예외로 여기에 물질화한다 (design-system ADR-001 §2).
 *
 * main 프로세스도 이 파일을 읽는다 — 창 최소 폭이 미디엄 하한과 같은 값이어야 하고,
 * 두 곳에 적으면 한쪽만 고쳐지는 날이 온다.
 */
export const BP_MEDIUM = 720
export const BP_WIDE = 1200

export type Breakpoint = 'wide' | 'medium'
```

- [ ] **Step 5: 훅을 만든다**

`src/renderer/shared/layout/useBreakpoint.ts`:

```ts
import { useEffect, useState } from 'react'
import { BP_WIDE, type Breakpoint } from '@shared/layout/breakpoints'

const QUERY = `(min-width: ${BP_WIDE}px)`

function read(): Breakpoint {
  return (window.matchMedia?.(QUERY).matches ?? true) ? 'wide' : 'medium'
}

/**
 * 창 폭 구간 판정 **한 곳** (design-system ADR-001).
 *
 * **CSS 미디어 쿼리로 나누지 않는 이유:** app-shell ux-spec §5 는 "와이드에서 미디엄으로
 * 넘어오면 MONTH 오버레이가 열린 상태로 진입한다"를 요구한다. 이것은 상태가 아니라
 * **전환** 에 반응하는 규칙이라 CSS 로는 표현할 수 없다. 판정이 CSS 와 JS 두 곳에 있으면
 * 값이 어긋나는 순간 "레이아웃은 미디엄인데 토글은 안 보인다"가 된다.
 *
 * **쿼리가 하나뿐인 이유:** 내로우 구간은 창 최소 폭(`BP_MEDIUM`)으로 진입 자체를 막으므로
 * 판정에 등장할 일이 없다.
 *
 * `matchMedia` 가 없는 환경에서는 `wide` 로 떨어진다 — 판정 실패가 카드를 감추는 쪽으로
 * 기울면 안 된다.
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(read)

  useEffect(() => {
    const mql = window.matchMedia?.(QUERY)
    if (!mql) return
    const onChange = (): void => setBreakpoint(mql.matches ? 'wide' : 'medium')
    onChange() // 마운트와 구독 사이에 폭이 바뀌었을 수 있다
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return breakpoint
}
```

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/shared/layout/useBreakpoint.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: 전량 회귀를 확인한다**

Run: `pnpm vitest run`
Expected: PASS — 794 + 6 tests, 0 failures

- [ ] **Step 8: 커밋**

```bash
git add src/shared/layout/breakpoints.ts src/renderer/shared/layout/
git commit -m "feat(shell): add a single source for the responsive range" -m "Media queries cannot read CSS custom properties, so the breakpoint values
are materialized in one shared module that both processes read.

The hook resolves to wide when matchMedia is missing, which keeps the
existing jsdom suites on the wide layout without mocking anything.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `MonthColumn` 추출

마일스톤 카드 + 캘린더 카드 묶음을 컴포넌트로 뽑는다. 와이드 컬럼과 미디엄 오버레이가 **같은 것** 을 렌더하게 만드는 것이 목적이다. 이 태스크의 결과로 화면은 여전히 변하지 않는다.

**Files:**
- Create: `src/renderer/features/shell/MonthColumn.tsx`
- Modify: `src/renderer/app/App.tsx` (34–59행 — `DisplayMonthProvider` 블록을 `<MonthColumn />` 로 교체)
- Test: `src/renderer/app/App.test.tsx` (기존 파일 — 추가 없이 그대로 통과해야 한다)

**Interfaces:**
- Consumes: 없음
- Produces: `MonthColumn(): JSX.Element` — 자체적으로 `DisplayMonthProvider` 를 감싸고, `Milestone` · `캘린더` 두 `<section>` 의 `aria-label` 을 소유한다

**설계 메모 — 라벨 소유권이 옮겨간다.** 지금은 `App.tsx` 의 `<section>` 이 라벨을 소유한다. 그 `<section>` 이 통째로 `MonthColumn` 으로 이사하므로 소유자도 함께 옮겨간다. **소유자가 여전히 한 곳** 이라는 규칙은 지켜진다 — 카드 컴포넌트(`MilestoneCard`)가 라벨을 또 붙이는 것이 금지 대상이지, 셸 컴포넌트가 나뉘는 것은 아니다.

- [ ] **Step 1: 기존 테스트가 지금 통과하는 것을 확인한다 (기준선)**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: PASS (8 tests). 이 태스크는 새 테스트를 쓰지 않는다 — 기존 테스트 4개(`카드 표면` · `MONTH 컬럼` · `카드 이름 5개`)가 이미 리팩터링의 안전망이다.

- [ ] **Step 2: `MonthColumn` 을 만든다**

`src/renderer/features/shell/MonthColumn.tsx`:

```tsx
import { CalendarCard } from '@renderer/features/calendar/CalendarCard'
import { DisplayMonthProvider } from '@renderer/features/calendar/DisplayMonthProvider'
import { MilestoneCard } from '@renderer/features/milestones/MilestoneCard'

/**
 * MONTH 묶음 — 마일스톤 카드 + 캘린더 카드 (app-shell ux-spec §2).
 *
 * **컴포넌트로 뽑은 이유는 재사용이 아니라 동일성이다.** 와이드에서는 좌 컬럼이,
 * 미디엄에서는 오버레이(`MonthOverlay`)가 이것을 렌더한다. 두 자리가 각자 카드를 배치하면
 * 구성이 바뀔 때 한쪽만 고쳐지고, 그 사고는 창을 넓혔다 좁혀야만 보인다.
 *
 * 두 카드를 **인접 배치** 하는 것이 §2 의 요구다 — 캘린더의 달 이동이 마일스톤 카드를
 * 함께 바꾸는 것이 시야 안에서 일어나야 한다. `DisplayMonthProvider` 가 그 묶음을 감싸고,
 * 표시 대상 월의 소유자는 캘린더다 (calendar-records R26).
 */
export function MonthColumn() {
  return (
    <DisplayMonthProvider>
      <div className="flex h-full w-[300px] min-h-0 flex-col gap-6">
        {/* 높이는 **컬럼의 40% 고정**이다 — 내용이 아니라 뷰포트에서만 결정된다.
            min~max 사이에서 내용 따라 자라는 구간을 두면 항목을 추가할 때마다 아래
            캘린더가 눈에 띄게 밀린다 (2026-08-16 decision-log Q7). 내용이 짧으면
            카드 안이 비고, 길면 카드 안에서 스크롤한다 (MilestoneCard).

            min-h 148px 는 작은 창의 하한이다 — 편집 모드(항목 2개) 실측 높이로,
            창이 낮아 40% 가 이보다 작아지면 카드가 내용을 못 담는다.

            flex 컨테이너인 이유: 자식(MilestoneCard)이 이 고정 높이를 넘을 때
            줄어드는 길이 flex 수축(min-h-0)이다. */}
        <section
          className="card flex h-[40%] min-h-[148px] shrink-0 flex-col overflow-hidden p-4"
          aria-label="Milestone"
        >
          <MilestoneCard />
        </section>
        <section className="card min-h-0 flex-1 overflow-hidden p-4" aria-label="캘린더">
          <CalendarCard />
        </section>
      </div>
    </DisplayMonthProvider>
  )
}
```

- [ ] **Step 3: `App.tsx` 에서 그 블록을 교체한다**

`App.tsx` 의 `<DisplayMonthProvider>` 부터 `</DisplayMonthProvider>` 까지(34–59행)를 `<MonthColumn />` 한 줄로 바꾼다. 함께 정리할 것:

- import 에서 `CalendarCard` · `DisplayMonthProvider` · `MilestoneCard` 를 제거하고 `MonthColumn` 을 추가한다.
- 상단 주석의 `` `DisplayMonthProvider` 가 그 컬럼을 감싸고 `` 문장을 `` MONTH 묶음은 `MonthColumn` 이 소유한다 `` 로 고친다.

- [ ] **Step 4: 기존 테스트가 그대로 통과하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: PASS (8 tests). 특히 `마일스톤과 캘린더가 같은 컬럼에 인접해 있다` 와 `카드 이름 5개가 각각 정확히 하나의 region 을 가리킨다` 가 통과해야 한다 — 이 둘이 추출이 구조를 바꾸지 않았음을 증명한다.

- [ ] **Step 5: 전량 회귀를 확인한다**

Run: `pnpm vitest run`
Expected: PASS — 0 failures

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/features/shell/MonthColumn.tsx src/renderer/app/App.tsx
git commit -m "refactor(shell): extract the month pair into one component" -m "The wide column and the upcoming medium overlay must render the same two
cards. Keeping the composition in two places would let one of them drift,
and the drift would only show after resizing the window.

Pure move: no test changes, the existing shell suites are the safety net.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 미디엄에서 MONTH 컬럼을 접고 타이틀바에 토글을 낸다

여기서 처음으로 화면이 바뀐다. 오버레이는 아직 없다 — 토글을 눌러도 열리지 않는다. 다음 태스크가 그 자리를 채운다.

**Files:**
- Create: `src/renderer/features/shell/MonthToggle.tsx`
- Modify: `src/renderer/features/shell/TitleBar.tsx`
- Modify: `src/renderer/app/App.tsx`
- Test: `src/renderer/app/App.test.tsx` (`setup` 에 옵션 추가 + describe 추가)

**Interfaces:**
- Consumes: `useBreakpoint()` (Task 1), `installMatchMedia` · `setViewportWidth` (Task 1), `MonthColumn` (Task 2)
- Produces: `MonthToggle({ open, onToggle }: { open: boolean; onToggle: () => void }): JSX.Element`
- Produces: `TitleBar({ monthToggle }: { monthToggle?: { open: boolean; onToggle: () => void } | null })` — `monthToggle` 이 없거나 `null` 이면 토글을 그리지 않는다
- Produces: `App` 이 `monthOpen` 상태를 소유한다 (다음 태스크가 이 값을 오버레이에 넘긴다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

먼저 `App.test.tsx` 의 `setup` 이 구간을 받을 수 있게 고친다. 시그니처를 이렇게 바꾼다:

```tsx
import { installMatchMedia, setViewportWidth } from '@renderer/shared/layout/testViewport'

function setup({
  clockNow,
  viewportWidth
}: {
  clockNow: () => Promise<typeof clock>
  viewportWidth?: number
}) {
  // 폭을 주지 않은 호출은 matchMedia 를 세우지 않는다 — useBreakpoint 가 wide 로 떨어져
  // 기존 테스트들이 지금까지와 똑같은 화면을 본다.
  if (viewportWidth !== undefined) installMatchMedia(viewportWidth)

  const qc = new QueryClient({ /* 기존 그대로 */ })
  // …window.api 목은 기존 그대로…
}
```

그리고 새 describe 를 파일 끝에 추가한다:

```tsx
describe('App — 미디엄 구간 (app-shell ux-spec §3)', () => {
  it('와이드에서는 MONTH 컬럼이 자리에 있고 타이틀바에 토글이 없다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 1280 })
    await screen.findByLabelText('타이머')

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    expect(screen.getByLabelText('캘린더')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MONTH' })).not.toBeInTheDocument()
  })

  it('미디엄에서는 MONTH 컬럼이 접히고 토글이 나온다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('캘린더')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MONTH' })).toBeInTheDocument()
  })

  it('미디엄에서도 타이머와 계획 카드는 그대로 남는다 — 접히는 것은 계획 레이어 순서다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    expect(screen.getByLabelText('타이머')).toBeInTheDocument()
    expect(screen.getByLabelText('Sprint')).toBeInTheDocument()
    expect(screen.getByLabelText('오늘 목록')).toBeInTheDocument()
  })

  it('콜드 스타트는 접힘이다 — 토글이 눌리지 않은 상태로 시작한다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('타이머 섹션에 최소 폭이 있다 — 폭이 모자랄 때 타이머만 눌리지 않게', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    const timer = await screen.findByLabelText('타이머')

    expect(timer.className).toContain('min-w-[288px]')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: FAIL — `미디엄에서는 MONTH 컬럼이 접히고 토글이 나온다` 에서 `Milestone` 이 여전히 문서에 있다

- [ ] **Step 3: `MonthToggle` 을 만든다**

`src/renderer/features/shell/MonthToggle.tsx`:

```tsx
import { PanelRight } from 'lucide-react'

/**
 * 미디엄 구간의 MONTH 오버레이 토글 (app-shell ux-spec §3.1).
 *
 * 자리는 테마 세그먼트 **왼쪽** 이다 (§1.1 표). 창 컨트롤이 놓이는 변은 OS 관용구를 따르고,
 * 그 영역을 비켜 가는 것은 `.titlebar-content` 의 `env(titlebar-area-*)` 가 한다 —
 * 여기서 플랫폼별 상수를 박지 않는다.
 *
 * 아이콘이 `PanelLeft` 가 아니라 `PanelRight` 인 이유: 오버레이가 우측 계획 컬럼 위를
 * 덮기 때문이다. 왼쪽에서 열리면 좁은 창에서 타이머를 가리게 되고, 그러면 "열린 동안에도
 * 타이머를 조작할 수 있다"(PRD R10)가 말뿐이 된다.
 *
 * `aria-pressed` 로 열림 상태를 말한다 — 아이콘 하나짜리 토글은 그 아이콘이 "지금 상태"인지
 * "누르면 될 것"인지 말해주지 않으므로, 상태는 속성이 전달한다.
 *
 * **`.seg` 로 감싸는 것이 장식이 아닌 이유:** 그 클래스가 `-webkit-app-region: no-drag` 를
 * 준다. 타이틀바는 드래그 영역이라 이것이 없으면 버튼을 눌러도 눌리지 않고 창이 끌린다
 * (global.css `.seg`). 눌림 상태 스타일(`.seg button[aria-pressed='true']`)도 함께 온다.
 */
export function MonthToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="seg">
      <button
        type="button"
        aria-pressed={open}
        aria-label="MONTH"
        title="MONTH"
        onClick={onToggle}
        className="gap-1.5"
      >
        {/* 이모지 금지 — 아이콘은 lucide 컴포넌트로만 (principles §6). */}
        <PanelRight size={14} aria-hidden="true" />
        <span>MONTH</span>
      </button>
    </div>
  )
}
```

- [ ] **Step 4: `TitleBar` 가 토글을 받게 고친다**

`TitleBar.tsx`:

```tsx
import { dayLabel } from '@shared/time'
import { useClock } from '@renderer/shared/query/useClock'
import { ThemeToggle } from './ThemeToggle'
import { MonthToggle } from './MonthToggle'

/**
 * 커스텀 타이틀바 (app-shell ux-spec §1.1).
 *
 * 슬롯 순서는 좌측 앱 이름 → (여백) → MONTH 토글 → 테마 세그먼트 → 날짜 라벨이다.
 * 창 컨트롤이 놓이는 변은 OS 관용구를 따르며 여기서 그리지 않는다 — 그 영역을 비켜 가는
 * 것은 CSS 의 `env(titlebar-area-*)` 가 한다 (global.css `.titlebar-content`).
 *
 * **MONTH 토글은 미디엄 구간 전용이다.** 그 판정을 여기서 하지 않고 `App` 이 넘겨주는
 * 이유는, 토글이 여닫는 상태의 소유자가 `App` 이기 때문이다 — 판정과 상태가 갈라지면
 * 구간 전환 시 둘을 맞추는 코드가 양쪽에 생긴다.
 *
 * 날짜는 `useClock()` 이 전역 단일 출처로 들고 있는 값이라, 자정을 넘으면
 * `clock:boundary` 이벤트가 캐시를 갱신하면서 라벨도 함께 따라온다.
 */
export function TitleBar({
  monthToggle
}: {
  monthToggle?: { open: boolean; onToggle: () => void } | null
}) {
  const { dayKey } = useClock()

  return (
    <header className="titlebar">
      <div className="titlebar-content">
        <span className="text-ink-dim">dongmodoro</span>
        <span className="flex-1" />
        {monthToggle ? <MonthToggle {...monthToggle} /> : null}
        <ThemeToggle />
        <span className="text-ink-dim">{dayLabel(dayKey)}</span>
      </div>
    </header>
  )
}
```

- [ ] **Step 5: `App` 이 구간으로 분기하게 고친다**

`App.tsx` 의 본문을 이렇게 바꾼다 (import 에 `useState` · `useBreakpoint` 추가):

```tsx
export function App() {
  useEffect(() => subscribeMainEvents(queryClient), [])

  const breakpoint = useBreakpoint()
  const [monthOpen, setMonthOpen] = useState(false)
  const isWide = breakpoint === 'wide'

  return (
    <ClockGate>
      <div className="flex h-screen flex-col">
        <TitleBar
          monthToggle={
            isWide ? null : { open: monthOpen, onToggle: () => setMonthOpen((open) => !open) }
          }
        />
        {/* `main` 은 global.css 가 이미 `position: relative` 로 두었다 (광원 위에 콘텐츠를
            올리는 장치). 다음 태스크의 오버레이가 그것을 기준으로 삼으므로 여기에 `relative`
            유틸리티를 또 붙이지 않는다. */}
        <main className="flex min-h-0 flex-1 items-stretch justify-center gap-6 p-6">
          {isWide ? <MonthColumn /> : null}
          <section
            className="card min-h-[320px] min-w-[288px] flex-1 overflow-hidden p-4"
            aria-label="타이머"
          >
            <TimerCard />
          </section>
          <div className="flex w-[360px] min-h-0 flex-col gap-6">
            <section className="card min-h-0 flex-1 overflow-hidden" aria-label="Sprint">
              <WeekCard />
            </section>
            <section className="card min-h-0 flex-1 overflow-hidden" aria-label="오늘 목록">
              <TodayList />
            </section>
          </div>
        </main>
      </div>
    </ClockGate>
  )
}
```

상단 주석도 함께 고친다. `**반응형은 여전히 만들지 않는다.**` 문단을 지우고 다음으로 바꾼다:

```tsx
  // 구간은 둘이다 — 와이드(3컬럼)와 미디엄(MONTH 접힘 + 오버레이). 내로우는 아직 없고,
  // 창 최소 폭(main/window.ts)이 그 구간 진입을 막는다.
  //
  // 타이머 섹션의 `min-w-[288px]` 은 창 하한과 짝이다. 타이머만 `flex-1`(기준 폭 0)이라
  // 좌우 고정폭을 뺀 나머지를 전부 받는 구조이고, 최소 폭이 없으면 폭이 모자랄 때
  // 사라지는 것이 하필 코어 루프가 된다.
```

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: PASS (13 tests)

- [ ] **Step 7: 전량 회귀를 확인한다**

Run: `pnpm vitest run`
Expected: PASS — 0 failures. 기존 셸 테스트들은 `viewportWidth` 를 주지 않으므로 와이드로 남는다.

- [ ] **Step 8: 커밋**

```bash
git add src/renderer/features/shell/MonthToggle.tsx src/renderer/features/shell/TitleBar.tsx src/renderer/app/App.tsx src/renderer/app/App.test.tsx
git commit -m "feat(shell): collapse the month column below the wide range" -m "Under 1200px the month pair leaves the row and a titlebar toggle takes its
place, so the timer keeps a usable width instead of absorbing every missing
pixel. The toggle opens nothing yet.

The timer section also gains a minimum width: it is the only column with a
zero flex basis, so without a floor it is the first thing to disappear.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: MONTH 오버레이

토글이 실제로 여닫는 것을 만든다. 오버레이는 우측 계획 컬럼 위를 덮고, 비모달이며, 닫는 경로는 셋뿐이다.

**Files:**
- Create: `src/renderer/features/shell/MonthOverlay.tsx`
- Modify: `src/renderer/app/App.tsx`
- Modify: `src/renderer/shared/styles/global.css` (슬라이드-인 키프레임)
- Test: `src/renderer/app/App.test.tsx`

**Interfaces:**
- Consumes: `MonthColumn` (Task 2), `App` 의 `monthOpen` 상태 (Task 3), `useReducedMotion()` (기존 — `@renderer/shared/ui/useReducedMotion`)
- Produces: `MonthOverlay({ onClose }: { onClose: () => void }): JSX.Element`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`App.test.tsx` 의 미디엄 describe 에 추가한다 (`userEvent` import 필요):

```tsx
import userEvent from '@testing-library/user-event'

  it('토글을 누르면 오버레이가 열리고 MONTH 카드가 나온다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    expect(screen.getByLabelText('캘린더')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('토글을 다시 누르면 닫힌다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
  })

  it('Esc 로 닫힌다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
  })

  it('오버레이 안 닫기 버튼으로 닫힌다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.click(screen.getByRole('button', { name: 'MONTH 닫기' }))

    expect(screen.queryByLabelText('Milestone')).not.toBeInTheDocument()
  })

  /**
   * 타이머 버튼은 정의상 오버레이 "밖"이다. 밖 클릭 닫힘을 두면 일시정지를 누를 때마다
   * 오버레이가 예고 없이 닫힌다 — 그래서 닫는 경로가 셋뿐이다 (ux-spec §3.1).
   */
  it('오버레이 밖(타이머)을 눌러도 닫히지 않고, 그 조작이 그대로 먹는다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))
    await userEvent.click(screen.getByRole('button', { name: '시작' }))

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    expect(window.api.timer.start).toHaveBeenCalled()
  })

  it('열릴 때 포커스가 오버레이 안으로 들어간다 — 갇히지는 않는다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    await userEvent.click(screen.getByRole('button', { name: 'MONTH' }))

    expect(screen.getByRole('button', { name: 'MONTH 닫기' })).toHaveFocus()
    // 비모달이므로 오버레이 밖 요소가 여전히 탭 순서에 있다 (ux-spec §8.1)
    expect(screen.getByRole('button', { name: '시작' })).not.toHaveAttribute('tabindex', '-1')
  })
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: FAIL — 토글을 눌러도 `Milestone` 이 나타나지 않는다

- [ ] **Step 3: `MonthOverlay` 를 만든다**

`src/renderer/features/shell/MonthOverlay.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useReducedMotion } from '@renderer/shared/ui/useReducedMotion'
import { MonthColumn } from './MonthColumn'

/**
 * 미디엄 구간의 MONTH 오버레이 (app-shell ux-spec §3.1).
 *
 * **덮는 대상은 우측 계획 컬럼(WEEK·TODAY)이다.** 좌측에서 열면 타이머를 덮게 되는데,
 * 같은 절의 비모달 규칙은 "열린 동안에도 타이머를 조작할 수 있다"(PRD R10)를 요구한다.
 * MONTH 와 WEEK·TODAY 는 둘 다 계획 레이어이므로, 좁은 화면에서 계획끼리 자리를 교대하는
 * 것이 "타이머가 코어 루프, 계획은 레이어" 원칙과 맞는다.
 *
 * **비모달이라 스크림도 포커스 트랩도 없다.** `Tab` 으로 오버레이 밖에 도달할 수 있어야
 * 한다 (§8.1). 열릴 때 포커스는 첫 요소(닫기 버튼)로 옮기되 가두지 않는다.
 *
 * **바깥 클릭으로 닫지 않는다.** 타이머 버튼은 정의상 "밖"이므로, 그 규칙을 두면 일시정지를
 * 누를 때마다 오버레이가 예고 없이 닫힌다. 닫는 경로는 토글 재클릭 · `Esc` · 닫기 버튼 셋뿐.
 */
export function MonthOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      // 모션 축소 선호에서는 전이 없이 즉시 표시한다 (§3.1 · design-system ADR-005 §2).
      data-motion={reduced ? 'reduced' : undefined}
      className="month-overlay absolute inset-y-6 right-6 z-[var(--layer-overlay)]"
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="MONTH 닫기"
        title="MONTH 닫기"
        onClick={onClose}
        className="absolute right-2 top-2 z-[var(--layer-sticky)] flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] border border-control-border bg-glass-strong text-ink"
      >
        <X size={14} aria-hidden="true" />
      </button>
      <MonthColumn />
    </div>
  )
}
```

- [ ] **Step 4: 슬라이드-인 모션을 `global.css` 에 넣는다**

파일 끝에 추가한다:

```css
/* MONTH 오버레이 슬라이드-인 (app-shell ux-spec §3.1).
   상태 변화를 전달하는 모션이라 허용되지만, 모션 축소 선호에서는 즉시 표시한다 —
   전역 `* { transition: none !important }` 킬은 폐기된 패턴이므로 속성으로 끈다
   (design-system ADR-005 §2). */
@keyframes month-overlay-in {
  from {
    transform: translateX(calc(100% + 24px));
    opacity: 0;
  }
}

.month-overlay {
  animation: month-overlay-in var(--motion-medium) var(--ease-standard);
}

.month-overlay[data-motion='reduced'] {
  animation: none;
}
```

- [ ] **Step 5: `App` 이 오버레이를 렌더하게 고친다**

`main` 의 마지막 자식으로 추가한다 (import 에 `MonthOverlay` 추가):

```tsx
          {!isWide && monthOpen ? <MonthOverlay onClose={() => setMonthOpen(false)} /> : null}
```

오버레이의 `absolute` 가 기준으로 삼는 것은 `global.css` 의 `main { position: relative }` 다 — Task 3 에서 확인했듯 이미 있으므로 새로 붙일 것이 없다.

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: PASS (19 tests)

- [ ] **Step 7: 전량 회귀를 확인한다**

Run: `pnpm vitest run`
Expected: PASS — 0 failures

- [ ] **Step 8: 커밋**

```bash
git add src/renderer/features/shell/MonthOverlay.tsx src/renderer/app/App.tsx src/renderer/app/App.test.tsx src/renderer/shared/styles/global.css
git commit -m "feat(shell): open the month pair as a non-modal overlay" -m "The overlay covers the planning column rather than the timer. Covering the
timer would make the non-modal promise hollow: the pause button would sit
under the panel that is supposed to leave it reachable.

Outside clicks do not close it for the same reason - the timer controls are
by definition outside, so that rule would dismiss the panel every time the
session is paused.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 구간 전환 연속성

"MONTH 를 보고 있었다"는 사실이 구간을 넘어 이어지게 한다 (ux-spec §5).

**Files:**
- Modify: `src/renderer/app/App.tsx`
- Test: `src/renderer/app/App.test.tsx`

**Interfaces:**
- Consumes: `setViewportWidth` (Task 1), `monthOpen` 상태 (Task 3), `MonthOverlay` (Task 4)
- Produces: 없음 (동작 규칙만 추가된다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`App.test.tsx` 에 describe 를 추가한다 (`act` import 필요):

```tsx
import { act } from '@testing-library/react'

describe('App — 구간 전환 연속성 (app-shell ux-spec §5)', () => {
  it('와이드 → 미디엄은 오버레이가 열린 상태로 진입한다 — 보고 있던 것이 이어진다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 1280 })
    await screen.findByLabelText('타이머')
    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()

    act(() => setViewportWidth(900))

    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
  })

  it('미디엄 → 와이드는 컬럼 자리로 복귀하고 토글이 사라진다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')

    act(() => setViewportWidth(1280))

    expect(screen.getByLabelText('Milestone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MONTH' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MONTH 닫기' })).not.toBeInTheDocument()
  })

  it('미디엄 안에서 닫아 둔 뒤 와이드를 거쳐 돌아오면 다시 열린다 — 규칙은 직전 조작이 아니라 전환이다', async () => {
    setup({ clockNow: () => Promise.resolve(clock), viewportWidth: 900 })
    await screen.findByLabelText('타이머')
    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'false')

    act(() => setViewportWidth(1280))
    act(() => setViewportWidth(900))

    expect(screen.getByRole('button', { name: 'MONTH' })).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: FAIL — 첫 테스트에서 `aria-pressed` 가 `"false"` 다

- [ ] **Step 3: 전환 감지를 구현한다**

`App.tsx` 에 추가한다 (import 에 `useRef` 추가):

```tsx
  const previousBreakpoint = useRef(breakpoint)

  /**
   * 와이드에서 미디엄으로 넘어오면 오버레이를 **열린 상태로** 연다 (ux-spec §5).
   * 와이드에서 MONTH 가 보이고 있었으므로 가시성이 이어지는 것이고, §3.1 의 "콜드 스타트
   * 접힘"은 그 실행에서 MONTH 를 아직 본 적이 없을 때의 초기값일 뿐이다.
   *
   * 상태가 아니라 **전환** 에 반응해야 해서 이전 값을 들고 있는다 — `breakpoint === 'medium'`
   * 만 보면 미디엄 안에서 닫을 때마다 즉시 다시 열린다.
   */
  useEffect(() => {
    const previous = previousBreakpoint.current
    previousBreakpoint.current = breakpoint
    if (previous === 'wide' && breakpoint === 'medium') setMonthOpen(true)
  }, [breakpoint])
```

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `pnpm vitest run src/renderer/app/App.test.tsx`
Expected: PASS (22 tests)

- [ ] **Step 5: 전량 회귀를 확인한다**

Run: `pnpm vitest run`
Expected: PASS — 0 failures

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/app/App.tsx src/renderer/app/App.test.tsx
git commit -m "feat(shell): carry month visibility across the range boundary" -m "Narrowing the window from the wide layout opens the overlay, because the
month pair was on screen a moment earlier and the fact of having been
looking at it should survive the resize.

Tracked as a transition rather than a state: reacting to the range alone
would reopen the panel every time it is dismissed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 창 최소 폭

내로우 구간이 없는 동안 그 구간에 진입할 수 없게 한다.

**Files:**
- Modify: `src/main/window.ts:35-37`
- Test: 없음 — main 프로세스의 `BrowserWindow` 설정은 단위 테스트 대상이 아니다. 검증은 Step 3 의 실행 확인이다.

**Interfaces:**
- Consumes: `BP_MEDIUM` (Task 1)
- Produces: 없음

- [ ] **Step 1: `minWidth` 를 준다**

`src/main/window.ts` 의 import 에 추가한다:

```ts
import { BP_MEDIUM } from '@shared/layout/breakpoints'
```

`new BrowserWindow({` 안의 `width` · `height` 아래에 넣는다:

```ts
    width: 1280,
    height: 800,
    /**
     * 내로우 구간(1컬럼 + 탭)은 아직 없다. 하한이 없으면 사용자가 그 구간까지 창을 줄일 수
     * 있고, 그 순간 미구현이 버그처럼 보인다 — 카드가 물리적으로 눌린 화면이 나온다.
     *
     * 값이 미디엄 하한과 같은 것은 우연이 아니라 정의다. 그래서 상수를 박지 않고
     * `BP_MEDIUM` 을 읽는다. 내로우가 구현되면 이 값을 그때의 하한으로 내린다.
     */
    minWidth: BP_MEDIUM,
```

- [ ] **Step 2: 타입 검사와 전량 테스트를 돌린다**

Run: `pnpm vitest run`
Expected: PASS — 0 failures

Run: `pnpm typecheck`
(스크립트 이름이 다르면 `package.json` 의 `scripts` 에서 타입 검사 스크립트를 확인해 그것을 쓴다.)
Expected: 오류 없음. 특히 main 프로세스가 `@shared` 별칭을 해석하는지 여기서 드러난다 — 실패하면 `electron.vite.config.ts` 의 main 쪽 `resolve.alias` 에 `@shared` 가 있는지 확인한다.

- [ ] **Step 3: 실제로 띄워 확인한다**

Run: `pnpm dev`

확인할 것:
1. 창을 1280 → 900 으로 줄이면 MONTH 컬럼이 사라지고 타이틀바에 MONTH 토글이 생기며, 오버레이가 열린 상태로 진입한다.
2. 토글·`Esc`·닫기 버튼으로 닫힌다. 타이머 버튼을 눌러도 닫히지 않는다.
3. 창을 계속 줄이면 720px 에서 더 줄어들지 않는다.
4. 720px 에서 타이머의 링·조절 칩·버튼 줄이 잘리지 않는다.

**앱은 사용자의 실데이터를 연다.** 확인은 읽기와 창 크기 조절까지만 하고, 할 일 추가·삭제나 타이머 시작으로 세션을 기록하지 않는다.

- [ ] **Step 4: 커밋**

```bash
git add src/main/window.ts
git commit -m "feat(shell): stop the window above the unimplemented range" -m "The narrow single-column layout does not exist yet, so the window now
refuses to shrink into it. Without the floor an unbuilt range reads as a
broken one.

The bound is the medium threshold by definition, so it reads the shared
constant instead of repeating the number.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 문서 갱신

경계값과 오버레이 방향이 바뀌었다. 결정을 문서에 남기지 않으면 다음 사람이 코드와 문서 중 어느 쪽이 맞는지 모른다.

**Files:**
- Create: `docs/design-system/decisions/adr-011-medium-range-revision.md`
- Modify: `docs/design-system/tokens.md` §4
- Modify: `docs/features/app-shell/ux-spec.md` §3·§3.1·§5
- Modify: `docs/design-system/decisions/adr-001-breakpoint-tokens.md` (상태 줄만)
- Test: 없음 — 문서 태스크다

**Interfaces:** 없음

- [ ] **Step 1: ADR-011 을 쓴다**

`docs/design-system/decisions/adr-011-medium-range-revision.md`. context / decision / consequences 세 섹션 필수. 담을 내용:

- **Context**: ADR-001 의 800px 은 시안 실측 전 추정치였다. 1512pt 화면의 절반 창은 756px 이라 그 경계로는 내로우가 되고, 미디엄을 구현해도 가장 흔한 배치가 대응되지 않는다. 오버레이 방향은 §3.1 의 "좌측 슬라이드-인 + 폭 300px" 이 같은 절의 비모달 규칙(PRD R10)과 충돌한다 — 756px 창에서 타이머 칸이 324px 이므로 좌측 오버레이가 타이머를 덮는다.
- **Decision**: (1) `--bp-medium` 을 720px 로 내린다. 근거는 실측이다 — 우측 컬럼 360px + 간격 24px + 여백 48px 을 뺀 288px 에 타이머 내용이 들어간다. (2) MONTH 오버레이는 우측에 붙어 WEEK·TODAY 위를 덮는다. (3) 내로우가 구현될 때까지 창 최소 폭을 `BP_MEDIUM` 으로 둔다.
- **Consequences**: (+) 절반 창이 미디엄에 들어온다. (+) 타이머가 어떤 상태에서도 가려지지 않아 비모달 규칙이 실제로 성립한다. (−) 미디엄 하한에서 타이머 폭이 288px 로 빠듯하다. (−) 내로우 구현 전까지 창 하한이 ADR-001 §3 의 목표치(~420px)보다 높다.
- **Supersedes**: ADR-001 **§1(경계값 표) 와 §3(최소 창 크기)** 을 대체한다. **§2(소비 방식)는 살아 있다** — 값의 출처가 tokens.md 이고 코드에 1회 물질화한다는 원칙은 그대로다.

- [ ] **Step 2: ADR-001 의 상태 줄에 superseded 표기를 단다**

본문은 이력으로 그대로 둔다. 상태 줄만 고친다:

```markdown
- 상태: partially superseded by [ADR-011](./adr-011-medium-range-revision.md) (2026-08-17) — §1·§3 대체, §2 유효
```

- [ ] **Step 3: tokens.md §4 를 고친다**

`--bp-medium` 값을 `720px` 로, 구간 설명을 `미디엄 (720–1199px)` 으로 바꾸고 근거 링크를 ADR-011 로 건다. 내로우 구간 줄에는 "현재 창 최소 폭으로 진입이 막혀 있다" 를 덧붙인다.

- [ ] **Step 4: ux-spec §3·§3.1·§5 를 고친다**

- §3 제목의 구간 범위를 새 경계로 맞춘다.
- §3.1 표의 `토글 위치` 행: 아이콘을 `PanelRight` 로. `열림` 행: "좌측에서 슬라이드-인" → "**우측에서 슬라이드-인 — WEEK·TODAY 컬럼 위를 덮는다.** 좌측에서 열면 좁은 창에서 타이머를 덮어 같은 표의 비모달 규칙과 충돌한다". 폭 300px 과 표면 토큰은 그대로.
- §5 표에서 내로우가 얽힌 행에 "내로우 미구현 — 창 최소 폭으로 진입이 막혀 있다" 주석을 단다. 행 자체는 지우지 않는다 (설계는 살아 있고 구현만 없다).
- 각 변경 지점에 근거로 ADR-011 을 링크한다.

- [ ] **Step 5: 문서 링크가 깨지지 않았는지 확인한다**

Run: `rg -n "adr-011" docs/`
Expected: ADR-011 을 참조하는 곳이 tokens.md · ux-spec · adr-001 에 각각 나온다.

- [ ] **Step 6: 커밋**

```bash
git add docs/
git commit -m "docs: revise the medium range boundary and overlay side" -m "The 800px threshold was an estimate taken before any layout was measured.
Half of a 1512pt screen is 756px, which fell outside it, so the range that
was meant to cover side-by-side work did not.

The overlay side changes for a conflict inside the spec itself: a 300px
panel entering from the left covers the timer at that width, which contradicts
the non-modal rule three rows above it in the same table.

ADR-001 keeps its consumption rule and is marked partially superseded.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 마무리 검증

- [ ] `pnpm vitest run` — 전량 통과 (기준선 794 + 신규 약 28)
- [ ] `pnpm lint` · `pnpm typecheck` (`package.json` 의 스크립트 이름을 확인해 실행)
- [ ] `pnpm dev` 로 Task 6 Step 3 의 확인 항목 4개를 다시 훑는다
- [ ] 와이어프레임([docs/design-system/wireframes/medium-breakpoint.html](../../design-system/wireframes/medium-breakpoint.html))과 실제 전환 동작을 대조한다
- [ ] PR 은 사용자 확인을 받은 뒤에 만든다. 제목·본문 전부 영어, 스쿼시 머지 (CONTRIBUTING)
