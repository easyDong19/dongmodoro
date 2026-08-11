# 뽀모 길이·가용량 편집 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.
>
> **후속 계획서:** [2026-08-11-packaging-and-release.md](./2026-08-11-packaging-and-release.md) 가 이 계획서 다음에 실행된다. 두 계획서가 함께 v1.0.0 을 만든다 — 이 계획서는 "제품이 성립하는가", 그쪽은 "건넬 수 있는 물건인가"를 닫는다.

**Goal:** 정산 패널의 `조정` 진입점을 열어 **뽀모 길이 3종과 요일별 가용량을 화면에서 바꿀 수 있게** 한다. 확정 전에 변경 전/후의 주간 총 집중 시간을 나란히 보여주고, 바뀐 값은 **진행 중인 주에 효력이 없다.**

**Architecture:** 값을 읽는 규칙은 이미 [baseline.ts](../../src/main/services/baseline.ts) 하나가 소유한다 (`effectiveBaseline` · `effectiveBudget` · `budgetPrefill` · `weekSnapshot`). 이번에 더하는 것은 **쓰기 경로 하나**뿐이며, 그 경로는 `settings` 전역값만 갱신하고 `weeks` 스냅샷은 건드리지 않는다. 효력 지연은 새 코드가 만드는 것이 아니라 **이미 있는 스냅샷 구조가 그대로 보장한다** — 타이머는 매 세션 [`effectiveBaseline`](../../src/main/services/timer-host.ts) 을 호출하고, 그 함수는 그 주 `weeks` 행이 있으면 박제값을 돌려준다.

**Tech Stack:** M3b 스택 그대로. **추가 의존성 없음.**

## Global Constraints

M1~M3b 계획의 Global Constraints 가 전부 그대로 적용된다 (pnpm 전용, BrowserWindow 보안 플래그, `handleIpc` 로만 IPC 등록, Drizzle import 는 `src/main/db/` 만, `src/shared/` 순수 TS, 시간은 `src/shared/time/` 초크포인트, UI 이모지 금지·토큰만, 커밋 영어 Conventional Commits, husky 훅 우회 금지). 여기에 이번 것:

- **분모를 읽는 경로를 늘리지 않는다.** 새 화면도 `effectiveBaseline`·`effectiveBudget` 계약만 부른다. "스냅샷 없으면 전역값"·"NULL 이면 합" 류 분기를 렌더러나 새 서비스에 복제하지 않는다 (pomo-baseline R13 · A13).
- **`weeks` 행을 쓰지 않는다.** 이 계획의 쓰기 대상은 `settings` 의 `focus_min`·`short_break_min`·`long_break_min`·`weekly_capacity` **네 키뿐**이다. 편집이 `weeks` 를 갱신하면 R19(박제 불변)가 코드 한 줄로 깨진다.
- **`weekly_capacity` 를 `[0,0,0,0,0,0,0]` 으로 초기화하지 않는다** (R8 · A9). 미설정은 미설정으로 남아야 하고, 0 배열은 "예산 0 으로 하겠다"는 별개 의사와 데이터상 구분 불가해진다.
- **가용량·예산을 자동 환산하지 않는다** (R26 · A24). 길이를 2배로 바꿔도 `weekly_capacity` 와 이미 박제된 `weeks.budget` 은 그대로다. 화면은 숫자 비교만 보여주고 판단은 사용자에게 남긴다 (PRD 원칙 6).
- **거부는 경계에서 한다.** 하한·정수·배열 길이 검증은 IPC zod 계약과 SQLite CHECK 두 곳이며 (ADR-011 §6), 컴포넌트가 자기 유효성 규칙을 따로 만들지 않는다.
- **작업 브랜치는 `feature/baseline-editing` 하나**이며 태스크마다 커밋한다.

---

## 이 계획서가 인용하는 결정 (소유자는 기존 문서다)

계획은 결정을 만들지 않는다 (docs/CLAUDE.md). 아래는 전부 **이미 확정된** 결정이며, 실행 순서를 이해하는 데 필요해 요지만 인용한다. 문서와 이 계획서가 어긋나면 문서가 이긴다.

| 항목 | 소유 문서 | 요지 |
|---|---|---|
| 편집은 언제든, 효력은 다음 주 경계부터 | [ADR-013](../architecture/decisions/adr-013-baseline-budget-effect.md) §3 · pomo-baseline **R21·R22** | 편집 경로를 막아 불변식을 지키지 않는다. 효력 시점 규칙으로 문제를 없앤다 |
| 편집 진입점은 2개 | pomo-baseline **R25** · **A22** | 첫 실행 온보딩 + 정산 진입점. 상시 설정 화면은 v1 에 두지 않는다 |
| 확정 전 총 집중 시간 비교 | ADR-013 §4 · pomo-baseline **R26** · **A23** | `기준 개수 × focus_min` 을 변경 전/후로 나란히 |
| 기준 개수의 결정 순서 | pomo-baseline **R26** | ① 계획 대상 주 `유효 예산` ② `sum(weekly_capacity)` ③ 둘 다 없으면 **비교를 생략**하고 변경만 확정 (오류 아님, **A25**) |
| 길이 하한과 가용량 형식 | pomo-baseline **R5·R7** | 길이는 1분 이상 정수. 가용량은 길이 7 배열, 각 원소 0 이상 정수, **인덱스 0 = 월요일** |
| 진입점의 자리·문구 | weekly-review [ux-spec §6](../features/weekly-review/ux-spec.md) | `조정` ghost 버튼, 보조 문구 `` `바꾼 길이는 다음 주부터 적용돼요 · 이번 주 기록은 그대로예요` `` |

---

## 이번 계획서에서 뺀 것

| 뺀 것 | 이유 | 언제 살아나나 |
|---|---|---|
| **첫 실행 온보딩 경로** (R25 의 (a)) | 온보딩 화면 자체가 app-shell 소관이고 아직 없다. 그 화면을 함께 만들면 이 계획이 셸 작업으로 번진다 | app-shell 구현 시 |
| **요일별 부하 그래프** (week-plan) | 가용량이 생기면 기준선이 서지만, 그래프의 표시 규칙·문구는 week-plan 소관이다 | week-plan 후속 |
| **상시 설정 화면** | R25 가 v1 범위에서 명시적으로 배제했다. 타이틀바에 톱니 아이콘을 붙이고 싶어지는 자리인데, 붙이면 편집 경로가 3개가 되고 R25 가 깨진다 | v1.1 이후 재논의 |
| **가용량 설정 해제** (배열 → 미설정 되돌리기) | 요구사항에 없다. 한 번 정한 뒤 되돌리는 조작은 값 0 으로 채우는 것과 사용자 의도가 구분되지 않아, 지금 만들면 R8 이 지키려던 구분을 UI 가 다시 흐린다 | 필요가 관찰되면 |
| **실적 기반 예산 자동 보정** | pomo-baseline 비범위 (v1.1 후보). 하향 나선 방지를 위해 자동으로 낮추지 않는다 | v1.1 |
| **휴식 길이를 읽는 화면** | A27 이 "v1 화면 요구사항 0건"으로 확정했다. 편집은 하되 그 값을 소비하는 새 화면은 만들지 않는다 | — |

**이번에 닫지 못하는 인수 기준:** pomo-baseline **A22** — 편집 경로 2개 중 **정산 진입점 하나만** 열린다. A22 의 뒷절("그 밖의 상시 설정 화면이 v1 에 없다")은 그대로 지켜진다. 온보딩 경로는 app-shell 이 만든다.

---

## 함께 고치는 문서·주석 6곳

코드 여러 곳이 **"편집 진입점은 아직 없다"** 를 사실로 적고 있다. 이 계획이 그것을 거짓으로 만들므로 **같은 PR 에서 고친다** — 하나라도 남으면 다음 사람이 없는 공백을 찾아 헤맨다.

| 위치 | 무엇을 |
|---|---|
| [weekly-review/ux-spec.md](../features/weekly-review/ux-spec.md) §6 | **"`조정` 버튼은 pomo-baseline 마일스톤으로 미뤘다"** 문단 삭제. 대신 **조정 폼의 자리**(패널 내 인라인 확장)를 확정해 적는다 — 자리·접힘·진입 방식은 이 문서가 소유한다 (R25) |
| [contracts.ts](../../src/shared/ipc/contracts.ts) `baseline` 필드 주석 | `표시 전용. 편집 진입점은 pomo-baseline 마일스톤 소관이다.` → 편집 채널을 가리키게 |
| [ConfirmSection.tsx](../../src/renderer/features/review/ConfirmSection.tsx) `GuidanceSection` 주석 | `그 진입점은 pomo-baseline 소관이라 이번 마일스톤에서 뺐고` 문장 정정 |
| [baseline.ts](../../src/main/services/baseline.ts) `budgetPrefill` 주석 | `M3a 에는 capacity 편집 UI 가 없으므로 항상 이 경로다` → 편집 UI 가 생겼으므로 두 경로 모두 실재한다 |
| [pomo-baseline/overview.md](../features/pomo-baseline/overview.md) 현재 상태 | `Draft` → `In Review` + 무엇이 구현됐고 무엇이(온보딩 경로) 남았는지 한 줄 |
| [README.md](../../README.md) · [PRODUCT.md](../../PRODUCT.md) 구현 현황 | "뽀모 길이 편집 진입점은 갈 곳이 없어 미뤄져 있다" 문장을 정정. **요일별 부하 그래프는 여전히 미구현**이므로 그 항목은 남긴다 |

---

## 파일 구조 (신규·수정만)

```
src/
├── shared/ipc/
│   ├── channels.ts                # (수정) settings.getBaseline · setBaseline
│   ├── contracts.ts               # (수정) 두 채널 계약 + baselineFormSchema
│   └── api.ts                     # (수정) window.api.settings 표면
├── main/
│   ├── services/
│   │   ├── baseline.ts            # (수정) writeBaseline · baselineBasis
│   │   └── baseline.test.ts       # 신규 — 쓰기 경로와 기준 개수 결정 순서
│   └── ipc/settings.ts            # (수정) 핸들러 2종 추가
├── preload/index.ts               # (수정) settings 표면 2개
└── renderer/
    ├── shared/query/invalidate.ts # (수정) 베이스라인 변경의 무효화 대상
    └── features/
        ├── baseline/
        │   ├── BaselineForm.tsx       # 신규 — 길이 3 + 가용량 7 + 시간 비교
        │   ├── BaselineForm.test.tsx  # 신규
        │   └── useBaseline.ts         # 신규 — 조회·변경 훅
        └── review/ConfirmSection.tsx  # (수정) GuidanceSection 에 `조정` 진입점
```

> `src/main/db/repositories/baseline.test.ts` 는 **이미 있다.** 새로 만들지 말고 그 파일에 쓰기 경로 케이스를 더한다.

---

### Task 1: 문서 정정 — 조정 폼의 자리를 먼저 확정한다

계획이 결정을 만들 수 없으므로, **화면 배치를 코드보다 먼저 문서에 적는다.** 이 순서를 뒤집으면 구현이 곧 결정이 되고 ux-spec 이 사후 추인 문서가 된다.

- [x] **Step 1:** [weekly-review/ux-spec.md](../features/weekly-review/ux-spec.md) §6 에서 **"`조정` 버튼은 pomo-baseline 마일스톤으로 미뤘다"** 문단을 지운다.
- [x] **Step 2:** 같은 자리에 조정 폼의 **자리**를 적는다 — `조정` 을 누르면 **패널 내 인라인으로 펼쳐지고**, 확정 버튼(§7)은 하단 고정을 유지한다. 별도 모달·별도 창을 만들지 않는다. 근거를 함께 적는다: 정산 패널은 이미 스크롤 영역이고, 모달을 겹치면 "정산을 확정하지 않고 닫아도 길이 변경은 남는다"(§6)는 규칙이 사용자에게 두 겹의 취소 버튼으로 보인다.
- [x] **Step 3:** 길이 변경과 정산 확정이 **별개 저장**임을 화면 수준에서 어떻게 드러내는지 한 줄 적는다 — 폼은 자기 확정 버튼을 갖고, 그 버튼은 정산 확정 버튼과 라벨이 겹치지 않는다.
- [x] **Step 4:** [pomo-baseline/prd.md](../features/pomo-baseline/prd.md) 는 **고치지 않는다.** 요구사항이 바뀌는 것이 아니라 구현이 따라잡는 것이다.

**검증:** ux-spec §6 에 "미뤘다"·"갈 곳이 없다" 류 표현이 0건이고, 폼의 자리가 한 문단으로 확정돼 있다.

---

### Task 2: IPC 계약 — `settings.getBaseline` · `setBaseline`

- [x] **Step 1:** [channels.ts](../../src/shared/ipc/channels.ts) 의 `settings` 에 `getBaseline: 'settings:getBaseline'` · `setBaseline: 'settings:setBaseline'` 을 더한다. **범용 `get(key)` 를 만들지 않는다** — 그 파일 주석이 이미 이유를 적어 뒀다.
- [x] **Step 2:** [contracts.ts](../../src/shared/ipc/contracts.ts) 에 폼 값 스키마를 만든다. 하한이 여기 있고, 이것이 R5·R7 의 **첫 번째 거부 지점**이다.

  ```ts
  const baselineFormSchema = z.strictObject({
    focusMin: z.int().min(1),
    shortBreakMin: z.int().min(1),
    longBreakMin: z.int().min(1),
    /** 길이 7·각 원소 0 이상 (R7). `null` 은 미설정이며 오류가 아니다 (R8). */
    capacity: z.array(z.int().min(0)).length(7).nullable()
  })
  ```

- [x] **Step 3:** `getBaseline` 의 응답은 폼 값 + **시간 비교의 기준 개수**다. 기준을 렌더러가 고르게 하면 R26 의 결정 순서가 화면으로 새어나간다.

  ```ts
  getBaseline: {
    req: z.tuple([]),
    res: baselineFormSchema.extend({
      /** R26 의 기준 개수. `null` 이면 시간 비교를 렌더하지 않는다 (A25). */
      basisPomos: z.int().nullable(),
      /** 그 개수가 어디서 왔는지. 가용량을 폼에서 고치면 렌더러가 다시 계산해야 한다. */
      basisSource: z.enum(['budget', 'capacity']).nullable()
    })
  }
  ```

- [x] **Step 4:** `setBaseline` 의 요청은 `z.tuple([baselineFormSchema])`, 응답은 **저장된 값**이다 (`baselineFormSchema`). `void` 가 아닌 이유는 `setTheme` 과 같다 — 화면이 낙관적 추측이 아니라 사실로 갱신하게 한다.
- [x] **Step 5:** `capacity: null` 을 보내는 것은 **"미설정을 유지한다"** 는 뜻이며 **"설정을 지운다"가 아니다.** 이 문장을 계약 주석에 적는다. 해제는 이번 범위 밖이고(위 표), 주석이 없으면 다음 사람이 null 을 삭제 신호로 읽는다.
- [x] **Step 6:** [api.ts](../../src/shared/ipc/api.ts) 와 [preload/index.ts](../../src/preload/index.ts) 의 `settings` 표면에 두 함수를 더한다. ADR-007 의 네 곳(channels → contracts → handleIpc → preload)을 전부 채운다.

**검증:** 타입체크 통과. `focusMin: 0`·`12.5`·`capacity` 길이 6 을 보내는 계약 단위 테스트가 전부 거부된다 (A5).

---

### Task 3: main 서비스 — 쓰기 경로와 기준 개수

- [x] **Step 1:** [baseline.ts](../../src/main/services/baseline.ts) 에 `writeBaseline(uow, form)` 을 더한다. 하는 일은 `settings` 네 키를 **한 트랜잭션에서** 갱신하는 것뿐이다. 값은 JSON 문자열이다 (ADR-018 §5) — `'25'`, `'[4,2,4,2,4,0,8]'`.
- [x] **Step 2:** `capacity === null` 이면 `weekly_capacity` 키를 **건드리지 않는다.** 쓰지 않는 것과 `null` 을 쓰는 것을 혼동하지 않는다 — 후자를 하면 A9 가 깨질 여지가 생긴다.
- [x] **Step 3:** **`weeks` 테이블에 접근하지 않는다.** 이 함수가 `weeks` 를 import 하면 R19 가 코드 한 줄로 깨진다. 리뷰에서 확인할 수 있게 함수 주석에 명시한다.
- [x] **Step 4:** `baselineBasis(repos, todayKey)` 를 더한다. R26 의 결정 순서를 **여기서만** 구현한다.
  1. `planTargetWeek(repos, todayKey)` 로 계획 대상 주를 구한다 — [review.ts](../../src/main/services/review.ts) 에 이미 있다. **복제하지 않고 import 한다.** 복제하면 `plan_lead_days` 해석이 두 곳이 된다.
  2. `effectiveBudget(repos, targetWeek)` 이 개수를 반환하면 `{ basisPomos, basisSource: 'budget' }`.
  3. 아니면 `weekly_capacity` 합 → `{ basisPomos, basisSource: 'capacity' }`.
  4. 둘 다 없으면 `{ basisPomos: null, basisSource: null }`.
- [x] **Step 5:** [ipc/settings.ts](../../src/main/ipc/settings.ts) 에 핸들러 2종을 배선한다. **이 파일은 배선만 한다** — 결정 순서·검증은 서비스에 있다. 기존 테마 핸들러가 그 규율을 이미 지키고 있다.
- [x] **Step 6:** 테스트 — **기존 [`src/main/db/repositories/baseline.test.ts`](../../src/main/db/repositories/baseline.test.ts) 에 더한다.**

  > **갱신 (실행 중 정정):** 이 Step 은 원래 `src/main/services/baseline.test.ts` 를 새로 만들라고 했는데, 그 자리에서는 eslint 가 막는다 — 테스트가 인메모리 DB 를 세우려면 `drizzle-orm/better-sqlite3/migrator` 를 import 해야 하고, ADR-015 §2 는 DB 라이브러리 import 를 `src/main/db/` 하위로 제한한다. 위 **파일 구조** 메모("새로 만들지 말고 그 파일에 더한다")가 맞았고 Step 표기가 틀렸다.

  - 길이만 바꾸면 `weekly_capacity` 가 미설정으로 남는다 (A9)
  - 이미 `weeks` 행이 있는 주에서 길이를 바꿔도 `effectiveBaseline(그 주)` 가 **변하지 않는다** (A17)
  - 그 값이 **다음 주**의 `effectiveBaseline` 에서는 새 값으로 읽힌다 (A18)
  - `weekly_capacity` 합을 24 → 10 으로 바꿔도 이미 박제된 과거 주의 `effectiveBudget` 이 변하지 않는다 (A20)
  - `baselineBasis` 의 3분기 — 예산 있음 / 예산 없고 가용량 있음 / 둘 다 없음

**검증:** 위 5종 통과. A17·A20 은 **이 계획의 존재 이유**라 실패하면 다음 태스크로 넘어가지 않는다.

---

### Task 4: 편집 폼 — 길이 3종 + 가용량 7칸 + 시간 비교

- [ ] **Step 1:** `src/renderer/features/baseline/useBaseline.ts` — `keys.settings()` 로 조회하고, 변경 성공 시 무효화한다. 새 query key 를 만들지 않는다 (`keys.settings()` 가 이미 있다).
- [ ] **Step 2:** `BaselineForm.tsx` 를 만든다. 입력은 길이 3종(분)과 가용량 7칸(개수)이며, **가용량 칸의 순서는 월→일**이다 (R7 · A7). 요일 라벨을 붙여 인덱스 규약이 화면에서 드러나게 한다.
- [ ] **Step 3:** 가용량이 미설정(`null`)이면 7칸을 **빈 채로** 연다. 사용자가 한 칸이라도 채우면 나머지를 `0` 으로 채워 배열을 완성한다. **폼을 여는 것만으로 배열이 생기지 않는다** (A9).
- [ ] **Step 4:** 시간 비교를 렌더한다 (R26 · A23). 형식은 ux-spec §6 의 예시를 따른다 — `주 24개 · 지금 10시간 → 바꾸면 20시간`.
  - 계산은 `기준 개수 × focus_min` 이고 분을 시간으로 바꾼다.
  - `basisSource === 'capacity'` 면 기준 개수는 **폼에서 편집 중인 가용량 합**을 쓴다. 서버가 준 값을 고집하면 가용량을 24 → 10 으로 고친 사용자에게 24 기준 비교가 남는다.
  - `basisPomos === null` 이면 **비교 영역을 렌더하지 않는다.** 오류 문구도 경고도 없다 (A25).
- [ ] **Step 5:** 자동 환산을 하지 않는다 (A24). 길이를 바꿔도 가용량 입력값은 그대로 두고, "가용량도 바꿀까요" 류 제안을 하지 않는다 (PRD 원칙 6).
- [ ] **Step 6:** 접근성 — 조작 타깃 24px(`--target-min`), 포커스 링, 숫자 입력에 라벨. 이모지 금지·토큰만 (design-system principles §6·§7).
- [ ] **Step 7:** 테스트:
  - 미설정 상태로 열면 가용량 7칸이 비어 있고, 아무것도 건드리지 않고 저장하면 `capacity: null` 이 전송된다
  - 한 칸을 채우면 나머지가 `0` 으로 채워진 길이 7 배열이 전송된다
  - `focusMin` 을 25 → 50 으로 바꾸면 비교 문장의 두 숫자가 함께 바뀐다
  - 기준 개수가 없으면 비교 문장이 **DOM 에 없다**

**검증:** 위 4종 통과 + 폼 단독 렌더에서 콘솔 경고 0.

---

### Task 5: 정산 패널 진입점

- [ ] **Step 1:** [ConfirmSection.tsx](../../src/renderer/features/review/ConfirmSection.tsx) 의 `GuidanceSection` 에 `조정` **ghost 버튼**을 더한다. 현재 값 표시 줄(`뽀모 길이 — 집중 25 · …`)은 그대로 둔다 — 그 줄은 이미 ux-spec §6 대로다.
- [ ] **Step 2:** 누르면 `BaselineForm` 이 **같은 섹션 안에서 인라인으로** 펼쳐진다 (Task 1 에서 확정한 자리). 확정 버튼은 하단 고정을 유지한다 (§10).
- [ ] **Step 3:** 폼의 저장은 **정산 확정과 독립**이다. 저장 후 폼을 접고, 표시 줄의 숫자가 새 값으로 갱신된다. 정산을 확정하지 않고 패널을 닫아도 길이 변경은 남는다 (ux-spec §6).
- [ ] **Step 4:** 보조 문구 `` `바꾼 길이는 다음 주부터 적용돼요 · 이번 주 기록은 그대로예요` `` 는 그대로 둔다. **"정산에서만 바꿔요" 류 문구를 새로 만들지 않는다** (R21 이 그 제약을 폐기했다).
- [ ] **Step 5:** [invalidate.ts](../../src/renderer/shared/query/invalidate.ts) — 베이스라인 변경 후 무효화 대상을 정한다. **정산 패널(`keys.reviewPending()`)과 타이머(`keys.timer()`)** 다. 주간 카드는 그 주 스냅샷을 읽으므로 **무효화 대상이 아니다** — 넣으면 "아무것도 안 바뀌는 재조회"가 생기고, 그것이 다음 사람에게 "베이스라인이 주간 카드를 바꾼다"는 오해를 심는다.
- [ ] **Step 6:** 테스트 — `조정` 을 눌러 폼이 열리고, 저장 후 표시 줄 숫자가 바뀌며, **정산 확정 버튼이 그 사이에도 계속 눌리는 상태**로 남는다.

**검증:** 위 3종 통과. 패널을 열어 폼만 저장하고 닫는 흐름에서 정산이 확정되지 않는다.

---

### Task 6: 문서·주석 정정

- [ ] **Step 1:** 위 **"함께 고치는 문서·주석 6곳"** 표를 전부 처리한다. Task 1 에서 이미 처리한 ux-spec §6 은 제외.
- [ ] **Step 2:** `grep -rn "편집 진입점은 pomo-baseline\|편집 UI 가 없\|마일스톤으로 미뤘다" src/ docs/features/ docs/architecture/ README.md PRODUCT.md` 로 잔여 표현 0건 확인. `docs/origin/`·`docs/decision-log/`·`docs/plans/` 는 **소급 수정 금지 대상이라 제외**한다.
- [ ] **Step 3:** [README.md](../../README.md) 의 "값이 없어 미뤄져 있는 셋" 문장에서 **뽀모 길이 편집 진입점만** 뺀다. 요일별 부하 그래프와 기타 행 드릴다운은 여전히 없다 — 셋을 통째로 지우면 문서가 거짓이 된다.

**검증:** Step 2 의 grep 이 제외 경로 밖에서 0건.

---

### Task 7: 마무리 검증

- [ ] **Step 1:** 자동 검증 5종 통과 — `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm build`.
- [ ] **Step 2:** `pnpm test:e2e` 로컬 통과 (기존 케이스 회귀 확인). **새 E2E 케이스는 추가하지 않는다** — 이 기능의 핵심 불변식(A17·A18·A20)은 시간을 넘나드는 것이라 단위 테스트가 정확하고 빠르다.
- [ ] **Step 3:** 손으로 확인한다 (실측 결과를 이 문서 하단에 기록):
  - 정산 패널에서 집중 25 → 50 으로 바꾸고 저장 → 표시 줄이 50 으로 바뀐다
  - 같은 주에 타이머를 시작하면 **여전히 25분**이다 (그 주에 세션이 이미 있어 스냅샷이 있는 경우) — A17
  - 가용량을 처음 입력한 뒤 플래너를 열면 예산 필드가 **합계로 프리필**된다 — A7
  - 앱을 껐다 켜도 바뀐 값이 유지된다
- [ ] **Step 4:** PR 생성 (제목·본문 **영어**, Conventional Commits). 제목 안: `feat: edit pomo length and weekly capacity from the settlement panel`

**검증:** Step 1·2 전부 통과, Step 3 의 4항이 실측으로 확인됨.

---

## 다음으로 넘기는 메모

- **온보딩 경로(A22 의 절반)는 app-shell 이 열어야 한다.** 이 계획이 만든 `BaselineForm` 은 정산 패널에 매이지 않은 컴포넌트이므로, 온보딩은 같은 컴포넌트를 다른 자리에 놓기만 하면 된다.
- **요일별 부하 그래프는 이제 기준선을 갖는다.** `weekly_capacity` 가 실제로 채워지기 시작하므로 week-plan 이 그 배열을 분모로 쓸 수 있다 (R9 · A10).
- **`weeks.capacity` 스냅샷이 처음으로 NULL 이 아니게 된다.** [weekSnapshot](../../src/main/services/baseline.ts) 이 이미 capacity 를 박제하도록 준비돼 있었지만 값이 항상 없어 검증되지 않았다 — 이번에 처음 실 데이터가 흐른다. A14 를 다시 확인할 가치가 있다.
