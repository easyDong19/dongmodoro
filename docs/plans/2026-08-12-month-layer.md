# 월 레이어 구현 계획 — 마일스톤 + 캘린더

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

**Goal:** 월 레이어를 세운다 — 한 달의 **결과물**(마일스톤)을 적고, 한 달의 **기록**(캘린더 점과 날짜 패널)을 되돌아본다. 두 카드는 같은 컬럼에 인접해 **하나의 표시 대상 월**을 공유하며, 그 값의 소유자는 캘린더다.

**Architecture:** 이 계획은 **스키마를 바꾸지 않는다.** `milestones` 테이블과 `week_items.milestone_id` FK, `task_pulls` 의 `idx_task_pulls_date` 가 [0000_initial_schema.sql](../../drizzle/0000_initial_schema.sql) 에 이미 있고, 이월의 `milestone_id` 승계도 이미 구현돼 있다([drizzle.ts:773](../../src/main/db/repositories/drizzle.ts)). 즉 **데이터는 이미 흐르고 있고, 이 계획이 더하는 것은 읽는 경로와 쓰는 화면이다.**

세 개의 판정 규칙이 이 계획의 뼈대이며, 각각 **한 함수에만** 존재한다:

| 판정 | 어디에 | 왜 한 곳인가 |
|---|---|---|
| `기록 있음(D)` | `services/calendar.ts` | 점·조각 목록·빈 상태가 각자 조건을 쓰면 같은 날짜에 대해 서로 반대로 말한다 (calendar-records **R5**, 리뷰 케이스 6) |
| 표시 모드 6분기 | `services/milestones.ts` | 조건이 상호 배타이고 순서가 규칙이다 — 화면이 `if` 를 다시 쓰면 두 모드가 겹친 카드가 나온다 (milestones **R20**) |
| 주의 귀속 달 | `shared/time/index.ts` | 주는 쪼개지지 않고 귀속 달은 **주 키의 달**이다. 두 곳에서 계산하면 달 전환 주에 롤업이 두 카드로 갈라진다 (milestones **R18**) |

**Tech Stack:** M3b 스택 그대로. **추가 의존성 없음.** 마이그레이션 없음.

---

## Global Constraints

M1~M3b·베이스라인 편집 계획의 Global Constraints 가 전부 그대로 적용된다 (pnpm 전용, BrowserWindow 보안 플래그, `handleIpc` 로만 IPC 등록, Drizzle import 는 `src/main/db/` 만, `src/shared/` 순수 TS, 시간은 `src/shared/time/` 초크포인트, UI 이모지 금지·토큰만, 커밋 영어 Conventional Commits, husky 훅 우회 금지). 여기에 이번 것:

- **달력 키 산술을 화면에서 하지 않는다.** 이전/다음 달·주의 귀속 달·그리드 앞 빈 칸 수는 전부 `src/shared/time/` 의 함수를 부른다 (milestones **R2** · calendar-records **R1**). ESLint 의 `TIME_SELECTORS` 가 이미 `new Date()` 를 막고 있으므로 우회로는 문자열 슬라이싱인데, **그것도 금지**다 — `month.slice(0, 4)` 로 연도를 뽑는 코드가 생기는 순간 규약이 두 곳이 된다.
- **조회 시점에 날짜를 파생하지 않는다.** 캘린더 쿼리는 `sessions.local_date` 의 **범위 조건**만 쓰고 술어에 `strftime()`·`date()` 를 씌우지 않는다 (calendar-records **R3** · **A3**). 씌우는 순간 인덱스가 죽고, 타임존을 바꾼 사용자의 과거 점이 이동한다.
- **없는 숫자를 만들지 않는다.** 월 누적 소진은 v1.1 비범위다 (Q15). 롤업은 **언제나 범위 라벨과 함께** 렌더하고, 라벨 없는 소진 숫자를 화면에 두지 않는다 (milestones **R17** · **A16**).
- **보관은 집계에 중립이다.** `archived_at` 은 목록 표시에서만 빼고 배지의 `N`·`M` 을 바꾸지 않는다 (milestones **R21** · **A21**). 분모를 깎는 코드가 한 줄이라도 들어가면 아무것도 하지 않고 달성률을 올릴 수 있게 된다.
- **날짜 패널은 읽기 전용이다.** 완료 토글·삭제·재-pull 을 제공하지 않는다 (calendar-records **R23**). 유일한 예외는 R21 의 `자유 집중 시작` 이며, 그것은 기록을 편집하지 않고 세션을 시작할 뿐이다.
- **작업 브랜치는 `feature/month-layer` 하나**이며 태스크마다 커밋한다.

---

## 이 계획서가 인용하는 결정 (소유자는 기존 문서다)

계획은 결정을 만들지 않는다 ([docs/CLAUDE.md](../CLAUDE.md)). 아래는 전부 **이미 확정된** 결정이며, 실행 순서를 이해하는 데 필요해 요지만 인용한다. 문서와 이 계획서가 어긋나면 문서가 이긴다.

| 항목 | 소유 문서 | 요지 |
|---|---|---|
| 표시 대상 월의 소유자 | calendar-records **R26** · **A24** | 캘린더가 소유하고 공개한다. 마일스톤 카드는 **자기 월 상태를 갖지 않고** 이 값을 따른다 |
| 달 이동 조작은 하나 | milestones **R19** · **A18** | 마일스톤 전용 탭·모달·월 선택기를 만들지 않는다 |
| 주는 쪼개지지 않는다 | milestones **R18** · **A17** | 귀속 달 = **주 키(그 주 월요일)의 달**. 8/31~9/6 주는 전체가 8월 |
| `기록 있음(D)` 술어 | calendar-records **R5** · **R6** | `완료 focus 세션 ≥ 1` **또는** `pull_date = D 인 행 ≥ 1`. 점의 **등급**만 세션 수로 계산 |
| `공부한 날 수` 는 예외 | calendar-records **R24** · **A23** | 이 문구만 `완료 focus ≥ 1` 단독 조건. 캘린더 점과 다른 유일한 지점이며 **의도된 것** |
| 롤업의 분모 | milestones **R17** | 그 주의 계획 대비 — 연결 항목들의 `week_items.est_pomos` 합. 0 이면 분수 대신 개수만 |
| 집계 술어 | ADR-012 §1 · milestones **R16** | `sessions.local_week == week_items.week` 인 `kind='focus'` 만 |
| 이월은 연결을 승계한다 | ADR-012 §3 · milestones **R15** | **이미 구현돼 있다.** 타월 연결이 존재하는 유일한 경로이며, 소진은 **마일스톤이 놓인 달** 카드로 올라간다 |
| 삭제는 물리 삭제 | ADR-014 §3 · milestones **R8** | `deleted_at` 없음. FK 가 `ON DELETE SET NULL` 이라 연결 항목은 "기타"로 남는다. 확인 1회 필수 |
| 완료 표시는 현재 상태 | calendar-records **R19** · **A12·A13** | 과거 날짜 패널의 완료 표시가 소급해 바뀌는 것은 **수용된 대가**다. 로컬 날짜 비교로 미완료를 만들지 않는다 |
| 와이드 3컬럼 배치 | app-shell [ux-spec §2](../features/app-shell/ux-spec.md) | 좌 MONTH(마일스톤+캘린더) / 중 타이머 / 우 WEEK+TODAY. **두 카드는 같은 컬럼에 인접** |
| 셀 상태 3채널 | calendar-records **R15** · **A19** | 오늘=숫자색, 선택=배경·보더, 기록=점. 한 채널을 두 상태가 함께 쓰지 않는다 |

---

## 이번 계획서에서 뺀 것

| 뺀 것 | 이유 | 언제 살아나나 |
|---|---|---|
| **반응형 3구간** (ux-spec §3·§4) | 이 계획은 **와이드 배치(§2)만** 구현한다. MONTH 오버레이 토글·미디엄·컴팩트는 별개 작업이고, 지금 함께 하면 계획이 셸 작업으로 번진다. 창을 좁히면 카드가 눌리는 상태는 M4 와 동일하게 유지된다 | app-shell 반응형 작업 |
| **트레이 상주·창 닫기=숨김** | MONTH 컬럼과 무관하다. 창을 닫으면 앱이 종료되는 현 상태를 유지한다 (app-shell **R25**) | app-shell 후속 |
| **월 누적 소진 집계** | milestones **R17** · calendar-records 비범위가 v1.1 로 명시적으로 미뤘다. 롤업은 주 단위뿐이다 | 별도 결정 |
| **마일스톤 태그 배지를 주간 카드에 표시** | week-plan 소관이며 요구사항이 아직 없다. 이번에 만드는 것은 **연결하는 입력** 하나뿐이고, 배지를 함께 만들면 week-plan 의 표시 규칙을 이 계획이 정하게 된다 | week-plan 후속 |
| **마일스톤 수동 순서 변경** | milestones **R10** 이 v1 비범위로 확정. 표시 순서는 생성 순 고정 | — |
| **월말 정산의 마일스톤 재설정 흐름** | milestones 비범위. 이번 달 빈 상태의 제목 복사 액션(**R22**)이 최소 대안이며 그것은 범위 안이다 | v1.1 이후 |
| **시점별 완료 여부 복원** | calendar-records **R19** 아래 가정 블록 — 불변 완료 달력 키가 선행되어야 하고 **새 ADR 사안**이다. 계획이 결정을 만들 수 없으므로 후퇴안(현재 완료 상태 표시)으로 간다 | ADR 선행 시 |
| **점 등급 재검토** (2단계 → 1단계) | calendar-records 가정 블록이 대안을 기록해 뒀지만, 결정은 **2단계 유지**로 이미 내려져 있다. 계획이 뒤집지 않는다 | 필요가 관찰되면 |
| **연속 일수(스트릭)** | calendar-records 가정 블록 · PRODUCT v1 비범위. `이번 주 N일 공부 중` 은 주 내 일수 카운트이지 연속 일수가 아니다 | 별도 결정 |
| **기록 내보내기·연간 히트맵** | calendar-records 비범위 | — |

**이번에 닫지 못하는 인수 기준:** 없다. 위에서 뺀 것들은 전부 해당 PRD 가 **비범위로 명시한 것**이며 인수 기준을 갖지 않는다. app-shell 의 반응형 인수 기준은 이 계획의 대상이 아니다.

---

## 함께 고치는 문서·주석

여러 문서가 **"마일스톤·달력은 아직 없다"** 를 사실로 적고 있다. 이 계획이 그것을 거짓으로 만드므로 **같은 PR 에서 고친다.**

| 위치 | 무엇을 |
|---|---|
| [CONTEXT.md](../../CONTEXT.md) | **용어 5종 추가** — `할당`·`마일스톤`·`보관`·`롤업`·`공부한 날 수`. 특히 **`할당` 은 지금 정의가 없다**: `조각` 항목이 "할당을 쪼갠 실행 단위"라며 그 말에 기대는데 정작 `할당` 자체가 용어집에 없다. 마일스톤 카드 카피가 이 말을 쓰므로 이번에 닫는다 (Task 1) |
| [README.md](../../README.md) 로드맵 | `1.1.0 마일스톤 → 1.2.0 달력` 2단계를 **한 버전으로 합친다.** 두 기능이 표시 대상 월과 달 이동 컨트롤을 공유해 쪼개면 임시 소유권 이전 코드가 생긴다 |
| [PRODUCT.md](../../PRODUCT.md) 구현 현황 · 밀린 넷 목록 | `아직 없는 것: 마일스톤, 달력, …` 정정. **반응형 셸·트레이는 여전히 없으므로 그 둘은 남긴다** — 넷을 통째로 지우면 문서가 거짓이 된다 |
| [docs/features/README.md](../features/README.md) | `milestones`·`calendar-records` 행의 상태 갱신 |
| [milestones/overview.md](../features/milestones/overview.md) · [calendar-records/overview.md](../features/calendar-records/overview.md) 현재 상태 | `Draft` → `In Review` + 무엇이 구현됐고 무엇이 남았는지 한 줄 |
| [calendar-records/prd.md](../features/calendar-records/prd.md) **R27** | `(타이머 카드 구성표에 그 행을 추가하는 작업은 후속 PR …)` — 그 후속 PR 이 이 계획이다. 괄호를 정정한다 |
| [timer/ux-spec.md](../features/timer/ux-spec.md) §1 카드 구성표 | `공부한 날 수` 행을 추가한다. **데이터·카피 소유는 calendar-records** 이고 타이머는 자리만 갖는다는 사실을 함께 적는다 (**R27**) |
| [App.tsx](../../src/renderer/app/App.tsx) 주석 | `타이틀바 + 세 카드 … 반응형은 만들지 않는다(M4)` → 네 카드·2단 우측 컬럼으로. **"반응형은 만들지 않는다"는 남긴다** (여전히 사실) |
| [invalidate.ts](../../src/renderer/shared/query/invalidate.ts) 주석 | 마일스톤 무효화를 언급하는 기존 주석이 실제 키를 가리키게 |

---

## 파일 구조 (신규·수정만)

```
src/
├── shared/
│   ├── time/index.ts              # (수정) addMonths · monthOfWeek · monthLabel · monthGridSlots
│   └── ipc/
│       ├── channels.ts            # (수정) calendar 3종 · milestones 6종 · week.setMilestone
│       ├── contracts.ts           # (수정) 위 채널 계약
│       └── api.ts                 # (수정) window.api.calendar · window.api.milestones
├── main/
│   ├── db/repositories/
│   │   ├── drizzle.ts             # (수정) CalendarRepository · MilestonesRepository 구현
│   │   ├── calendar.test.ts       # 신규 — 범위 조회·술어 재료
│   │   └── milestones.test.ts     # 신규 — CRUD·배지 스냅샷·롤업 집계
│   ├── services/
│   │   ├── ports.ts               # (수정) 두 리포지토리 포트
│   │   ├── calendar.ts            # 신규 — 기록 있음 술어 · 월 조회 · 날짜 패널 · 공부한 날 수
│   │   ├── calendar.test.ts       # 신규
│   │   ├── milestones.ts          # 신규 — CRUD · 표시 모드 6분기 · 배지 · 롤업
│   │   └── milestones.test.ts     # 신규
│   └── ipc/
│       ├── calendar.ts            # 신규 — 핸들러 배선
│       └── milestones.ts          # 신규 — 핸들러 배선
├── preload/index.ts               # (수정) 표면 2개 도메인
└── renderer/
    ├── app/App.tsx                # (수정) MONTH 컬럼 + 우측 2단
    ├── shared/query/
    │   ├── keys.ts                # (수정) monthMilestones · dayRecord
    │   └── invalidate.ts          # (수정) 월 레이어 무효화 배선
    └── features/
        ├── calendar/
        │   ├── DisplayMonthProvider.tsx  # 신규 — 표시 대상 월 소유 (R26)
        │   ├── CalendarCard.tsx          # 신규 — 월 그리드 + 이동 컨트롤
        │   ├── MonthGrid.tsx             # 신규 — 셀 3채널
        │   ├── StudyDot.tsx              # 신규 — 토큰 기반 커스텀 점 (R14)
        │   ├── DayPanel.tsx              # 신규 — 날짜 기록 패널
        │   ├── useCalendar.ts            # 신규
        │   └── *.test.tsx                # 신규
        ├── milestones/
        │   ├── MilestoneCard.tsx         # 신규 — 표시 모드 6분기 렌더
        │   ├── MilestoneRow.tsx          # 신규 — 인라인 편집·완료·보관·삭제
        │   ├── CarryTitlesAction.tsx     # 신규 — R22 제목 복사
        │   ├── useMilestones.ts          # 신규
        │   └── *.test.tsx                # 신규
        ├── week/ItemDrawer.tsx           # (수정) 마일스톤 연결 셀렉트
        └── timer/TimerCard.tsx           # (수정) 공부한 날 수 행 (R27)
```

---

### Task 1: 용어 확정 — `CONTEXT.md` 를 코드보다 먼저 닫는다

카피를 쓰기 전에 용어를 정한다. 순서를 뒤집으면 구현이 곧 용어 결정이 되고, 용어집이 사후 추인 문서가 된다 ([CLAUDE.md](../../CLAUDE.md) — 용어 결정은 같은 PR 에서 CONTEXT.md 갱신).

- [ ] **Step 1:** **`할당`** 항목을 추가한다. 지금 `조각` 정의가 "할당을 쪼갠 실행 단위"라며 이 말에 기대는데 정작 정의가 없다. UI 카피는 이미 일관되게 `할당` 을 쓰고 있다([WeekCard.tsx:207](../../src/renderer/features/week/WeekCard.tsx) · [Planner.tsx:246](../../src/renderer/features/week/Planner.tsx) · [ItemDrawer.tsx:110](../../src/renderer/features/week/ItemDrawer.tsx)) — **새로 정하는 것이 아니라 이미 쓰이는 말을 기록하는 것**이다. 코드 식별자 `week_item` 표기는 유지한다. `_Avoid_`: 주간 항목, 아이템, 위크아이템.
- [ ] **Step 2:** **`마일스톤`** — 한 달의 결과물. 제목(상태 문장) 하나만 갖고 **수치를 갖지 않는다**. `_Avoid_`: 목표, 월간 목표, 월 계획.
- [ ] **Step 3:** **`보관`** — 마일스톤을 목록 표시에서만 제외하는 것. **삭제가 아니고 집계에 중립이다.** `_Avoid_`: 아카이브, 숨김, 감추기.
- [ ] **Step 4:** **`롤업`** — 마일스톤에 연결된 할당들의 소진을 **범위 라벨과 함께** 표시한 값. 지난달 카드의 `N/M 달성` 배지와는 별개다. `_Avoid_`: 진척률, 달성률(배지 전용어), 진행률.
- [ ] **Step 5:** **`공부한 날 수`** — 이번 주에 완료 focus 세션이 1회 이상 있던 날의 수. **연속 일수가 아니다.** `_Avoid_`: 스트릭, 연속 기록, 연속 일수.
- [ ] **Step 6:** 기존 항목은 건드리지 않는다. `docs/origin/`·`docs/decision-log/` 도 소급 수정하지 않는다.

**검증:** `CONTEXT.md` 에 5개 항목이 기존 형식(정의 + `_Avoid_`)대로 있고, `조각` 항목이 가리키는 `할당` 이 이제 정의를 갖는다.

---

### Task 2: 시간 모듈 — 달 산술

R2 가 "화면 코드에서 즉석 계산 금지"를 요구하는데 현재 모듈에는 `monthKey` 하나뿐이다. 달을 다루는 함수가 전부 없다.

- [ ] **Step 1:** `addMonths(monthKeyValue: string, n: number): string` — `'2026-08'` + n. 기존 `addDays`·`addWeeks` 와 같은 규율을 따른다: **이미 고정된 달력 키끼리의 산술**이므로 UTC 로만 세고 로컬 시각을 만들지 않는다.
- [ ] **Step 2:** `monthOfWeek(weekKeyValue: string): string` — 주 키(그 주 월요일 날짜)의 달. **R18 의 유일한 구현**이며, 이 함수 없이는 "주는 쪼개지지 않는다"가 호출부마다 재구현된다. 주석에 8/31~9/6 예시를 박아 둔다.
- [ ] **Step 3:** `monthLabel(monthKeyValue: string): string` — `'2026년 8월'`. 그리드 헤더와 카드 제목이 쓴다.
- [ ] **Step 4:** `monthGridSlots(monthKeyValue: string): { leadingBlanks: number; days: string[] }` — **월요일 시작** 기준 앞 빈 칸 수와 그 달의 날짜 키 배열 (calendar-records **R7** · **A4**). 그리드 컴포넌트가 이 결과만 렌더한다.
- [ ] **Step 5:** `monthRange(monthKeyValue: string): { from: string; to: string }` — `local_date` **범위 조회**용 경계 두 개 (**R3**). 리포지토리가 `BETWEEN` 에 그대로 넣는다. 이 함수가 없으면 호출부가 `'2026-08-01'` 을 문자열로 조립하게 되고 그 순간 규약이 샌다.
- [ ] **Step 6:** 테스트 — `addMonths('2026-12', 1) === '2027-01'` · `addMonths('2026-01', -1) === '2025-12'` · `monthOfWeek('2026-08-31') === '2026-08'` (그 주가 9/6 까지여도) · 1일이 수요일인 달의 `leadingBlanks === 2` (**A4**) · 윤년 2월의 `days.length === 29`.

**검증:** 위 5종 통과. `pnpm lint` 가 새 함수들에 대해 `TIME_SELECTORS` 위반을 보고하지 않는다 (모듈 안쪽이므로 정상).

---

### Task 3: 캘린더 리포지토리 — 범위 조회만

- [ ] **Step 1:** [ports.ts](../../src/main/services/ports.ts) 에 `CalendarRepository` 포트를 더한다. 메서드는 셋:
  - `focusCountsByDate(from, to): Map<string, number>` — 그 범위의 날짜별 **완료 focus 세션 수**
  - `pullDatesIn(from, to): Set<string>` — 그 범위에 `task_pulls` 행이 있는 날짜
  - `dayTasks(dayKey): DayTaskRow[]` — R18 의 **두 원천 합집합**에 필요한 재료
- [ ] **Step 2:** [drizzle.ts](../../src/main/db/repositories/drizzle.ts) 에 구현한다. **술어는 `local_date BETWEEN from AND to` 뿐**이다 (**R3** · **A3**). `strftime()`·`date()` 를 쓰지 않는다 — 쓰면 인덱스가 죽고, 그것이 A3 가 검사하는 바로 그것이다.
- [ ] **Step 3:** `focusCountsByDate` 는 `kind = 'focus'` 이고 완료된 세션만 센다 (**R12** — 휴식은 점 집계에서 제외). `task_id` 가 NULL 인 미분류 집중도 **포함한다** (**R13** · **A8**).
- [ ] **Step 4:** `dayTasks(dayKey)` 는 두 원천을 각각 조회해 돌려주고 **합집합은 서비스가 만든다** — 리포지토리가 도메인 규칙을 갖지 않는다 (ADR-008).
  1. `task_pulls.pull_date = dayKey` 인 행의 task (인덱스 `idx_task_pulls_date` 를 탄다)
  2. `sessions.local_date = dayKey` 인 세션이 연결된 task
  각 행에 **어느 원천에서 왔는지**를 실어 보낸다 (**R18** — 목록이 출처를 구분해 표시한다).
- [ ] **Step 5:** `removed_at` 이 찍힌 pull 행도 **원천 1 에 포함한다** (**R18** · **A11**). 치움 표시된 행을 숨기면 "그날 목록에 있었다"는 사실이 사라진다.
- [ ] **Step 6:** 테스트 (`calendar.test.ts`) — 인메모리 DB 로 실제 SQL 을 태운다:
  - 23:50 시작 → 00:15 종료 세션이 **시작일**에만 잡힌다 (**A1**) — `local_date` 가 이미 시작 시각 기준이므로 저장값 확인
  - 휴식 세션 5회만 있는 날이 `focusCountsByDate` 에 0 으로 나온다 (**A7**)
  - `task_id` NULL 인 focus 1회가 그 날짜에 1 로 잡힌다 (**A8**)
  - 같은 조각을 8/1·8/3 에 pull 하면 두 날짜 모두에 나온다 (**A9**)
  - 세션이 있는 조각을 `removed_at` 처리해도 `dayTasks` 에 남는다 (**A11**)

**검증:** 위 5종 통과. 생성된 SQL 에 날짜 함수가 0건 (**A3** — 쿼리 문자열을 스냅샷으로 검사한다).

---

### Task 4: 캘린더 서비스 — `기록 있음` 술어를 한 번만 정의한다

**이 태스크가 calendar-records 의 존재 이유다.** 술어가 두 곳에 생기면 리뷰 케이스 6 이 그대로 재발한다.

- [ ] **Step 1:** `services/calendar.ts` 에 술어를 만든다. **다른 어디에도 이 조건을 쓰지 않는다.**

  ```ts
  /** calendar-records R5. 점·조각 목록·빈 상태가 **이 함수만** 부른다. */
  function hasRecord(focusCount: number, hasPull: boolean): boolean {
    return focusCount >= 1 || hasPull
  }
  ```

- [ ] **Step 2:** `monthCalendar(uow, month)` — 한 화면 = 응답 하나. 날짜별로 `{ dayKey, hasRecord, dotLevel }` 을 돌려준다. `dotLevel` 은 **완료 focus 세션 수로만** 계산한다 (**R6** · **R11**): `0~3 → 'basic'`, `4+ → 'strong'`. **조각 수는 등급에 들어가지 않는다** — 세션 0 이고 pull 만 있는 날은 `hasRecord: true` + `dotLevel: 'basic'` 이다.
- [ ] **Step 3:** 미래 날짜를 특별 취급하지 않는다 (**R10** · **A18**). "오늘보다 뒤면 점 없음" 규칙을 두지 않는다 — 점은 기록 당시의 사실이고 오늘 표시는 현재 시각의 사실이며, 둘 다 참인 값을 그대로 보여준다.
- [ ] **Step 4:** `dayRecord(uow, dayKey)` — 날짜 패널 한 화면. 완료 focus 세션 수 + 조각 목록(두 원천 합집합, 중복 제거, 출처 표시) + `hasRecord`. 완료 여부는 `tasks.completed_at` 의 **NULL 여부로만** 판정한다 (**R19**) — `completed_at` 에 로컬 날짜 변환을 씌워 "대상 날짜보다 늦으면 미완료"로 만들지 **않는다.** 그 판정은 ADR-009 §2 가 금지한 조회 시점 파생이고, 타임존을 옮기면 과거 화면의 완료 표시가 뒤집힌다.
- [ ] **Step 5:** `studyDays(uow, week)` — `이번 주 N일 공부 중`. **여기만 다른 조건을 쓴다**: `완료 focus ≥ 1 인 날` 단독이며 pull 은 세지 않는다 (**R24** · **A23**). 이것이 R5 와 다른 **유일한 지점**이므로 함수 주석에 그 사실과 이유를 박아 둔다 — 없으면 다음 사람이 "버그"로 보고 통일한다.
- [ ] **Step 6:** 테스트 (`services/calendar.test.ts`, 페이크 리포지토리로 결정 순서만):
  - **focus 0회 + 완료 조각 3개**인 날: `hasRecord: true` · `dotLevel: 'basic'` (**A5** — 점 없음 + 목록 표시 조합이 발생하지 않는다)
  - focus 3회 → `'basic'`, 4회 → `'strong'`, focus 0 + pull 0 → `hasRecord: false` (**A6**)
  - 자유 집중 3회 + pull 0건인 날의 `dayRecord` 에 조각 3개가 **출처 = 세션**으로 나온다 (**A10**)
  - 8/1 pull · 8/5 완료한 조각이 **8/1 패널에서 완료로** 나온다 (**A12** — 문서가 명시적으로 수용한 동작)
  - 조각만 체크한 날이 `studyDays` 의 N 에 **포함되지 않는다** (**A23**)

**검증:** 위 5종 통과. `grep -rn "focusCount >= 1\|>= 1 ||" src/main src/renderer` 가 Step 1 의 함수 **한 곳**에만 걸린다 (성공 지표: 술어 참조의 단일성).

---

### Task 5: 캘린더 IPC

- [ ] **Step 1:** [channels.ts](../../src/shared/ipc/channels.ts) 에 `calendar` 도메인을 더한다: `month: 'calendar:month'` · `day: 'calendar:day'` · `studyDays: 'calendar:studyDays'`.
- [ ] **Step 2:** [contracts.ts](../../src/shared/ipc/contracts.ts) 에 계약을 쓴다. 요청은 달력 키 문자열이며 **형식을 zod 에서 거른다** — `z.string().regex(/^\d{4}-\d{2}$/)`. 렌더러가 조립한 문자열이 여기서 처음 검증된다.
- [ ] **Step 3:** 응답에 `dotLevel` 을 `z.enum(['basic', 'strong'])` 로 둔다. **`null` 등급을 만들지 않는다** — 점 없음은 `hasRecord: false` 로 표현되며, 두 필드가 같은 사실을 두 번 말하면 어긋날 수 있다.
- [ ] **Step 4:** [api.ts](../../src/shared/ipc/api.ts) · [preload/index.ts](../../src/preload/index.ts) 에 표면을 더한다. ADR-007 의 네 곳을 전부 채운다.
- [ ] **Step 5:** `main/ipc/calendar.ts` — `handleIpc` 배선만. 결정은 서비스에 있다.

**검증:** 타입체크 통과. `'2026-8'`(zero-pad 없음)·`'26-08'` 을 보내는 계약 테스트가 거부된다.

---

### Task 6: 캘린더 UI — 그리드·3채널·날짜 패널

- [ ] **Step 1:** `DisplayMonthProvider.tsx` — **표시 대상 월 상태를 이 기능이 소유한다** (**R26**). 초기값은 `useClock()` 의 `monthKey` 이며 renderer 가 직접 계산하지 않는다. 마일스톤 카드가 Task 9 에서 이 값을 **구독만** 한다.
- [ ] **Step 2:** 월 이동은 **표시 대상 월만** 바꾼다 (**R8**). 선택 날짜와 타이머 상태를 건드리지 않으므로, **표시 월과 선택 날짜의 달이 다른 상태가 정상**이다. 그때 그리드에 선택 강조가 없는 것도 정상이다.
- [ ] **Step 3:** 이동에 **범위 제한을 두지 않는다** (**R9** · **A17**). 기록 없는 과거·미래 달도 점 없는 그리드로 정상 렌더한다.
- [ ] **Step 4:** `MonthGrid.tsx` — `monthGridSlots` 의 결과만 렌더한다. 셀 상태는 **3채널 독립** (**R15** · **A19**):
  - 오늘 → 숫자 `--amber` + `--weight-semibold` (**숫자 채널 최우선**)
  - 선택 → 배경 `--glass-strong` · 보더 `--glass-border` · `--radius-md` (**배경 채널 단독**)
  - 기록 → 점 요소 (**점 채널 단독**)

  **선택을 숫자 색이나 점 색으로 표현하는 구현은 금지한다** — 그 순간 "오늘" 또는 "기록"이 지워진다.
- [ ] **Step 5:** `StudyDot.tsx` — lucide 아이콘도 이모지도 아닌 **토큰 기반 커스텀 SVG/CSS** (**R14** · **A25**). 기본 `--teal`, 진한 점은 큰 지름 + `--amber`.
- [ ] **Step 6:** `DayPanel.tsx` — 날짜 라벨은 **`YYYY년 M월 D일`** 로 **연도를 포함한다** (**R17** · **A16**). 표시 월과 선택 날짜의 달이 다를 수 있으므로 연도 없이는 어느 해 기록인지 오독된다.
- [ ] **Step 7:** 빈 상태는 `이날은 기록이 없어요` (**R21**). **선택 날짜가 오늘이고 focus 가 idle 일 때만** `자유 집중 시작` 고스트 버튼을 함께 렌더한다. 동작은 타이머 카드의 `시작` 과 **완전히 동일**하며 상태 기계는 timer 소유다 — 진입점일 뿐이다. **과거·미래 날짜에는 CTA 를 두지 않는다** (없는 행동을 권하는 버튼은 거짓말이다).
- [ ] **Step 8:** 요약 줄 — 조각이 있으면 `할 일 2/3 완료` 를 함께, 없으면 집중 횟수만 (**R20**).
- [ ] **Step 9:** 테스트:
  - `오늘 + 선택 + 진한 점` 이 겹친 셀에서 세 가지가 **모두 동시에** 보인다 (**A19**)
  - 다음 달로 이동해도 선택 날짜와 패널 내용이 유지되고, 그 그리드에 선택 강조가 없다 (**A16**)
  - 미래 날짜를 선택할 수 있고 과거와 **같은** 빈 상태 문구가 뜬다 (**A20**)
  - 기록 없는 오늘 + idle 에서 CTA 가 보이고, 기록 없는 과거·미래에는 **DOM 에 없다** (**A14-1**)
  - 1일이 수요일인 달의 앞 빈 칸이 2개 (**A4**)

**검증:** 위 5종 통과 + 카드 단독 렌더에서 콘솔 경고 0.

---

### Task 7: 마일스톤 리포지토리·서비스 — 표시 모드와 배지

- [ ] **Step 1:** `MilestonesRepository` 포트 — `listForMonth(month)` · `create` · `rename` · `setCompleted` · `setArchived` · `remove` · `badgeCounts(month)` · `rollup(month, week)`.
- [ ] **Step 2:** `listForMonth` 는 **보관되지 않은 것만** 돌려준다 (**R11** — 보관은 목록 표시에서만 제외). 정렬은 `sort_order` 오름차순, 동일 시 행 id (**R10**).
- [ ] **Step 3:** `badgeCounts(month)` 는 **보관 여부와 무관하게** 센다 (**R21** · **A21**):
  - `M` = 그 달에 존재하는(물리 삭제되지 않은) 마일스톤 수
  - `N` = 그중 `completed_at IS NOT NULL` 인 수
  - `archivedCount` = 보관 건수 (배지에 함께 표시 — **R23**)

  **쿼리에 `archived_at IS NULL` 을 넣지 않는다.** 넣는 순간 보관만으로 달성률을 조작할 수 있게 되고, 그것이 D4 가 막으려던 결함이다.
- [ ] **Step 4:** `rollup(month, week)` — 그 달 마일스톤들에 연결된 할당 중 **`week_items.week = week`** 인 것들의 소진 합과 `est_pomos` 합. 집계 술어는 ADR-012 §1 그대로 (`sessions.local_week = week_items.week` 인 `kind='focus'`). **마일스톤은 어떤 세션도 직접 참조하지 않는다** (**R12** · **R16**).
- [ ] **Step 5:** `services/milestones.ts` 에 **표시 모드 6분기를 한 곳에** 구현한다 (**R20**). 위에서 아래로 처음 참인 행 하나이며, 화면이 이 `if` 를 다시 쓰지 않는다:

  | 순서 | 조건 | 모드 |
  |---|---|---|
  | 1 | `month > 다음 달` | `far-future` |
  | 2 | `month === 다음 달` | `lead-edit` |
  | 3 | `month === 이번 달 && M === 0` | `current-empty` |
  | 4 | `month === 이번 달` | `edit` |
  | 5 | `month < 이번 달 && M >= 1` | `past` |
  | 6 | `month < 이번 달 && M === 0` | `past-empty` |

  판별은 **문자열 사전순 비교만** 쓴다 (**R2** · **A2**). "다음 달"은 `addMonths(오늘 월, 1)` 로 구한다.
- [ ] **Step 6:** 롤업을 붙일지 판정한다. **진행 중인 주의 귀속 달(`monthOfWeek(현재 주)`)이 대상 달과 같을 때만** 숫자를 싣고, 다르면 `null` 을 실어 화면이 사실 문구를 쓰게 한다 (**R18** · **R23** · **A17**). 8/31~9/6 주 동안 9월 카드는 숫자 대신 문구다.
- [ ] **Step 7:** `carryCandidates(month)` — 직전 달의 `completed_at IS NULL` 인 마일스톤. **보관 여부와 무관하게** 후보로 낸다 (**R22**). 0건이면 화면이 액션을 렌더하지 않는다.
- [ ] **Step 8:** 테스트:
  - `'2026-07'`·`'2026-08'`·`'2026-09'` 세 값이 문자열 비교만으로 정확히 갈린다 (**A2**)
  - 3건 중 1건 완료된 달에서 나머지 2건을 보관해도 배지가 `1/3` 이고, 해제로 왕복해도 `N`·`M` 이 불변 (**A21**)
  - `M === 0` 이면 배지가 `null` (**A22** — `0/0 달성`이 만들어지지 않는다)
  - `local_week` 가 항목의 `week` 와 다른 세션이 롤업을 올리지 않는다 (**A14**)
  - 지난주 소진이 이번 주 롤업에 포함되지 않는다 (**A15**)
  - 달을 넘긴 이월 항목의 소진이 **원래 마일스톤이 놓인 달**로 올라간다 (**A13**)

**검증:** 위 6종 통과. **A21 은 이 태스크의 존재 이유**라 실패하면 다음으로 넘어가지 않는다.

---

### Task 8: 마일스톤 IPC

- [ ] **Step 1:** `channels.ts` 에 `milestones` 도메인: `forMonth` · `create` · `rename` · `setCompleted` · `setArchived` · `remove` · `carryTitles`.
- [ ] **Step 2:** `forMonth` 응답에 **표시 모드·배지·롤업을 서버가 실어 보낸다.** 모드 판정을 렌더러가 하면 R20 의 순서가 화면으로 새어나간다.
- [ ] **Step 3:** 제목은 `z.string().trim().min(1)`. **수치 필드를 계약에 두지 않는다** (**R3** · **A3**) — 계약에 없으면 화면이 만들 수 없다.
- [ ] **Step 4:** `remove` 는 확인을 **화면에서** 받고 계약은 id 만 받는다. 확인 UI 가 계약의 관심사가 아니다.
- [ ] **Step 5:** `carryTitles` 는 **제목 배열만** 받아 그 달에 새 행을 만든다 (**R22**). 원본 id 를 받지 않는다 — 받으면 "원본을 건드릴 수도 있다"는 여지가 계약에 남는다.
- [ ] **Step 6:** `week.setMilestone` 도 함께 더한다 (Task 10 이 쓴다). 요청은 `{ weekItemId, milestoneId: string | null }` 이며 **`null` 은 연결 해제**다.

**검증:** 타입체크 통과. 빈 제목·공백 제목이 거부되고, 수치 필드를 실은 요청이 `strictObject` 에서 거부된다.

---

### Task 9: 마일스톤 카드 UI

- [ ] **Step 1:** `MilestoneCard.tsx` — `DisplayMonthProvider` 의 값을 **구독만** 한다. **자기 월 상태를 갖지 않는다** (**R26** · **A24**). 이 카드에 월 선택기·탭·모달을 만들지 않는다 (**R19** · **A18**).
- [ ] **Step 2:** 서버가 준 모드로 분기한다. 6모드의 렌더를 각각 만들되 **조건을 다시 계산하지 않는다.**
- [ ] **Step 3:** `M1`·`M2` 라벨은 **표시 순서에서 파생하는 렌더 전용 값**이다 (**R5** · **A5**). 저장하지 않고 어떤 참조 키로도 쓰지 않는다 — 참조는 항상 행 id.
- [ ] **Step 4:** 개수 제한을 걸지 않는다 (**R4** · **A4**). 2~3개는 **권장 힌트**일 뿐이고 4개 이상이어도 저장을 막거나 경고색을 쓰지 않는다.
- [ ] **Step 5:** 삭제는 확인을 1회 받는다 (**R8** · **A8**). 확인 문구는 잃는 것을 **사실로** 말한다 — 제목이 사라지고 연결이 끊기지만 **소진 기록은 남는다**. `--danger` 는 이 확인의 파괴적 조작 표기에만 쓰고 성과·진척 표현에는 쓰지 않는다 (**R24**).
- [ ] **Step 6:** 문구는 사실만 말한다 (**R23**). 빈 상태 `이번 달이 끝나면 뭐가 달라져 있을까요?`, 다음 달 `아직 계획 전` + `N월 계획 잡기`, 먼 미래 `10월은 9월 1일부터 계획할 수 있어요` 류, 지난달 배지 `N/M 달성` (보관 있으면 `· 보관 K건`), 마일스톤 0건인 지난달 `이 달은 계획 없이 지나갔어요`.
  **금지:** `미달성`·`실패`·`N건 남음` 같은 부정·결핍 프레임과 훈계 문구 (**A24**). 완료되지 않은 마일스톤에 별도 부정 표기를 붙이지 않는다 — **완료 표시의 없음으로만** 드러난다.
- [ ] **Step 7:** 롤업은 **언제나 범위 라벨과 함께** — `이번 주 3/8` (**R17** · **A16**). 분모가 0 이면 분수 대신 개수만 라벨과 함께. 서버가 롤업을 `null` 로 주면 `이번 주(8/31~9/6)는 8월에 속한 주예요` 류 사실 문구 (**A17**).
- [ ] **Step 8:** `CarryTitlesAction.tsx` — 이번 달 빈 상태에서만, 후보가 1건 이상일 때만 렌더한다. **제목만** 복사하고 원본을 수정·삭제·자동 보관하지 않는다 (**A23** — 직전 달 배지가 변하지 않는다).
- [ ] **Step 9:** 지난달 카드는 감쇠(`--ink-dim`) + **보관·해제만** 허용한다 (**R20** 순서 5 · **A20**). 제목 수정·완료 토글·해제·삭제 진입점이 **DOM 에 없다.**
- [ ] **Step 10:** 테스트: **A5**(라벨 재배치가 참조를 바꾸지 않음) · **A6**(다음다음 달에 편집 진입점 없음) · **A9**(지난달에 해제 조작 없음) · **A19**(계획 없던 지난달에 배지·CTA 없음) · **A20**(지난달에서 보관만 동작) · **A22**(0건이면 배지 없음) · **A24**(부정 표기 0건) · **A25**(이모지 0건).

**검증:** 위 8종 통과.

---

### Task 10: week-plan — 마일스톤 연결 입력

**이것이 없으면 `milestone_id` 가 영원히 NULL 이고 Task 7·9 의 롤업이 죽은 코드가 된다.** milestones PRD 가 이 UI 의 소유를 week-plan 으로 넘겼으므로(비범위), 이번에는 **연결 입력 하나만** 만들고 태그 배지 표시는 만들지 않는다.

- [ ] **Step 1:** [ItemDrawer.tsx](../../src/renderer/features/week/ItemDrawer.tsx) 헤더에 마일스톤 셀렉트를 더한다. 값은 `milestoneId | null` 이고 **`연결 없음` 이 정상 선택지**다 (**R13** · **A11** — 연결 없음은 오류가 아니며 누락으로 표시하거나 연결을 요구하는 문구를 띄우지 않는다).
- [ ] **Step 2:** 후보는 **그 할당의 주가 귀속된 달(`monthOfWeek(item.week)`)의 마일스톤 + 보관되지 않은 것**으로 제한한다 (**R14** · **A12**). 8월 주의 항목에서 9월 마일스톤이 후보에 나오면 안 된다.
- [ ] **Step 3:** 후보 계산은 **서버에서** 한다 — 드로어 응답에 후보 목록을 실어 보낸다. 렌더러가 `monthOfWeek` 를 부르고 보관을 거르면 R14 가 두 곳이 된다.
- [ ] **Step 4:** 이월로 만들어진 항목의 **기존 연결은 후보 제한과 무관하게 유지된다** (**R15**). 셀렉트가 현재 값을 후보에서 못 찾아도 **지우지 않는다** — 타월 연결은 정상 상태이며, 그것이 R15 가 만든 유일한 합법 경로다. 현재 값이 후보 밖이면 그 항목을 비활성 옵션으로 함께 보여준다.
- [ ] **Step 5:** 8/30 일요일에 9월 마일스톤을 만들고 그 자리에서 연결할 수 있어야 한다 (**A7**) — 선행 편집(**R6**)과 후보 제한(**R14**)이 함께 성립하는 경로다.
- [ ] **Step 6:** 테스트 — **A12**(8월 주에서 9월·보관 마일스톤이 후보에 없음) · **A11**(미연결에 경고 문구 없음) · **A7**(선행 편집 + 연결) · 이월 항목의 타월 연결이 드로어를 열어도 유지됨.

**검증:** 위 4종 통과.

---

### Task 11: 타이머 카드 — `공부한 날 수` 행

- [ ] **Step 1:** [TimerCard.tsx](../../src/renderer/features/timer/TimerCard.tsx) 하단에 행을 더한다. **데이터와 카피의 소유는 calendar-records** 이고 타이머는 **자리만** 갖는다 (**R27**) — 컴포넌트를 `features/calendar/` 에 두고 타이머가 그것을 배치한다.
- [ ] **Step 2:** 문구는 `이번 주 N일 공부 중`, N=0 이면 `오늘부터 기록이 쌓여요` (**R24** · **R25** · **A22**).
- [ ] **Step 3:** 끊긴 날·못 한 날을 세거나 실패로 프레이밍하지 않는다 (**R25**) — 연속 기록 중단 경고 류 표현 금지.
- [ ] **Step 4:** 테스트 — 같은 주 월요일·일요일에 세션이 있고 사이가 비면 `이번 주 2일 공부 중` 이며 **끊김 경고가 없다** (**A21**). 세션 0 인 새 DB 에서 `오늘부터 기록이 쌓여요` (**A22**).

**검증:** 위 2종 통과.

---

### Task 12: 셸 배치와 무효화

- [ ] **Step 1:** [App.tsx](../../src/renderer/app/App.tsx) 를 ux-spec §2 의 **와이드 3컬럼**으로 맞춘다: 좌 MONTH(마일스톤 카드 + 캘린더 카드) / 중 타이머 / 우 WEEK + TODAY **세로 2단**. 현재는 타이머·주간·오늘이 나란한 3컬럼이라 우측이 두 컬럼으로 갈라져 있다 — §2 는 그 둘을 한 컬럼에 쌓는다.
- [ ] **Step 2:** 두 MONTH 카드를 **같은 컬럼에 인접 배치**한다 (ux-spec §2) — 달 이동 연동이 시야 안에서 일어나야 한다. `DisplayMonthProvider` 가 이 컬럼을 감싼다.
- [ ] **Step 3:** **반응형을 만들지 않는다.** 미디엄·컴팩트 구간과 MONTH 오버레이 토글(§3.1)은 이번 범위 밖이다. App.tsx 주석의 `반응형은 만들지 않는다` 를 **남기고** 카드 개수만 정정한다.
- [ ] **Step 4:** 스크롤 규칙을 지킨다 (ux-spec §2.1) — 카드는 flex column, 고정 요소는 `flex-shrink: 0`, 스크롤 영역만 `flex: 1; min-height: 0; overflow-y: auto`. 창 루트는 `overflow: hidden`.
- [ ] **Step 5:** [keys.ts](../../src/renderer/shared/query/keys.ts) — `monthCalendar(monthKey)` 와 `monthAll()` 은 **이미 있다** (M2 가 이 자리를 예약해 뒀다). 더할 것은 `monthMilestones(monthKey) = ['month', monthKey, 'milestones']` 와 `dayRecord(dayKey) = ['day', dayKey, 'record']` 두 개다. **`monthAll()` prefix 에 걸리도록** `['month', …]` 아래에 둔다.
- [ ] **Step 6:** [invalidate.ts](../../src/renderer/shared/query/invalidate.ts) 배선:
  - 세션 완료 → `monthAll()` (점·패널·공부한 날 수·롤업이 전부 바뀐다) + 기존 대상
  - 마일스톤 변경 → `monthMilestones(그 달)`. **캘린더는 털지 않는다** — 마일스톤은 점에 영향을 주지 않으므로, 넣으면 아무것도 안 바뀌는 재조회가 생기고 그것이 다음 사람에게 "마일스톤이 캘린더를 바꾼다"는 오해를 심는다
  - 연결 변경(`week.setMilestone`) → `monthMilestones` + `keys.week(그 주)`
  - 자정 경계 → `monthAll()` 도 함께 (오늘 강조와 표시 대상 월 초기값이 바뀐다)
- [ ] **Step 7:** 테스트 — 세션 완료 이벤트가 `monthAll()` 을 털고, 마일스톤 변경이 `monthCalendar` 를 **털지 않는다.**

**검증:** 위 2종 통과 + 앱을 띄워 두 카드가 같은 달을 말한다 (**A24**).

---

### Task 13: 문서 정정

- [ ] **Step 1:** 위 **"함께 고치는 문서·주석"** 표를 전부 처리한다. Task 1 에서 이미 처리한 CONTEXT.md 는 제외.
- [ ] **Step 2:** `grep -rn "마일스톤, 달력\|아직 없는 것\|1\.2\.0 달력\|후속 PR" README.md PRODUCT.md docs/features/` 로 잔여 표현을 확인한다. **`docs/origin/`·`docs/decision-log/`·`docs/plans/` 는 소급 수정 금지 대상이라 제외**한다.
- [ ] **Step 3:** README 로드맵에서 `1.1.0` / `1.2.0` 2단계를 한 버전으로 합치되, **반응형 셸·트레이는 그대로 남긴다.**
- [ ] **Step 4:** PRODUCT.md 의 "밀린 넷" 목록에서 마일스톤·달력 두 줄을 빼고 **반응형 셸·트레이 두 줄은 남긴다.** 반응형 항목의 근거 문장("접을 MONTH 열이 위 둘 중 하나로 생겨야 의미가 있다")은 **이제 조건이 충족됐으므로** 그 사실을 반영해 고친다.

**검증:** Step 2 의 grep 이 제외 경로 밖에서 0건.

---

### Task 14: 마무리 검증

- [ ] **Step 1:** 자동 검증 5종 통과 — `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm build`.
- [ ] **Step 2:** `pnpm test:e2e` 로컬 통과 (기존 케이스 회귀 확인). **새 E2E 케이스는 MONTH 컬럼이 뜨는지 하나만** 더한다 — 나머지 불변식은 날짜·타임존을 넘나드는 것이라 단위 테스트가 정확하고 빠르다.
- [ ] **Step 3:** 손으로 확인한다 (실측 결과를 이 문서 하단에 기록):
  - 캘린더에서 이전 달로 이동 → 마일스톤 카드가 **같은 달로 함께** 전환된다 (**A24**)
  - 마일스톤을 만들고 할당에 연결 → 그 할당에서 focus 1회 → **롤업이 `이번 주 1/N` 로** 오른다 (**A14**)
  - 3건 중 1건 완료 상태에서 2건 보관 → 배지가 `1/3 달성 · 보관 2건` (**A21**)
  - 기록 없는 오늘을 선택 → `자유 집중 시작` 이 보이고, 과거 날짜에는 안 보인다 (**A14-1**)
  - `오늘 + 선택 + 진한 점` 이 겹친 셀에서 세 가지가 모두 읽힌다 (**A19**)
- [ ] **Step 4:** PR 생성 (제목·본문 **영어**, Conventional Commits). 제목안: `feat: add the month layer with milestones and the calendar`

**검증:** Step 1·2 전부 통과, Step 3 의 5항 실측 기록.

---

## 다음으로 넘기는 메모

- **반응형 셸이 이제 의미를 갖는다.** MONTH 컬럼이 실재하므로 §3.1 의 토글이 열 대상이 생겼다 — `아무것도 열지 않는 버튼` 문제가 해소됐다.
- **`week_items.milestone_id` 에 처음으로 실 데이터가 흐른다.** 이월 승계(ADR-012 §3)는 구현돼 있었지만 값이 항상 NULL 이라 한 번도 검증되지 않았다. **A13** 을 실물에서 다시 확인할 가치가 있다.
- **시점별 완료 여부 복원**은 여전히 열려 있다. 불변 완료 달력 키 컬럼이 필요하고 그것은 ADR 선행 사안이다 (calendar-records **R19** 아래 가정 블록).
- **월 누적 소진 집계**(Q15)는 이제 재료가 전부 있다. 넣기로 하면 milestones **R17** 의 "범위 라벨 필수" 규칙을 먼저 손봐야 한다 — 라벨 없는 숫자를 금지한 것이 그 규칙이기 때문이다.
