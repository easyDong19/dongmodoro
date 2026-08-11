# 테마 전환 + 커스텀 타이틀바 구현 계획

> **상태: 실행 완료** (2026-08-11). Task 1~10 전부 구현했고 macOS 로컬에서 자동 검증 5종
> (타입체크·린트·서식·단위 574개·빌드)과 E2E 5종이 통과한다.
>
> **계획서가 놓쳤던 것 3건** — 실행 중 드러나 함께 고쳤다:
>
> 1. **Task 4 의 위치가 틀렸다.** 오버레이 색 모듈을 `src/shared/theme/` 에 두라고 했는데,
>    그 대조 테스트는 `tokens.css` 를 읽어야 하고 eslint 가 `src/shared/` 에서 `node:*`
>    import 을 금지한다 (ADR-008 순수성). 렌더러가 쓰지 않는 값이므로 `src/main/services/`
>    로 옮겼다. `Theme` 타입은 계약의 zod enum 에서 파생해 별도 파일이 필요 없었다.
> 2. **E2E 에 DOM 타입이 필요했다.** `page.evaluate` 콜백은 렌더러에서 도는데
>    `tsconfig.node.json` 에는 DOM 이 없다. `tsconfig.node.json` 에 DOM 을 켜면 main·preload
>    가 브라우저 전역을 참조해도 통과하므로, `tsconfig.e2e.json` 을 분리하고 `typecheck`
>    스크립트에 추가했다.
> 3. **인수 기준 A32·A33 도 거짓이 됐다.** 계획서는 A34 삭제만 짚었는데, A32(`OS 를 라이트로
>    바꾸면 앱이 라이트로 렌더된다`)와 A33(트레이 경로)도 새 결정과 충돌해 함께 고쳤다.
>
> **하네스가 거짓말할 뻔했다.** Playwright 는 `colorScheme` 을 지정하지 않으면
> `'light'` 로 **에뮬레이션한다**(기본값). 그 상태에서 측정하면 앱이 무엇을 하든 렌더러의
> `prefers-color-scheme` 이 light 로 고정되어, **테마 테스트 4종이 전부 통과하면서 아무것도
> 보장하지 못한다.** 픽스처에 `colorScheme: null` 을 넣어 막았다.
>
> **성과 하나** — Task 9 의 대비 실측이 **4.97:1** 로 나왔다. ADR-008 이 계산으로만 통과시킨
> 예측값과 정확히 일치한다. 최악 조건은 teal 광원 위였고 광원 없는 자리는 5.21:1 이다.
>
> **미검증으로 남기는 것:**
> - Windows·Linux 실기 0회 → **app-shell A17 은 이번에 닫히지 않는다**
> - macOS `titleBarOverlay` 의 CSS 환경 변수 활성화 여부는 폴백에 가려 단정할 수 없다
> - **E2E teardown 이 간헐적으로 30초를 넘긴다** — 앱이 종료 요청에 반응하지 않는 기존 결함
>   이며, 이 계획서 범위 밖이다(별도 작업으로 넘김). Linux 전용인 줄 알았으나 macOS 에서도
>   재현됐다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.
>
> **선행 계획서:** [2026-08-11-e2e-harness.md](./2026-08-11-e2e-harness.md) 가 먼저 머지되어야 한다. 이 계획서의 Task 9 가 그 하네스 위에 케이스를 얹는다.

**Goal:** 프레임리스 창에 커스텀 타이틀바를 세우고, 그 안의 2택 토글로 다크·라이트를 전환한다. 선택은 앱이 소유하고 재시작 후에도 유지되며, **첫 페인트부터 올바른 테마로 뜬다.**

**Architecture:** 테마의 유일한 소유자는 **main 의 `nativeTheme.themeSource`** 다. 이 값이 렌더러의 `prefers-color-scheme` 미디어 쿼리까지 함께 움직이므로, 이미 완성돼 있는 [tokens.css](../../src/renderer/shared/styles/tokens.css) 의 라이트 경로가 **한 줄도 고치지 않고** 그대로 동작한다. 설정을 읽어 `themeSource` 에 넣는 시점은 **창 생성 이전**이라 화면 깜빡임이 구조적으로 발생할 수 없다. 창 컨트롤은 OS 가 그리고(macOS `hiddenInset` / Windows·Linux `hidden` + `titleBarOverlay`), 컨트롤이 차지하는 폭은 상수가 아니라 **Window Controls Overlay CSS 환경 변수**로 런타임에 받는다.

**Tech Stack:** M3b 스택 + `@playwright/test`(선행 계획서). 추가 의존성 없음.

## Global Constraints

M1~M3b 계획의 Global Constraints 가 전부 그대로 적용된다 (pnpm 전용, BrowserWindow 보안 플래그, `handleIpc` 로만 IPC 등록, Drizzle import 는 `src/main/db/` 만, `src/shared/` 순수 TS, 시간은 `src/shared/time/` 초크포인트, UI 이모지 금지·토큰만, 커밋 영어 Conventional Commits, husky 훅 우회 금지). 여기에 이번 것:

- **테마 해석은 한 곳뿐이다.** `nativeTheme.themeSource` 에 넣는 코드는 `src/main/services/theme.ts` 하나이며, 렌더러는 **자기 판단으로 테마를 결정하지 않는다.** 렌더러가 `matchMedia` 로 현재 밝기를 읽는 것은 허용하지만, 그것으로 저장값을 추론하거나 화면을 갈아끼우지 않는다.
- **`data-theme` 속성을 런타임에 설정하지 않는다.** 그 선택자는 **테스트·문서 전용 진입점**으로만 존치한다 (ADR-010 §3). 앱 코드에 `documentElement.dataset.theme = …` 이 나타나면 소유자가 둘이 된다.
- **`--target-min`(24px)·포커스 링·`prefers-reduced-motion`** 은 새 컨트롤에도 그대로 적용한다 (design-system ADR-004·ADR-005).
- **선택 상태는 배경만으로 표시하지 않는다** — 세그먼트의 선택 항목은 배경 + `--glass-border` 보더를 함께 갖는다. 고대비 모드에서 배경이 사라져도 보더가 남는다 (design-system ADR-006 §3).
- **고대비 모드에서 앱의 테마 선택은 효력이 없다** (design-system ADR-006 §2 · ADR-008 §5). 이 규칙은 `system` 제거와 무관하게 살아 있다 — 앱이 OS 를 이기는 범위는 일반 모드까지다.
- **작업 브랜치는 `feature/theme-and-titlebar` 하나**이며 태스크마다 커밋한다.

---

## 이 계획서가 인용하는 결정 (소유자는 Task 1 의 ADR-010)

계획은 결정을 만들지 않는다 (docs/CLAUDE.md). 아래는 **Task 1 이 작성할 design-system ADR-010 이 소유**하며, 실행 순서를 이해하는 데 필요해 요지만 인용한다. ADR 과 이 문서가 어긋나면 ADR 이 이긴다.

| 항목 | ADR-008 §4 (기존) | ADR-010 (이번) |
|---|---|---|
| 기본 동작 | `prefers-color-scheme` 로 OS 를 따른다 | **앱이 소유한다.** OS 선호를 따르지 않는다 |
| 저장값 | `system` / `light` / `dark`, 기본 `system` | **`light` / `dark`, 기본 `dark`** |
| 수동 전환 | 트레이 `테마 ▸` 서브메뉴 3택 | **타이틀바의 2택 세그먼트** |
| 적용 채널 | `data-theme` 속성이 OS 를 덮어씀 | **`nativeTheme.themeSource`** — `data-theme` 은 테스트 전용 |
| 고대비 | OS 가 이긴다 | **변경 없음 — OS 가 이긴다** |

---

## 이번 계획서에서 뺀 것

| 뺀 것 | 이유 | 언제 살아나나 |
|---|---|---|
| **MONTH 토글** (ux-spec §3.1) | 미디엄 구간 전용인데 반응형이 없고, 토글이 열 MONTH 컬럼(마일스톤·캘린더)이 미구현이다. 지금 만들면 **아무것도 열지 않는 버튼**이 된다 | 반응형 + milestones·calendar-records |
| **날짜 라벨의 반응형 축약** (ux-spec §1.2) | `8월 4일` 축약은 내로우 구간용인데 그 구간이 없다 | 반응형 3구간 |
| **트레이 `테마 ▸` 서브메뉴** | 트레이는 창 닫기=숨김과 한 배포 단위다 (app-shell PRD R25). 테마만 위해 그 덩어리를 끌어올 이유가 없다 | 트레이 도입 시 |
| **`settings:changed` 이벤트** | 지금 설정을 쓰는 쪽이 **렌더러 버튼 하나뿐**이다. 무효화 초크포인트(ADR-025)로 충분하고, 발송자 없는 이벤트는 죽은 계약이다 | 트레이가 생겨 main 도 쓰기 시작할 때 — **그때는 필수다** |
| **`.seg` 외의 컨트롤 클래스 이식** | `.btn`·`.chip`·`.badge`·`.input`·`.stepper` 를 함께 옮기면 기존 컴포넌트를 전부 다시 쓰게 된다 | 별도 계획서 (디자인 시스템 이식) |
| **Windows·Linux 실기 검증** | 개발 환경이 macOS 하나다 | 해당 OS 접근이 생길 때 |

**이번에 닫지 못하는 인수 기준:** app-shell **A17**(미디엄의 토글이 Win·Linux 에서 창 컨트롤과 겹치지 않는다) — 토글도 없고 실기도 없다. **A34**(`시스템 따라가기` 로 되돌리면 OS 선호를 다시 따른다) — 요구사항 자체가 삭제된다 (Task 2).

---

## 함께 고치는 문서 5곳

ADR-010 이 뒤집는 결정이 이미 다섯 문서에 박혀 있다. **같은 PR 에서 고친다** — 하나라도 남으면 코드와 문서가 갈린다.

| 문서 | 무엇을 |
|---|---|
| [design-system/adr-008](../design-system/decisions/adr-008-light-theme.md) | **상태 줄에만** `§4 는 ADR-010 이 supersede` 표기. **본문은 이력으로 그대로 둔다** (docs/CLAUDE.md ADR 규칙) |
| [design-system/tokens.md](../design-system/tokens.md) §9 구현 메모 | `data-theme` 값 설명에서 `system`/`light`/`dark` → `light`/`dark`, 적용 채널을 `themeSource` 로 |
| [app-shell/prd.md](../features/app-shell/prd.md) | **R42** 재작성(OS 추종 → 앱 소유, 3택 → 2택, 트레이 → 타이틀바) · **A34 삭제** |
| [app-shell/ux-spec.md](../features/app-shell/ux-spec.md) §1.1·§6.5 | §6.5 트레이 `테마 ▸` 3택 → 2택. §1.1 의 **"창 컨트롤 폭은 플랫폼별 상수로 예약"** → **CSS 환경 변수로 런타임 취득**(개선 방향의 정정) |
| [architecture/adr-018](../architecture/decisions/adr-018-first-run-state.md) 시딩 표 | `theme` 행: `'system'` → `'dark'`, 근거를 `design-system ADR-010` 으로. **supersede 표기는 불필요** — ADR-018 의 결정은 "정적 시딩 규칙"이고 값은 design-system 을 인용할 뿐이며, 본문이 스스로 "표를 갱신한다"고 적어 두었다 |

---

## 파일 구조 (신규·수정만)

```
docs/design-system/decisions/adr-010-app-owned-theme.md   # 신규
src/
├── shared/
│   ├── time/index.ts              # (수정) dayLabel — 타이틀바 날짜 라벨
│   ├── theme/
│   │   ├── index.ts               # 신규 — Theme 타입 + 창 컨트롤 오버레이 색
│   │   └── index.test.ts          # 신규 — tokens.css 와의 값 일치 검사
│   └── ipc/
│       ├── channels.ts            # (수정) settings.getTheme · setTheme
│       ├── contracts.ts           # (수정) 두 채널 계약
│       └── api.ts                 # (수정) window.api.settings
├── main/
│   ├── index.ts                   # (수정) 창 생성 **전** 테마 적용
│   ├── window.ts                  # (수정) 프레임리스 플랫폼 분기
│   ├── services/
│   │   ├── theme.ts               # 신규 — 읽기·정규화·적용 (유일한 해석 지점)
│   │   ├── theme.test.ts          # 신규
│   │   └── seed.ts                # (수정) theme 기본값 'dark'
│   └── ipc/settings.ts            # 신규 — 핸들러 2종
├── preload/index.ts               # (수정) settings 표면
└── renderer/
    ├── app/App.tsx                # (수정) flex-col — 타이틀바 + 본문
    ├── shared/
    │   ├── styles/global.css      # (수정) .titlebar · .seg 이식
    │   └── query/keys.ts          # (기존 keys.settings() 를 처음으로 사용)
    └── features/shell/
        ├── TitleBar.tsx           # 신규
        ├── ThemeToggle.tsx        # 신규
        ├── ThemeToggle.test.tsx   # 신규
        └── useTheme.ts            # 신규
e2e/theme.spec.ts                  # 신규 — 케이스 4종
```

---

### Task 1: design-system ADR-010 작성

- [ ] **Step 1:** `docs/design-system/decisions/adr-010-app-owned-theme.md` 를 쓴다. 섹션은 context / decision / consequences 필수 (docs/CLAUDE.md).
- [ ] **Step 2:** 상태 줄에 **`supersedes: ADR-008 §4`** 를 적고, **§1~§3·§5 는 살아 있음**을 명시한다. 특히 §2 의 라이트 팔레트 13개와 §5 의 고대비 우선 규칙은 **그대로 유효**하다 — 뒤집히는 것은 §4(전환 경로) 하나다.
- [ ] **Step 3:** Context 에 뒤집는 이유를 적는다.
  - `system` 은 **값이 값을 가리키는 간접 상태**다. 화면이 어두운 이유가 저장값과 OS 둘로 갈려 "지금 왜 이렇지"의 원인이 둘이 된다.
  - 전환 경로를 트레이로 못박은 것이 **테마를 app-shell 전체(창 닫기=숨김·복귀 4경로, PRD R25)의 인질로 만들었다.** 타이틀바로 옮기면 테마가 독립적으로 성립한다.
  - `nativeTheme.themeSource` 가 `prefers-color-scheme` 까지 움직이므로, **앱 소유로 바꿔도 tokens.css 는 수정 대상이 아니다** — ADR-008 §1 의 CSS 구조가 그대로 산다.
- [ ] **Step 4:** Decision 에 §1 저장값(`light`/`dark`, 기본 `dark`) · §2 전환 경로(타이틀바 2택 세그먼트) · §3 적용 채널(`themeSource`, `data-theme` 은 테스트·문서 전용) · §4 고대비 예외(변경 없음)를 적는다.
- [ ] **Step 5:** Consequences 에 **대가를 정직하게** 적는다.
  - (−) OS 의 **일몰 자동 다크 전환**을 쓰는 사용자와 어긋난다. 다른 앱이 낮에 밝아져도 이 앱은 선택한 채로 남는다. **이 대가를 명시적으로 수용한다.**
  - (−) `[data-theme]` 선택자가 런타임에 쓰이지 않는 두 번째 진입점이 된다. 죽은 코드가 아니라 **용도가 다른 경로**임을 여기서 규정한다.
  - (−) 창 컨트롤 오버레이 색 때문에 **색 값 4개가 CSS 밖(TS)에도 존재**한다 (Task 4 가 대조 테스트로 막는다).
  - (+) 상태 공간 3 → 2, 해석 지점 1개, 첫 페인트 깜빡임 0.

**검증:** ADR 이 context/decision/consequences 3절을 갖고, 어느 절이 죽고 어느 절이 사는지 명시돼 있다.

---

### Task 2: 문서 5곳 정정

- [ ] **Step 1:** [adr-008](../design-system/decisions/adr-008-light-theme.md) 상태 줄에 supersede 표기. **본문 §4 는 손대지 않는다.**
- [ ] **Step 2:** [tokens.md](../design-system/tokens.md) §9 구현 메모 갱신.
- [ ] **Step 3:** [app-shell/prd.md](../features/app-shell/prd.md) **R42** 재작성 + **A34 삭제**. A34 를 지우면 인수 기준 번호에 구멍이 생기는데, **번호를 당기지 않는다** — 다른 문서가 A34 를 참조할 수 있고 번호 이동은 추적을 끊는다. 삭제 사유를 한 줄로 남긴다.
- [ ] **Step 4:** [app-shell/ux-spec.md](../features/app-shell/ux-spec.md) §6.5 트레이 표를 2택으로. §1.1 의 폭 예약 문장을 CSS 환경 변수로 정정하고, **그것이 개선(하드코딩 상수 제거)임을 한 줄로 적는다.**
- [ ] **Step 5:** [adr-018](../architecture/decisions/adr-018-first-run-state.md) 시딩 표의 `theme` 행 갱신.
- [ ] **Step 6:** `grep -rn "시스템 따라가기\|기본 \`system\`" docs/ --include=*.md` 로 잔여 표현 0건 확인 (`docs/origin/`·`docs/decision-log/` 는 **소급 수정 금지 대상이라 제외**).

**검증:** 위 grep 이 origin·decision-log 밖에서 0건.

---

### Task 3: 날짜 라벨 포맷터

- [ ] **Step 1:** [src/shared/time/index.ts](../../src/shared/time/index.ts) 에 `dayLabel(dayKey: string): string` 을 추가한다 — `'2026-08-11'` → `2026년 8월 11일` (ux-spec §1.2 의 와이드·미디엄 포맷).
- [ ] **Step 2:** 구현은 기존 `monthDayLabel`·`weekStartLabel` 과 **같은 방식**이다 — `dayNumber(key) * 86_400_000` 으로 epoch 을 만들고 `getUTC*` 로 읽는다. `new Date(문자열)` 파싱이나 로컬 시간 읽기를 쓰지 않는다 (DST 에서 한 칸 밀린다, ADR-010 architecture Context).
- [ ] **Step 3:** 이 모듈 **밖에서 날짜를 포맷하지 않는다** (ADR-009 §3 시간 모듈 초크포인트). 컴포넌트가 `Intl.DateTimeFormat` 을 직접 부르지 않는다.
- [ ] **Step 4:** 테스트 — 한 자리 월·일(`2026-01-05` → `2026년 1월 5일`), 월말, 연말.
- [ ] **Step 5:** 요일은 **넣지 않는다** (ux-spec §1.2: 요일은 캘린더가 소유하는 정보다).

**검증:** `pnpm test` 통과.

---

### Task 4: 창 컨트롤 오버레이 색 — CSS 밖의 유일한 색 값

Windows·Linux 는 창 컨트롤을 OS 가 그리고 그 색을 **JS 로 지정**해야 한다. main 프로세스는 CSS 변수를 읽을 수 없으므로, **색 값 4개가 tokens.css 밖에 한 벌 더 존재하게 된다.** 이것은 "raw hex 금지" 규칙의 실질적 예외이므로 **한 곳에 가두고 기계로 감시한다.**

- [ ] **Step 1:** `src/shared/theme/index.ts` 를 만든다.
  - `export type Theme = 'light' | 'dark'`
  - `TITLEBAR_HEIGHT = 38` — 와이어프레임의 타이틀바 높이
  - `OVERLAY_COLORS: Record<Theme, { color: string; symbolColor: string }>`
    - `color` = `--bg-deep` 값 (다크 `#0c1a16` / 라이트 `#e7eeec`)
    - `symbolColor` = `--ink` 값 (다크 `#eef4ef` / 라이트 `#0c1a16`)
  - 알파가 있는 토큰(`--ink-dim` 등)을 쓰지 않는다 — 창 컨트롤 글리프는 배경과 합성되지 않는 자리라 불투명 색이어야 한다.
- [ ] **Step 2:** 파일 상단에 **왜 이 파일이 존재하는지**를 적는다 — "CSS 를 읽을 수 없는 프로세스가 색을 필요로 하는 유일한 자리이며, 값의 원본은 여전히 tokens.css 다."
- [ ] **Step 3:** `src/shared/theme/index.test.ts` 에 **대조 테스트**를 쓴다. `tokens.css` 파일을 읽어 `--bg-deep`·`--ink`·`--light-bg-deep`·`--light-ink` 의 값을 정규식으로 뽑아 `OVERLAY_COLORS` 와 **문자열 일치**를 단언한다. 토큰이 바뀌었는데 여기를 안 고치면 **테스트가 먼저 깨진다.** 이 테스트가 이 예외를 감당 가능하게 만드는 유일한 장치다.
- [ ] **Step 4:** 알려진 한계를 주석으로 남긴다 — 앱의 타이틀바는 **라디얼 광원 위에 투명**하지만 OS 오버레이 영역은 **불투명 `--bg-deep`** 이라, Windows·Linux 에서 창 컨트롤 주변에 미세한 색 이음매가 보인다. 오버레이 영역을 투명하게 만들 방법이 없다.

**검증:** 대조 테스트가 통과하고, `tokens.css` 의 `--bg-deep` 을 임시로 바꾸면 **실패한다**(테스트가 실제로 감시하는지 확인).

---

### Task 5: main 테마 서비스

- [ ] **Step 1:** `src/main/services/theme.ts` 를 만든다. 이 파일이 **`nativeTheme.themeSource` 에 값을 넣는 유일한 곳**이다.
  - `readTheme(uow): Theme` — `settings.theme` 을 읽어 JSON 파싱 후 `light`/`dark` 중 하나로 정규화
  - `applyTheme(theme, win?): void` — `nativeTheme.themeSource = theme` + (비 macOS) `win.setTitleBarOverlay(OVERLAY_COLORS[theme])`
  - `setTheme(uow, theme, win?): void` — 저장 후 `applyTheme`
- [ ] **Step 2:** **레거시 값 정규화를 반드시 넣는다.** [seed.ts](../../src/main/services/seed.ts) 는 멱등이라(ADR-018: "키가 없을 때만 넣는다") **기존 개발 DB 에는 `'"system"'` 이 그대로 남아 있다.** 그 값은 새 계약(`z.enum(['light','dark'])`)을 통과하지 못한다.
  - `readTheme` 은 유효하지 않은 값을 만나면 **`dark` 로 판정하고 그 값을 즉시 되쓴다.** 읽을 때마다 조용히 넘기면 저장소에 영원히 잘못된 값이 남는다.
  - 이 경로에 테스트를 붙인다 — `'"system"'` 저장 상태에서 `readTheme` → `dark`, 그리고 **저장값도 `'"dark"'` 로 바뀌었는지** 단언.
- [ ] **Step 3:** [seed.ts](../../src/main/services/seed.ts) 의 `theme` 기본값을 `'"dark"'` 로 바꾸고 `seed.test.ts` 를 함께 고친다.
- [ ] **Step 4:** [main/index.ts](../../src/main/index.ts) 의 `app.whenReady()` 흐름에 배선한다 — **`createWindow()` 보다 먼저** `applyTheme(readTheme(uow))` 를 부른다. `startDb()` 안의 `seedSettings` 직후가 자연스러운 자리다. **이 순서가 깜빡임 0 의 근거 전부**이므로 주석으로 이유를 남긴다.
- [ ] **Step 5:** macOS 는 `setTitleBarOverlay` 를 부르지 않는다 (`@platform win32,linux`). 트래픽 라이트는 `themeSource` 를 따라 OS 가 알아서 바꾼다.

**검증:** `pnpm test` 통과. 레거시 정규화 테스트가 저장값 되쓰기까지 확인한다.

---

### Task 6: IPC 계약 — `settings.getTheme` · `setTheme`

ADR-007 의 4단계를 전부 채운다: channels → contracts → handler → preload.

- [ ] **Step 1:** [channels.ts](../../src/shared/ipc/channels.ts) 에 `settings: { getTheme: 'settings:getTheme', setTheme: 'settings:setTheme' }` 추가.
- [ ] **Step 2:** [contracts.ts](../../src/shared/ipc/contracts.ts) 에 계약을 넣는다. `themeSchema = z.enum(['light', 'dark'])` 를 한 번만 선언해 요청·응답이 공유한다.
  - `getTheme`: req 없음, res `z.strictObject({ theme: themeSchema })`
  - `setTheme`: req `z.strictObject({ theme: themeSchema })`, res `z.strictObject({ theme: themeSchema })` — 저장된 결과를 되돌려 화면이 낙관적 추측 대신 사실로 갱신하게 한다
  - **범용 key-value 채널을 만들지 않는다.** 값이 `string` 이 되면 `theme` 에 `'purple'` 이 들어가도 통과해, 이 채널에서만 ADR-007 의 계약 규율이 무력해진다.
- [ ] **Step 3:** `src/main/ipc/settings.ts` 에 `registerSettingsHandlers(uow, getWindow)` 를 만들고 `handleIpc` 로만 등록한다. `setTheme` 은 Task 5 의 `setTheme` 서비스를 부른다 — 핸들러가 `nativeTheme` 을 직접 만지지 않는다.
- [ ] **Step 4:** [main/index.ts](../../src/main/index.ts) 에서 다른 핸들러들과 같은 자리에 등록한다 (창 생성 이전).
- [ ] **Step 5:** [preload/index.ts](../../src/preload/index.ts) 에 `settings.getTheme()`·`settings.setTheme(theme)` 표면을 추가하고 [api.ts](../../src/shared/ipc/api.ts) 타입을 맞춘다.
- [ ] **Step 6:** `contracts.test.ts` 에 계약 왕복 테스트를 추가하고, `registration.test.ts` 가 있다면 새 채널이 등록되는지 확인한다.

**검증:** `pnpm typecheck` · `pnpm test` 통과.

---

### Task 7: 프레임리스 창

- [ ] **Step 1:** [window.ts](../../src/main/window.ts) 의 `BrowserWindow` 옵션에 플랫폼 분기를 넣는다.
  - macOS: `titleBarStyle: 'hiddenInset'`
  - Windows·Linux: `titleBarStyle: 'hidden'` + `titleBarOverlay: { ...OVERLAY_COLORS[theme], height: TITLEBAR_HEIGHT }`
  - **초기 테마를 창 생성 시점에 알아야 하므로** `createWindow` 가 테마를 인자로 받는다. Task 5 의 순서(창 이전에 읽기)가 이것을 보장한다.
- [ ] **Step 2:** macOS 에서도 `titleBarOverlay: true` 를 켜서 **CSS 환경 변수를 활성화**한다. Electron 타입 주석이 "`titleBarStyle` 로 창 컨트롤이 보이는 프레임리스 창에서 WCO JS API 와 CSS 환경 변수를 활성화한다"고 정의하며, 색 옵션만 win32/linux 전용이다. **활성화 여부를 실측으로 확인하고**, 안 되면 Step 3 의 CSS 폴백이 그대로 받아낸다.
- [ ] **Step 3:** 트래픽 라이트가 38px 바에서 세로 중앙에 오지 않으면 `trafficLightPosition` 으로 맞춘다. **눈으로 재고 값을 주석에 남긴다** — 계산으로 맞출 수 있는 값이 아니다.
- [ ] **Step 4:** 창 닫기 확인 다이얼로그(기존 `win.on('close')`)는 **그대로 둔다.** 프레임리스여도 OS 가 닫기 버튼을 그리므로 경로가 바뀌지 않는다.

**검증:** macOS 에서 앱을 띄워 타이틀바가 없고 트래픽 라이트만 보이며, 창 크기 조절·닫기가 정상 동작한다.

---

### Task 8: 타이틀바와 토글

- [ ] **Step 1:** [global.css](../../src/renderer/shared/styles/global.css) 에 `.titlebar` 를 만든다.
  - 높이 `env(titlebar-area-height, 38px)`
  - **좌우 여백을 상수로 박지 않는다** — `padding-left: env(titlebar-area-x, 0px)` 와 `width: env(titlebar-area-width, 100%)` 로 창 컨트롤이 차지하는 폭을 런타임에 받는다. macOS 는 좌측이, Windows·Linux 는 우측이 자동으로 비워진다. **환경 변수에 폴백을 함께 준다** — 활성화되지 않는 환경에서도 레이아웃이 무너지지 않는다.
  - `-webkit-app-region: drag` — 빈 영역이 창 드래그 핸들이다 (ux-spec §1)
  - 하단 경계는 `--glass-border-soft` 1px
- [ ] **Step 2:** 와이어프레임의 `.seg` 를 global.css 로 **이식**한다 (값 변형 없이). 선택 항목은 `--glass-strong` 배경 + `--glass-border` 보더 + `--teal` 글자, 각 버튼은 `min-height: var(--target-min)`, 그리고 **`-webkit-app-region: no-drag`** — 드래그 영역 안의 버튼은 이것이 없으면 눌리지 않는다.
- [ ] **Step 3:** `useTheme.ts` — `keys.settings()` 로 `api.settings.getTheme()` 을 읽고, 변경은 `setTheme` 후 해당 키를 무효화한다. **캐시 조작은 초크포인트 규칙을 따른다** (ADR-025 §3).
- [ ] **Step 4:** `ThemeToggle.tsx` — `.seg` 기반 2세그먼트. lucide `Sun`·`Moon` 아이콘, 각 버튼에 `aria-pressed` 와 `aria-label`(`라이트 테마`·`다크 테마`). **이모지 금지, 아이콘 컴포넌트만** (principles §6).
- [ ] **Step 5:** `TitleBar.tsx` — 좌측 앱 이름(`--ink-dim`), 우측에 `ThemeToggle` → 날짜 라벨 순서. 날짜는 `useClock().dayKey` 를 `dayLabel()` 에 넣는다. **자정을 넘으면 `clock:boundary` 이벤트가 캐시를 갱신하므로 라벨이 자동으로 따라온다** — 별도 타이머를 만들지 않는다.
- [ ] **Step 6:** [App.tsx](../../src/renderer/app/App.tsx) 를 `flex-col` 로 바꾼다 — `TitleBar` 가 `flex-shrink-0`, 카드 3장이 그 아래 `flex-1` 행. 기존 `h-screen`·`gap-6`·`p-6` 은 본문 쪽으로 옮긴다. `TitleBar` 는 **`ClockGate` 안쪽**에 둔다 — `useClock` 을 쓰기 때문이다.
- [ ] **Step 7:** `ThemeToggle.test.tsx` — 렌더 시 현재 테마에 `aria-pressed="true"`, 반대쪽 클릭 시 `api.settings.setTheme` 이 그 값으로 불린다.

**검증:** `pnpm test` 통과. 앱을 띄워 토글을 눌러 화면 전체가 뒤집힌다.

---

### Task 9: E2E 케이스 4종

선행 계획서의 `e2e/fixtures/app.ts` 를 그대로 쓴다. `--user-data-dir` 격리가 케이스 ②의 전제다.

- [ ] **Step 1:** `e2e/theme.spec.ts` 를 만든다.
- [ ] **Step 2:** **① 전환** — 라이트 세그먼트를 클릭하면 `body` 의 계산된 `background-color` 가 다크 값에서 라이트 값으로 바뀐다. 클래스 이름이 아니라 **실제 계산값**을 본다.
- [ ] **Step 3:** **② 첫 실행이 다크** — 빈 userData 로 기동해 초기 배경이 `--bg-deep` 다크 값이다. **OS 가 라이트여도 다크여야 한다** — 이것이 `system` 제거의 핵심 단언이다.
- [ ] **Step 4:** **③ 재시작 유지** — 라이트로 바꾸고 앱을 닫았다가 **같은 userData 로** 다시 띄우면 라이트로 뜬다. 픽스처가 임시 디렉토리를 재사용할 수 있어야 하므로 필요하면 옵션을 추가한다.
- [ ] **Step 5:** **④ 라이트 타이틀바 대비 실측** — 라이트 테마에서 타이틀바의 날짜 라벨(`--ink-dim`)과 그 뒤 배경의 실효 색을 `getComputedStyle` 로 읽어 대비를 계산하고 **4.5:1 이상**을 단언한다.
  - **이것이 이 계획서의 숨은 목적 하나다.** ADR-008 은 라이트의 대비 판정 지점을 **"광원 위, 카드 없음" = 타이틀바**로 지정하고 `--ink-dim` 알파를 0.60 → 0.65 로 올렸는데, **타이틀바가 없어서 그 판정을 한 번도 실측한 적이 없다.** 예측값 4.97:1 이 실제로 나오는지 여기서 처음 확인한다.
  - 반투명 색이라 배경과 합성해야 한다 — 합성·상대휘도·대비 계산을 테스트 안 헬퍼로 둔다.
  - **실측이 4.5:1 미만이면 멈추고 보고한다.** 임의로 알파를 올려 통과시키지 않는다 — 그것은 ADR-008 §2 의 팔레트를 바꾸는 결정이고 ADR 이 선행해야 한다.
- [ ] **Step 6:** 다크·라이트 스크린샷을 `e2e-artifacts/` 에 저장한다.

**검증:** `pnpm build && pnpm test:e2e` 로컬 통과. CI 초록.

---

### Task 10: 마무리 검증

- [ ] **Step 1:** 자동 검증 5종 — `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm build`.
- [ ] **Step 2:** E2E 통과.
- [ ] **Step 3:** **수동 검증** — 실물 앱을 눌러 확인한다. 자동 검증으로 대체하지 않는다.
  - [ ] 다크 → 라이트 전환 시 카드·버튼·아이콘이 **전부** 따라온다 (렌더러 raw hex 0건이므로 예상되지만 확인한다)
  - [ ] 앱 기동 순간 **깜빡임 0** — 라이트로 설정한 뒤 재시작해 첫 프레임이 라이트인지 본다
  - [ ] macOS 트래픽 라이트가 두 테마에서 모두 보이고 38px 바에서 세로 중앙이다
  - [ ] 타이틀바 빈 영역으로 **창이 드래그**되고, 세그먼트 버튼은 **눌린다**(`no-drag` 확인)
  - [ ] 날짜 라벨이 오늘 날짜다
  - [ ] 창 닫기 확인 다이얼로그가 focus 진행 중에 여전히 뜬다 (기존 동작 회귀 없음)
  - [ ] 키보드만으로 세그먼트에 도달하고 포커스 링이 보인다
  - [ ] 다크·라이트 스크린샷 각 1장 확보
- [ ] **Step 4:** **미검증 항목을 이 문서에 기록한다** — Windows·Linux 실기 0회, app-shell **A17 미충족**, `titleBarOverlay` 의 macOS 환경 변수 활성화 실측 결과.
- [ ] **Step 5:** PR 생성 (제목·본문 **영어**, Conventional Commits). 제목 안: `feat: switch themes from a custom title bar`

---

## 다음으로 넘기는 메모

- **트레이 도입 시 `settings:changed` 이벤트가 필수가 된다.** 그때 설정을 쓰는 곳이 타이틀바와 트레이 둘이 되므로, 한쪽이 바꾼 값을 다른 쪽이 모른다. ADR-026 의 4단계(channels → contracts → sendEvent → preload 구독)를 그대로 따르면 된다.
- **반응형이 생기면 타이틀바가 먼저 반응한다** — 날짜 라벨 축약(ux-spec §1.2)과 MONTH 토글(§3.1)이 그때 이 컴포넌트에 붙는다. `TitleBar.tsx` 는 그 확장을 받을 자리로 설계한다.
- **`.seg` 이식이 디자인 시스템 이식의 첫 사례다.** 나머지 컨트롤 클래스(`.btn`·`.chip`·`.badge`·`.input`·`.stepper`)와 기존 컴포넌트의 인라인 `style` 정리는 별도 계획서로 남는다.
- **`--bg-deep` 이라는 이름은 라이트에서 여전히 부정확하다** (ADR-008 §1 이 부채로 수용). 이번에 그 값이 **창 컨트롤 오버레이 색으로도 쓰이면서** 이름의 부정확이 한 군데 더 늘었다.
