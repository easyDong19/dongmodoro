# 조절이 곧 기준 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

**설계 문서:** [2026-08-13-adjust-as-baseline-design.md](2026-08-13-adjust-as-baseline-design.md)
— 규칙(R1~R6)의 소유자는 그 문서다. 이 문서는 그것을 태스크로 옮긴 것뿐이며, 충돌하면
설계 문서가 이긴다.

**Goal:** 뽀모 길이를 바꾸는 경로를 **대기 중인 타이머의 ± 칩 하나**로 단일화한다.
조절값은 즉시 그 모드의 기준으로 저장되고, 세션이 도는 중에는 조절할 수 없다.
정산 패널은 길이를 다루지 않는다.

**Architecture:** 타이머 엔진에 "한 모드의 길이를 쓴다"는 의존성 하나를 주입하고,
`adjust()` 가 **저장 → 상태 갱신 → 전이 발송** 순으로 처리한다. 나머지는 삭제다 —
임시 조절 플래그, 실행 중 조절 분기, 다이얼 갱신 함수, 길이 IPC 2개, 화면 편집 3파일,
정산의 길이 표시. 읽는 쪽(앱 시작·모드 전환·세션 종료 시 재조회)은 손대지 않는다.

**Tech Stack:** 기존 스택 그대로. **추가 의존성 없음.**

## Global Constraints

기존 계획서들의 Global Constraints 가 전부 그대로 적용된다:

- **pnpm 전용.** `npm`·`yarn` 을 쓰지 않는다.
- **IPC 등록은 `handleIpc` 로만** 한다 (ADR-007).
- **Drizzle import 는 `src/main/db/` 안에서만.** `src/shared/` 는 순수 TS 다.
- **시간 계산은 `src/shared/time/` 초크포인트를 통과**한다 (ADR-009).
- **UI 에 이모지 금지** — lucide-react 컴포넌트나 토큰 기반 SVG 만 (design-system §6).
- **커밋 메시지는 영어**, Conventional Commits. 한글은 백틱 안에서도 금지다
  (`commit-msg` 훅이 한글 0건을 강제한다).
- **husky 훅을 우회하지 않는다.** `--no-verify` 금지.
- 도메인 용어는 [CONTEXT.md](../../CONTEXT.md) 를 따른다 — `정산`(리뷰 ✕),
  `뽀모`(뽀모도로 ✕), `할 일`(작업·태스크 ✕).

이번 것 하나 더:

- **저장이 상태보다 먼저다.** 조절 처리에서 길이 저장이 실패하면 엔진 상태를 바꾸지
  않고 전이도 발송하지 않는다. "다이얼은 30분인데 저장은 25분"인 상태를 만들지 않는다.

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/main/services/baseline.ts` | 길이 3종의 읽기·쓰기와 **모드 → 설정 키 매핑의 단일 소유자** | 1 |
| `src/main/services/timer-engine.ts` | 상태 기계. 조절 = 저장 + 상태 갱신 | 2, 6 |
| `src/main/services/timer-host.ts` | 엔진에 DB 쓰기를 꽂는 접착부 | 2 |
| `src/renderer/features/timer/TimerCard.tsx` | 대기 중이 아닐 때 ± 칩 비활성 | 3 |
| `src/renderer/features/review/ConfirmSection.tsx` | 길이 표시·진입점·문구 제거 | 4 |
| `src/renderer/features/baseline/*` (3파일) | **삭제** | 4 |
| `src/renderer/shared/query/invalidate.ts` · `keys.ts` | `baseline-changed`·`keys.baseline` 제거 | 4 |
| `src/shared/ipc/contracts.ts` · `channels.ts` · `src/preload/index.ts` · `src/main/ipc/settings.ts` | 길이 IPC 2개 제거 | 5 |
| `src/main/services/review.ts` | 정산 payload 에서 `baseline` 제거 | 5 |
| `docs/architecture/decisions/adr-033-*.md` 외 5개 | 문서 개정 | 7 |

## 태스크 순서의 근거

**화면 → IPC → 문서 순으로 지운다.** IPC 를 먼저 지우면 그것을 쓰는 화면 코드가 타입
검사에서 깨진다. 엔진 변경(태스크 2)은 `refreshBaseline()` 을 남겨 둔 채 진행하고,
그 함수를 부르던 IPC 핸들러와 함께 태스크 5 에서 지운다.

---

### Task 1: 모드 → 길이 매핑과 단일 길이 쓰기

지금 "모드가 어느 설정 키를 쓰는가"는 엔진(`baselineSec`)과 설정 서비스
(`globalBaseline`) 두 곳에 흩어져 있다. 쓰기 경로가 붙으면 세 곳이 되므로 먼저 한 곳으로
모은다.

**Files:**
- Modify: `src/main/services/baseline.ts`
- Test: `src/main/db/repositories/baseline.test.ts` (기존 파일에 추가)

**Interfaces:**
- Produces: `lengthOf(baseline: Baseline, mode: TimerMode): number` — 분 단위.
  `writeModeLength(uow: UnitOfWork, mode: TimerMode, minutes: number): void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/main/db/repositories/baseline.test.ts` 끝에 추가한다. 이 파일에는 시딩된 in-memory
DB 를 만드는 `seededUow()` 헬퍼가 이미 있다 (`:22`). import 줄에
`lengthOf, writeModeLength` 를 더한다.

```ts
describe('writeModeLength — 한 모드의 길이만 쓴다', () => {
  it('focus 를 30 으로 쓰면 나머지 두 값은 그대로다', () => {
    const uow = seededUow()

    writeModeLength(uow, 'focus', 30)

    expect(uow.run(globalBaseline)).toEqual({
      focusMin: 30,
      shortBreakMin: 5,
      longBreakMin: 15
    })
  })

  it('short 와 long 도 각자의 키에 쓴다', () => {
    const uow = seededUow()

    writeModeLength(uow, 'short', 7)
    writeModeLength(uow, 'long', 20)

    expect(uow.run(globalBaseline)).toEqual({
      focusMin: 25,
      shortBreakMin: 7,
      longBreakMin: 20
    })
  })
})

describe('lengthOf — 모드가 어느 값을 쓰는지 아는 단 하나의 함수', () => {
  it('세 모드가 각자의 값을 돌려준다', () => {
    const b = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15 }

    expect(lengthOf(b, 'focus')).toBe(25)
    expect(lengthOf(b, 'short')).toBe(5)
    expect(lengthOf(b, 'long')).toBe(15)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm test src/main/db/repositories/baseline.test.ts`
Expected: FAIL — `writeModeLength`/`lengthOf` 를 import 할 수 없다

- [ ] **Step 3: 최소 구현**

`src/main/services/baseline.ts` 에 추가한다.

```ts
import type { TimerMode } from '@shared/timer/snapshot'

/**
 * 모드 → 설정 키. **이 매핑의 소유자는 이 파일 하나다.**
 * 엔진도 화면도 자기 매핑을 갖지 않는다 — 세 곳에 흩어지면 한 곳만 고친 순간
 * 모드마다 다른 값을 읽는 상태가 만들어진다.
 */
const MODE_KEY: Record<TimerMode, string> = {
  focus: 'focus_min',
  short: 'short_break_min',
  long: 'long_break_min'
}

/** 분 단위. 길이를 모드로 고르는 유일한 함수다. */
export function lengthOf(baseline: Baseline, mode: TimerMode): number {
  return mode === 'focus'
    ? baseline.focusMin
    : mode === 'short'
      ? baseline.shortBreakMin
      : baseline.longBreakMin
}

/**
 * 한 모드의 길이만 갱신한다 — 조절이 곧 기준이므로 쓰기 단위가 모드 하나다
 * (설계 R2). 나머지 두 값은 읽지도 쓰지도 않는다.
 */
export function writeModeLength(uow: UnitOfWork, mode: TimerMode, minutes: number): void {
  uow.run((repos) => repos.settings.set(MODE_KEY[mode], JSON.stringify(minutes)))
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm test src/main/db/repositories/baseline.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/main/services/baseline.ts src/main/db/repositories/baseline.test.ts
git commit -m "refactor(baseline): own the mode-to-setting-key mapping in one place"
```

---

### Task 2: 조절이 곧 저장이다 (엔진 + 호스트)

**Files:**
- Modify: `src/main/services/timer-engine.ts` (`TimerEngineDeps`, `adjust`, `start`,
  `startWithTask`, `refreshBaseline`, `enterIdle`, `baselineSec`, `idleAdjusted` 필드)
- Modify: `src/main/services/timer-host.ts:21-33` (deps 에 `saveModeLength` 추가)
- Test: `src/main/services/timer-engine.test.ts`

**Interfaces:**
- Consumes: `lengthOf`, `writeModeLength` (Task 1)
- Produces: `TimerEngineDeps.saveModeLength: (mode: TimerMode, minutes: number) => void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

먼저 `makeHarness` 의 `deps` 객체에 저장 스파이를 추가한다 (`src/main/services/timer-engine.test.ts`
상단). `makeHarness` 는 **명시적 반환 타입 주석**을 갖고 있으므로 거기에
`saved: { mode: TimerMode; minutes: number }[]` 를 더하고, 반환 객체에도 `saved` 를
실어 준다.

```ts
const saved: { mode: TimerMode; minutes: number }[] = []
// deps 객체 안, getBaseline 아래에 추가:
    saveModeLength: (mode, minutes) => {
      saved.push({ mode, minutes })
      // 저장된 값이 곧 기준이므로, 이후의 getBaseline 도 그 값을 돌려줘야 한다.
      lengths[mode] = minutes
    },
```

`getBaseline` 은 고정 객체 대신 갱신 가능한 값을 읽게 바꾼다:

```ts
const lengths: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 }
// deps:
    getBaseline: () => ({
      focusMin: lengths.focus,
      shortBreakMin: lengths.short,
      longBreakMin: lengths.long
    }),
```

그런 다음 테스트를 추가한다.

```ts
describe('조절이 곧 기준이다 (설계 R2·R3)', () => {
  it('회귀: 집중 30분으로 조절 → 짧은 휴식 → 집중 복귀가 30분이다', () => {
    const h = makeHarness()

    h.engine.adjust(5) // 25 → 30
    h.engine.setMode('short')
    const back = h.engine.setMode('focus')

    expect(back.durationSec).toBe(30 * 60)
  })

  it('대기 중 조절은 그 모드의 길이를 저장한다', () => {
    const h = makeHarness()

    h.engine.adjust(5)
    expect(h.saved).toEqual([{ mode: 'focus', minutes: 30 }])

    h.engine.setMode('short')
    h.engine.adjust(1) // 5 → 6
    expect(h.saved).toEqual([
      { mode: 'focus', minutes: 30 },
      { mode: 'short', minutes: 6 }
    ])
  })

  it('실행 중 조절은 저장하지도, 남은 시간을 바꾸지도 않는다', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(60_000)

    const before = h.engine.getSnapshot()
    const after = h.engine.adjust(10)

    expect(h.saved).toEqual([])
    expect(after.durationSec).toBe(before.durationSec)
    expect(h.transitions).toHaveLength(1) // start 의 전이 하나뿐 — 조절은 전이를 만들지 않는다
  })

  it('일시정지 중 조절도 아무 일도 하지 않는다', () => {
    const h = makeHarness()
    h.engine.start()
    h.advance(60_000)
    h.engine.pause()

    const before = h.engine.getSnapshot()
    h.engine.adjust(-5)

    expect(h.saved).toEqual([])
    expect(h.engine.getSnapshot().pausedRemainingSec).toBe(before.pausedRemainingSec)
  })

  it('하한 1분 — 더 줄여도 1분이고 저장 값도 1이다', () => {
    const h = makeHarness()

    h.engine.adjust(-100)

    expect(h.engine.getSnapshot().durationSec).toBe(60)
    expect(h.saved).toEqual([{ mode: 'focus', minutes: 1 }])
  })

  it('저장이 실패하면 상태를 바꾸지 않고 전이도 내보내지 않는다', () => {
    const h = makeHarness({
      saveModeLength: () => {
        throw new Error('disk full')
      }
    })

    expect(() => h.engine.adjust(5)).toThrow('disk full')
    expect(h.engine.getSnapshot().durationSec).toBe(25 * 60)
    expect(h.transitions).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm test src/main/services/timer-engine.test.ts`
Expected: FAIL — `saveModeLength` 가 `TimerEngineDeps` 에 없고, 실행 중 조절 테스트가
기존 동작(남은 시간이 바뀜)과 어긋난다

- [ ] **Step 3: 엔진을 고친다**

`TimerEngineDeps` 에 추가한다:

```ts
  /**
   * 한 모드의 기준 길이를 쓴다 — 조절이 곧 기준이기 때문이다 (설계 R2).
   * 엔진은 이것이 DB 인지 모른다. 던지면 조절은 실패로 끝나고 상태는 그대로다.
   */
  saveModeLength: (mode: TimerMode, minutes: number) => void
```

`adjust()` 를 통째로 교체한다:

```ts
  /**
   * ±분 조절 — **대기 중에만** 동작하고, 새 길이는 그 즉시 그 모드의 기준이 된다
   * (설계 R2·R3). 하한 1분.
   *
   * 저장이 상태보다 **먼저**다. 저장이 던지면 durationSec 은 옛 값 그대로이고 전이도
   * 나가지 않는다 — 다이얼과 저장값이 어긋난 상태를 만들지 않기 위해서다.
   *
   * 실행·일시정지에서는 아무 일도 하지 않고 현재 스냅샷을 돌려준다. 예외를 던지지
   * 않는 이유: 칩이 비활성이라 정상 경로로는 도달하지 않고, IPC 계약의 응답이
   * 스냅샷이라 무시가 곧 정직한 응답이다.
   */
  adjust(deltaMin: number): TimerSnapshot {
    if (this.phase !== 'idle') return this.getSnapshot()

    const deltaSec = Math.round(deltaMin * 60)
    const nextSec = Math.max(MIN_REMAINING_SEC, this.durationSec + deltaSec)

    this.deps.saveModeLength(this.mode, nextSec / 60)
    this.durationSec = nextSec
    return this.emit()
  }
```

이어서 지운다:

- `idleAdjusted` 필드 선언 (`timer-engine.ts:68-69`)
- `start()` 의 `if (!this.idleAdjusted)` 조건 — 이제 항상 `this.durationSec =
  this.baselineSec(this.mode)` 를 실행한다
- `startWithTask()` 의 `this.idleAdjusted = false` 줄
- `enterIdle()` 의 `this.idleAdjusted = false` 줄
- `refreshBaseline()` 의 `|| this.idleAdjusted` 조건 (함수 자체는 태스크 5 에서 지운다)

`baselineSec()` 은 Task 1 의 함수를 쓰도록 바꾼다:

```ts
  private baselineSec(mode: TimerMode): number {
    return lengthOf(this.deps.getBaseline(), mode) * 60
  }
```

`MIN_REMAINING_SEC` 주석의 `(R2)` 는 `(설계 R4)` 로 고친다.

- [ ] **Step 4: 호스트에 저장을 꽂는다**

`src/main/services/timer-host.ts` 의 `getBaseline` 아래에 추가한다:

```ts
    // 조절이 곧 기준이다 (설계 R2) — 엔진이 조절을 처리하면서 이 함수로 저장한다.
    saveModeLength: (mode, minutes) => writeModeLength(uow, mode, minutes),
```

import 에 `writeModeLength` 를 더한다.

- [ ] **Step 5: 엔진을 세우는 다른 테스트를 고친다**

`saveModeLength` 는 필수 의존성이므로, 엔진을 직접 세우는 다른 테스트가 타입 검사에서
깨진다. `src/main/ipc/registration.test.ts:56` 부근의 `new TimerEngine({...})` 스텁에
한 줄을 더한다.

```ts
      saveModeLength: () => {},
```

- [ ] **Step 6: 통과를 확인한다**

Run: `pnpm test src/main/services/timer-engine.test.ts`
Expected: PASS

기존 테스트 중 **실행 중 조절을 검증하던 것이 깨진다.** `adjust: 실행 중에도 동작,
하한 60초 (R2)` (`timer-engine.test.ts:221` 부근)를 통째로 지운다 — 실행 중 조절·일시정지
조절·하한을 한 테스트에서 확인하던 것이고, 하한 검증은 새 테스트가 이미 갖고 있다.

- [ ] **Step 7: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add src/main/services/timer-engine.ts src/main/services/timer-engine.test.ts src/main/services/timer-host.ts src/main/ipc/registration.test.ts
git commit -m "feat(timer): make an idle adjustment write the mode baseline"
```

---

### Task 3: 세션이 도는 동안 ± 칩 비활성

**Files:**
- Modify: `src/renderer/features/timer/TimerCard.tsx:127-140`
- Test: `src/renderer/features/timer/TimerCard.test.tsx`

**Interfaces:**
- Consumes: 없음 (스냅샷의 `phase` 만 읽는다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe('± 칩은 대기 중에만 쓸 수 있다 (설계 R3)', () => {
  it('대기 중에는 활성이다', () => {
    setup({ ...baseSnapshot, phase: 'idle' })

    expect(screen.getByLabelText('+5분')).toBeEnabled()
  })

  it('실행 중에는 비활성이다 — 사라지지는 않는다', () => {
    setup({ ...baseSnapshot, phase: 'running', startedAt: Date.now() })

    expect(screen.getByLabelText('+5분')).toBeDisabled()
    expect(screen.getByLabelText('-1분')).toBeDisabled()
  })

  it('일시정지 중에도 비활성이다', () => {
    setup({ ...baseSnapshot, phase: 'paused', pausedRemainingSec: 600 })

    expect(screen.getByLabelText('+10분')).toBeDisabled()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm test src/renderer/features/timer/TimerCard.test.tsx`
Expected: FAIL — 실행 중에도 칩이 활성이다

- [ ] **Step 3: 최소 구현**

`TimerCard.tsx` 의 칩 버튼에 비활성 상태를 더한다. `isRunning`·`isPaused` 는 파일에
이미 있다 (`:49-50`).

```tsx
      {/* 조절은 대기 중에만 — 조절이 곧 기준이므로 실행 중 조절은 의도치 않은 기준
          변경이 된다 (설계 R3). 숨기지 않는 이유: 버튼 줄이 상태마다 재배치되면
          레이아웃이 흔들리고, 비활성 자체가 "지금은 바꿀 수 없다"를 말한다. */}
      <div className="flex items-center justify-center gap-2">
        {ADJUST_CHIPS.map((delta) => (
          <button
            key={delta}
            type="button"
            disabled={isRunning || isPaused}
            aria-label={`${delta > 0 ? '+' : ''}${delta}분`}
            onClick={() => void api.timer.adjust(delta)}
            className="flex h-6 min-w-6 items-center justify-center px-2 text-xs text-ink disabled:opacity-40"
            style={{ borderRadius: 'var(--radius-sm)', background: 'var(--glass)' }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm test src/renderer/features/timer/TimerCard.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/features/timer/TimerCard.tsx src/renderer/features/timer/TimerCard.test.tsx
git commit -m "feat(timer): disable the adjust chips while a session is live"
```

---

### Task 4: 정산 패널에서 길이를 들어낸다

**Files:**
- Modify: `src/renderer/features/review/ConfirmSection.tsx:1, 15, 36-56`
- Delete: `src/renderer/features/baseline/BaselineForm.tsx` ·
  `BaselineForm.test.tsx` · `BaselineSection.tsx` · `useBaseline.ts`
- Modify: `src/renderer/shared/query/invalidate.ts` (`baseline-changed` 케이스와 그 주석)
- Modify: `src/renderer/shared/query/keys.ts:16` (`baseline` 키)
- Test: `src/renderer/features/review/ReviewPanel.test.tsx`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`ReviewPanel.test.tsx` 에서 길이를 다루던 테스트 **3개를 지운다**:

- `현재 뽀모 길이를 사실로 적고 효력 시점을 밝힌다` (`:145` 부근)
- `조정 버튼이 있고, 값을 읽고 나면 눌러 폼이 열린다` (`:153` 부근)
- `폼이 열려도 확정 버튼은 그대로 눌린다` (`:166` 부근)

그 자리에 다음을 넣는다. 렌더 헬퍼의 이름은 `renderPanel()` 이다 (`:83`).

```ts
  it('길이를 다루지 않는다 — 표시도 진입점도 없다 (설계 R6)', () => {
    renderPanel()

    expect(screen.queryByRole('button', { name: '조정' })).toBeNull()
    expect(screen.queryByText(/뽀모 길이/)).toBeNull()
    expect(screen.queryByText(/다음 세션부터 적용돼요/)).toBeNull()
  })
```

이 파일의 `panel()` 팩토리에 있는 `baseline: { focusMin: 25, ... }` 줄(`:68`)은
**아직 지우지 않는다** — 계약에 그 필드가 남아 있어 타입이 요구한다. 태스크 5 에서
계약과 함께 지운다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm test src/renderer/features/review/ReviewPanel.test.tsx`
Expected: FAIL — 세 요소가 모두 아직 그려진다

- [ ] **Step 3: 화면에서 지운다**

`ConfirmSection.tsx` 에서:

- `import { BaselineSection } ...` 줄 삭제
- `const { focusMin, shortBreakMin, longBreakMin } = data.baseline` 줄 삭제
- 길이 표시 `<div className="flex flex-col gap-1">` 블록 전체 삭제 — 그 안의 표시 줄,
  `<BaselineSection />`, 보조 문구 `바꾼 길이는 다음 세션부터 적용돼요 · 진행 중인 세션은
  그대로예요` 가 함께 나간다

`src/renderer/features/baseline/` 폴더를 통째로 지운다.

```bash
git rm -r src/renderer/features/baseline
```

- [ ] **Step 4: 캐시 배선을 지운다**

`invalidate.ts` 에서 `| { type: 'baseline-changed' }` 유니온 항목과 그 위 주석 블록,
그리고 `case 'baseline-changed':` 분기와 그 주석을 지운다.
`keys.ts` 의 `baseline: () => ['settings', 'baseline'] as const,` 줄을 지운다.

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. `data.baseline` 은 아직 계약에 남아 있으므로 타입 오류가 없다 —
그 필드는 태스크 5 에서 지운다.

- [ ] **Step 6: 커밋**

```bash
git add -A src/renderer
git commit -m "refactor(review): drop length editing and display from the settlement panel"
```

---

### Task 5: 길이 IPC 와 정산 payload 의 `baseline` 제거

여기서 `refreshBaseline()` 도 함께 죽는다 — 유일한 호출자가 이 태스크에서 사라진다.

**Files:**
- Modify: `src/main/ipc/settings.ts` (핸들러 2개 + `engine` 인자)
- Modify: `src/main/index.ts:131` 부근 (배선과 주석)
- Modify: `src/shared/ipc/channels.ts:69-70`
- Modify: `src/shared/ipc/contracts.ts` (`settings.getBaseline`·`setBaseline`,
  정산 payload 의 `baseline` 필드와 그 주석, 쓰이지 않게 된 `baselineFormSchema`)
- Modify: `src/preload/index.ts:87-88`
- Modify: `src/main/services/review.ts:150, 196` · `src/main/services/timer-engine.ts`
  (`refreshBaseline` 삭제)
- Test: `src/main/services/review.test.ts:455` · `src/main/ipc/registration.test.ts` ·
  `src/renderer/features/review/ReviewPanel.test.tsx:68`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/main/services/review.test.ts:455-458` 의 테스트
`길이는 전역 설정값이다 (ADR-029 §2)` 를 통째로 교체한다. 헬퍼는 `seeded()` 와
`panel(uow, todayKey)` 다.

```ts
  it('길이를 payload 에 싣지 않는다 — 화면이 길이를 그리지 않는다 (설계 R6)', () => {
    const { uow } = seeded()

    expect('baseline' in panel(uow, SUNDAY)).toBe(false)
  })
```

`src/main/ipc/registration.test.ts` 는 `CHANNELS` 에 선언된 모든 채널이 등록됐는지
확인한다. 채널을 지우면 이 테스트는 저절로 따라오지만, `registerSettingsHandlers` 의
호출부에서 **`engine` 인자를 빼야 한다** (인자 3개 → 2개).

`ReviewPanel.test.tsx` 의 `panel()` 팩토리에서 `baseline: { ... }` 줄(`:68`)을 지운다 —
계약에서 필드가 사라지면 `strictObject` 가 이것을 거부한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm test src/main/services/review.test.ts src/main/ipc/registration.test.ts`
Expected: FAIL — payload 에 `baseline` 이 아직 있다

- [ ] **Step 3: main 쪽을 지운다**

`src/main/ipc/settings.ts`: `getBaseline`·`setBaseline` 핸들러 2개를 지우고,
더 이상 쓰이지 않는 `engine` 인자와 `globalBaseline`·`writeBaseline` import 를 지운다.
파일 상단 주석에서 길이 저장을 설명하던 문단도 함께 정리한다.

`src/main/index.ts`: `registerSettingsHandlers` 호출의 `engine` 인자를 빼고,
"엔진이 이미 살아 있어야 한다 (ADR-029, engine.refreshBaseline)" 주석을 지운다.

`src/main/services/timer-engine.ts`: `refreshBaseline()` 메서드와 그 위 주석 블록 전체를
지운다.

`src/main/services/review.ts`: `baseline: Baseline` 타입 필드(`:150`)와
`baseline: globalBaseline(repos)`(`:196`), 그리고 쓰이지 않게 된 import 를 지운다.

- [ ] **Step 4: 계약과 preload 를 지운다**

`channels.ts`: `getBaseline`·`setBaseline` 두 줄 삭제.
`contracts.ts`: `settings` 블록의 두 계약과 주석, 정산 payload 의 `baseline` 필드와
주석 삭제. `baselineFormSchema` 가 더 이상 쓰이지 않으면 그 정의도 삭제한다
(먼저 `grep -rn baselineFormSchema src/` 로 확인한다).
`preload/index.ts`: `getBaseline`·`setBaseline` 두 줄 삭제.

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm test && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add -A src
git commit -m "refactor(ipc): remove the length channels now that adjusting is the only editor"
```

---

### Task 6: 엔진 테스트 정리와 전체 검증

앞 태스크들에서 죽은 테스트가 남아 있는지 확인하고, 이번 변경이 기존 규칙을 깨지
않았음을 전체 스위트로 고정한다.

**Files:**
- Modify: `src/main/services/timer-engine.test.ts` (죽은 테스트 정리)

- [ ] **Step 1: 죽은 테스트를 찾는다**

Run: `grep -n "idleAdjusted\|refreshBaseline\|조절" src/main/services/timer-engine.test.ts`

`refreshBaseline` 을 부르는 테스트, "조절해 둔 값이 기준을 이긴다"를 검증하는 테스트는
전부 지운다 — 검증 대상이 사라졌다.

- [ ] **Step 2: 남은 규칙이 지켜지는지 확인한다**

다음 기존 테스트는 **살아 있어야 한다.** 하나라도 깨지면 구현이 틀린 것이다.

- `setMode: 실행 중 전환은 확인 없이 세션 폐기 (§2 표)`
- `휴식 완료 → focus idle 로 복귀`
- `세션이 끝나면 대상은 자유 집중으로 돌아간다`
- `startWithTask: 대상 설정 + focus 시작이 한 동작 (R3-1)`

Run: `pnpm test src/main/services/timer-engine.test.ts`
Expected: PASS

- [ ] **Step 3: 전체 검증**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 전부 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/main/services/timer-engine.test.ts
git commit -m "test(timer): drop the cases for the retired temporary-adjust concept"
```

---

### Task 7: 문서 개정

코드와 같은 PR 에 들어간다. **이 태스크를 빼먹으면 문서가 거짓말을 한다** — 이 저장소는
문서가 기준이고, PRD 의 인수 기준이 구현과 어긋난 채 남는다.

**Files:**
- Create: `docs/architecture/decisions/adr-033-adjust-as-baseline.md`
- Modify: `docs/features/pomo-baseline/prd.md` · `docs/features/timer/prd.md` ·
  `docs/features/timer/ux-spec.md` · `docs/features/weekly-review/ux-spec.md` ·
  `CONTEXT.md`

- [ ] **Step 1: ADR-033 을 쓴다**

기존 ADR 의 형식을 그대로 따른다 (`adr-029-baseline-immediate-effect.md` 를 본보기로
읽는다): 상태·관계·결정 근거 원장·Context·Decision·Consequences.

담을 내용:

- **Context** — 사용자가 ± 로 30분을 맞추고 짧은 휴식을 다녀오니 25분이었다. DB 의
  `focus_min` 은 25 였다. 스펙대로였고(pomo-baseline R2), 문제는 **손에 닿는 유일한
  길이 수단이 저장되지 않는 쪽**이었다는 것이다. ADR-029 가 고친 1.x 결함과 같은
  종류다 — 그때는 효력이 늦어서, 지금은 애초에 저장이 아니라서 "저장이 안 된다"로 읽힌다.
- **Decision** — ① 대기 중 ± 조절이 그 모드의 기준을 즉시 저장한다 ② 실행·일시정지
  중에는 조절할 수 없다 ③ 길이 편집 경로는 타이머 하나이며 정산의 진입점·폼·표시를
  폐기한다 ④ ADR-029 §1(적용은 다음 세션)·§2(전역 단일 저장소)는 그대로 유지된다
- **Consequences** — "이번 세션만 늘리기"가 없어진다. 임시 조절 개념이 사라져 엔진의
  우선순위 분기·실행 중 조절 산술·다이얼 갱신 함수·길이 IPC 2개·화면 편집 3파일이
  제거된다. ADR-029 §1 과 pomo-baseline R10 은 이제 구조적으로 위반이 불가능하다.

- [ ] **Step 2: pomo-baseline PRD 를 고친다**

- **R2** — "± 조절은 그날의 예외 대응이며 저장된 길이를 변경하지 않는다" → 폐기.
  새 문장: 대기 중 ± 조절이 그 모드의 기준을 즉시 저장하며, 실행 중에는 조절할 수 없다
  (ADR-033).
- **R11** — 편집 진입점 2개(온보딩·정산) → **타이머 하나**. 온보딩은 미구현이며 새
  설치의 기본값은 시딩이 담당한다 (ADR-018 §4).
- **인수 기준 A2** — "세션 중 +10분 조절 후에도 `focus_min` 이 변하지 않는다" →
  "세션 중에는 조절할 수 없다"로 교체.
- **인수 기준 A11** — 편집 경로 2개 열거 → 타이머 하나로 교체.
- **폐기된 요구사항 표** 에 행 2개 추가 (옛 R2 · 옛 R11, 근거는 ADR-033).

- [ ] **Step 3: timer PRD 를 고친다**

- **R1** — "대기 중인 다이얼은 저장 직후 새 길이를 보여준다" 대목은 조절 자체가 저장이
  되어 자동으로 참이 된다. 문장을 그 사실에 맞게 줄인다.
- **R2** — "실행 중에도 가능" → "대기 중에만 가능". 하한 1분은 유지.
- **인수 기준 A1c·A1d** — 저장 직후 다이얼 갱신 / 조절값 유지 → "대기 중 조절이 즉시
  기준으로 저장된다" · "실행·일시정지 중에는 조절이 무시된다"로 교체.

- [ ] **Step 4: timer ux-spec 을 고친다**

`§2 상태 기계` 아래 `조절 칩은 idle·running·paused 모두 동작, 하한 1분 (PRD R2)` 줄을
`조절 칩은 idle 에서만 동작하며 그 값이 곧 기준이 된다. running·paused 에서는 비활성이다
(PRD R2 · ADR-033)` 로 바꾼다.

- [ ] **Step 5: weekly-review ux-spec 을 고친다**

`§6` 에서 길이 관련 항목을 전부 지운다 — `조정` 진입점, 폼의 자리·확정 버튼 규칙,
보조 문구와 그 개정 이력, 현재 값 표시 줄. 지우는 대신 한 줄을 남긴다: 길이는 정산이
다루지 않으며 편집도 표시도 타이머가 소유한다 (ADR-033).

- [ ] **Step 6: CONTEXT.md 를 고친다**

폐기 용어 표에 한 줄 추가한다: `임시 조절` — 세션 한 번만 적용되던 ± 조절 →
조절이 곧 기준이다 (ADR-033).

- [ ] **Step 7: 문서 링크 검사**

Run: `grep -rn "R25\|refreshBaseline\|baseline-changed\|조정" docs/features docs/architecture | grep -v decision-log`
Expected: 남은 언급이 전부 과거 기록이거나 이번에 고친 문장이다. `docs/origin/` 과
`docs/decision-log/` 는 **소급 수정하지 않는다.**

- [ ] **Step 8: 커밋**

```bash
git add docs CONTEXT.md
git commit -m "docs: record adjust-as-baseline and retire the temporary-adjust rules"
```

---

## 완료 조건

- [ ] `pnpm test && pnpm typecheck && pnpm lint` 전부 통과
- [ ] 회귀 시나리오가 테스트로 고정됐다: 집중 30분 조절 → 짧은 휴식 → 집중 복귀 = 30분
- [ ] 앱을 직접 켜서 확인: 집중에서 `+5` → 짧은 휴식 탭 → 집중 탭 복귀 시 30:00,
      앱 재시작 후에도 30:00, 세션 시작 후 칩이 눌리지 않음
- [ ] 정산 패널에 길이 표시·`조정` 버튼·보조 문구가 없다
- [ ] 문서 6개가 개정됐고 ADR-033 이 있다
