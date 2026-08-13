# 시간 통화 전환 구현 계획 (2.0.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

> **개정 이력:** 2026-08-12 초안 → **2026-08-13 개정.** 착수 전 4인 감사(코드 현실성 ·
> 스키마 마이그레이션 · UX 예외 · 문서 정합성)에서 실행 불가능한 지시와 결정 공백이
> 나왔다. 공백은 [ADR-031](../architecture/decisions/adr-031-settlement-without-est.md)·
> [ADR-032](../architecture/decisions/adr-032-destructive-migration-safety.md) 로 메웠고,
> 이 문서는 그 결정을 반영해 태스크를 다시 짠 것이다. 초안과 달라진 지점은 각 태스크의
> **⚠︎ 감사 결과** 블록에 적었다.

**Goal:** 계획의 통화(예상 뽀모·예산·가용량)를 걷어내고, 진행 표시를 **세션에서
파생하는 측정 시간**으로 바꾼다. 뽀모 길이 편집은 **다음 세션부터 즉시** 효력을 갖는다.
끝나면 2.0.0 이다.

**Architecture:** 새 측정 장치가 없다 — `sessions.duration_sec` 가 이미 모든 세션의
타이머 실행 초를 저장한다. 이 계획이 더하는 것은 **합산 조회**(주·항목·차액·마일스톤
귀속)이고, 빼는 것은 개수 계획의 저장소(`est_pomos` ×2 · `weeks` 테이블 ·
`weekly_capacity`)와 그것을 소비하던 로직·UI 전부다. 귀속 판정은 기존 집계 술어
(ADR-012 §1~§3)를 그대로 쓴다 — 세션의 주는 저장된 `local_week`, 항목 귀속은
`task_id` 체인이다.

**Tech Stack:** 기존 스택 그대로. **추가 의존성 없음.**

## Global Constraints

M1~월 레이어 계획의 Global Constraints 가 전부 그대로 적용된다 (pnpm 전용,
`handleIpc` 로만 IPC 등록, Drizzle import 는 `src/main/db/` 만, `src/shared/` 순수 TS,
시간은 `src/shared/time/` 초크포인트, UI 이모지 금지·토큰만, 커밋 영어 Conventional
Commits, husky 훅 우회 금지). 여기에 이번 것:

- **측정 시간을 저장하지 않는다.** 합산은 조회 시점 파생이다. "성능을 위해" 라도
  집계 컬럼·캐시 테이블을 만들지 않는다 — 두 화면이 다른 숫자를 말하는 상태를
  구조적으로 불가능하게 유지한다 (PRODUCT.md 원칙).
- **합산 대상은 완료 focus 세션뿐이다.** 휴식 세션은 시간 통화에도 산입하지 않는다
  (ADR-030 §5). 진행 중인 세션도 완료 전까지 산입하지 않는다 (ADR-031 §3).
- **반올림은 표시 직전 한 번뿐이다.** 차액·합산은 전부 초 단계에서 끝내고, main 은
  초를 내려보낸다. 분으로 미리 접은 값을 계약에 담지 않는다 (ADR-031 §2).
- **renderer 는 시간을 재계산하지 않는다.** 주·항목 귀속과 합산은 main 이 하고,
  renderer 는 받은 초를 포맷만 한다.
- **개수 표시를 되살리지 않는다.** "정보가 아쉬우니 뽀모 횟수도 병기" 류 확장은
  이 계획의 범위 밖이다 — Q4 에서 기각된 선택지다 (결정 원장 참조).
- **커밋 메시지에 한글을 쓰지 않는다 — 백틱 안이라도 막힌다.** 로컬 `commit-msg`
  훅의 `no-hangul` 은 백틱을 구분하지 않는다 (`commitlint.config.js`). 도메인 용어를
  인용해야 하면 영어로 풀어 쓴다.
- **작업 브랜치는 `feature/time-currency` 하나**이며 태스크마다 커밋한다.

## 이 계획서가 인용하는 결정 (소유자는 기존 문서다)

계획은 결정을 만들지 않는다 (docs/CLAUDE.md). 문서와 이 계획서가 어긋나면 문서가 이긴다.

| 항목 | 소유 문서 | 요지 |
|---|---|---|
| 길이 편집 즉시 효력, 스냅샷 폐지 | [ADR-029](../architecture/decisions/adr-029-baseline-immediate-effect.md) | 저장 즉시, 적용은 다음 세션 시작부터. `유효 베이스라인(week)` 계약 폐기 |
| 통화 교체·삭제 목록·화면별 표시 | [ADR-030](../architecture/decisions/adr-030-time-as-progress-currency.md) | est·budget·capacity·`weeks` 삭제, 측정 시간은 조회 시점 파생 |
| **처분 2택 · 차액 유지 · 측정 시간 정의** | **[ADR-031](../architecture/decisions/adr-031-settlement-without-est.md)** | **`줄여서` 제거, `기타` 행은 초 단계 차액, 진행 중·중단 세션은 미산입** |
| **파괴적 마이그레이션 절차** | **[ADR-032](../architecture/decisions/adr-032-destructive-migration-safety.md)** | **FK 토글은 트랜잭션 바깥, 사후 `foreign_key_check`, 데이터 든 DB 로 테스트** |
| 귀속 술어 | [ADR-012](../architecture/decisions/adr-012-aggregation-predicate.md) §1~§3 | 세션의 주 = 저장된 `local_week`, 이월 재부모화 규칙 |
| 차액 정의역 | [ADR-027](../architecture/decisions/adr-027-other-row-domain.md) | 폐기 취소 — 통화만 교체해 유효 (ADR-031 §2) |
| 결정 과정·기각지 | [결정 원장 2026-08-12](../decision-log/2026-08-12-time-currency-session.md) | Q1~Q6, 미결 3건 (셋 다 출시를 막지 않는다) |
| 용어 | [CONTEXT.md](../../CONTEXT.md) | `측정 시간` 정의, 처분 2택, 폐기 용어 표 |

## 태스크 순서와 그 이유

앱은 **모든 태스크 경계에서 켜지고 동작해야 한다** (CI 그린). 그래서 스키마 제거가
마지막이다 — Task 1~4 동안 est 컬럼·`weeks` 테이블은 존재하되 **아무도 읽지 않는 상태**로
내려가고, Task 5 가 빈 껍데기를 걷는다.

**단, `weeks` 행 생성만은 예외다.** `sessions.local_week` 가 `weeks.week` 를 FK 로
참조하므로(ADR-019 §6), `repos.weeks.ensure` 는 **Task 5 의 마이그레이션이 FK 를 걷어낼
때까지 반드시 살아 있어야 한다.** 초안이 Task 1 에서 "기대하지 않으면 끊는다"고 열어 둔
분기는 닫혔다 — 기대한다.

---

### Task 0 — 결정 선행 (완료)

- [x] ADR-031(처분 2택·차액 유지·측정 시간 정의) · ADR-032(마이그레이션 절차) 작성
- [x] ADR-006·019·021·022 폐기 표기 추가, ADR-027 폐기 취소
- [x] CONTEXT.md 의 `측정 시간` 정의 교체, 처분 2택 반영, 폐기 용어 표 추가

### Task 1 — 길이 편집 즉시 효력 (ADR-029 실행분)

**대상:** `src/main/services/baseline.ts` · `timer-host.ts` · `sessions.ts` ·
`week-plan.ts` · `review.ts` · `ports.ts` · `src/main/db/repositories/drizzle.ts` ·
`src/shared/ipc/contracts.ts` · `src/renderer/features/baseline/` ·
`src/renderer/features/review/ConfirmSection.tsx`

> **⚠︎ 감사 결과** — 초안이 지목한 문구는 `BaselineForm` 이 아니라 정산 패널에 있다.
> `weekSnapshot` 은 삭제가 아니라 **축소**만 가능하다 (소비자 3곳이 FK 때문에 살아야
> 한다). 삭제 대상 테스트 2개의 소재지가 초안 대상 목록 밖이었다.

- [ ] `effectiveBaseline(repos, week)` 의 스냅샷 폴백을 제거하고 `globalBaseline(repos)`
  직독으로 대체한다. 소비자는 `timer-host.ts` 와 정산 패널 표시 두 곳이다.
- [ ] `getBaseline`/`setBaseline` 계약에서 `capacity`·`basisPomos`·`basisSource` 를
  제거한다 — 남는 것은 길이 3종뿐이다. `writeBaseline` 에서 `weekly_capacity` 쓰기
  경로를 제거한다. (`settings` 의 행 자체는 Task 5 가 지운다.)
- [ ] `BaselineForm` 에서 요일별 가용량 7칸과 총 집중 시간 비교(R26)를 제거한다.
- [ ] **`ConfirmSection.tsx` 의 `바꾼 길이는 다음 주부터 적용돼요 · 이번 주 기록은
  그대로예요` 를 교체한다** — ADR-029 로 거짓이 된 문장이다. 최종 문구는
  `weekly-review/ux-spec.md` 소관이므로 **그 문서를 먼저 고치고 코드가 따른다**
  (ADR-029 §4). `ReviewPanel.test.tsx` 의 단언도 함께 옮긴다.
- [ ] `weekSnapshot` 을 **축소한다** — `capacity`·`budget` 을 항상 `null` 로 넘기고
  `baselineBasis` 를 제거한다. 함수와 호출부(`sessions.ts`·`week-plan.ts`·`review.ts`)는
  남는다. `ports.ts` 의 `WeekSnapshot` 타입을 함께 좁힌다.
- [ ] 삭제·수정할 테스트: `src/main/services/budget.test.ts`(`weekSnapshot` 테스트가
  여기 있다) · `src/main/db/repositories/baseline.test.ts`(`effectiveBudget`·
  `baselineBasis`) · `src/shared/ipc/contracts.test.ts`(`basisPomos`·`basisSource`) ·
  `BaselineForm.test.tsx` · `ReviewPanel.test.tsx`
- [ ] 테스트: 길이 변경 → 진행 중 세션은 기존 길이 유지, **다음 세션부터** 새 길이
  (`timer-engine.test.ts` 의 "주 경계에서 바뀐다" 시나리오를 "다음 세션에서 바뀐다"로
  교체).
- [ ] 문서: `docs/features/pomo-baseline/` prd·overview 를 ADR-029·030 기준으로
  재작성한다. **폐기 범위는 R1·R7~R28** (초안의 `R7~R26` 은 양끝이 잘렸다 — R1 은
  "집계는 횟수", R27·R28 은 예산 초과·유효 예산이다). R5·R6(길이 하한·기본값·시딩)은
  생존. `docs/features/timer/overview.md` 의 ADR-013 "다음 주 경계부터" 참조도 정정한다.

**검증:** `pnpm test && pnpm typecheck && pnpm lint`. 수동: 조정에서 길이 변경 →
타이머 새 세션이 새 길이로 시작.

### Task 2 — 측정 시간 파생 조회 + 표기 규칙 확정

**대상:** `src/main/db/repositories/` · `src/main/services/` · `src/shared/ipc/contracts.ts`
· `src/renderer/shared/` · 각 기능 문서

> **⚠︎ 감사 결과** — 초안의 "자유 focus(항목 미귀속) 초"는 ADR-031 §2 가 **차액**으로
> 바꿨다. 표기 규칙은 계획이 정할 수 없다 (ADR-030 §5 가 기능 문서 소관이라고 명시) —
> 그래서 이 태스크는 **문서를 먼저 고치고 코드가 따른다.**

- [ ] **표기 규칙을 기능 문서에 먼저 확정한다.** ux-spec 이 있는 기능은 ux-spec
  (`week-plan`·`weekly-review`), 없는 기능은 prd 의 표시 요구사항
  (`today-tasks`·`milestones`)이 소유한다. 다음 케이스를 빠짐없이 답해야 한다:

  | 케이스 | 왜 실재하는가 |
  |---|---|
  | 1분 미만 (0초 포함) | `duration_sec >= 0` 이 허용된다. 시작 직후 `완료 처리` 가 몇 초짜리 세션을 만든다 |
  | 0 과 "0으로 표시되는 값"의 구분 | 30초짜리 세션이 있는데 `—` 를 띄우면 시간이 증발한 것처럼 보인다 |
  | 정각 60분 | `1시간` 인가 `1시간 0분` 인가 |
  | 세 자리 시간 | 정산은 여러 주를 병합하므로 수백 시간이 정상 경로다. tabular-nums 폭 |
  | 반올림 방향 | 표시 단계에서만 일어나므로 항등식은 안전하지만, 방향은 정해야 한다 |
  | 마일스톤 롤업의 `null` vs `0` | R17·R18 이 "롤업 없음"과 "0" 을 다른 사실로 요구한다. `0 은 —` 규칙이 둘을 뭉갠다 |
  | 빈 상태 | 세션 0인 주·항목·마일스톤. 개수 시절 "도트 0개"의 시각적 등가물이 없다 |

- [ ] 리포지토리에 합산 조회를 더한다: **주 총 focus 초** · **항목별(week_item) focus
  초** · **오늘 항목별(task) focus 초** · **마일스톤 귀속 주 focus 초**. 전부 완료
  focus 세션만, 주 판정은 저장된 `local_week`.
- [ ] **`기타` 행은 차액이다** — `주 총 focus 초 − Σ(화면에 보이는 항목의 focus 초)`.
  Σ 의 정의역은 ADR-027 §1 그대로(`is_system = 0 AND dropped_at IS NULL AND
  deleted_at IS NULL`), 표시 조건 3갈래도 유지하되 세 번째를 `차액 > 0` 으로 읽는다.
  기존 `otherRowSpent` 를 초 단위로 옮기는 것이지 새로 만드는 것이 아니다.
- [ ] **조각(task) 합산의 주 조건을 명시적으로 정한다.** 현재 항목 단위 집계에는 주
  조건이 있고 조각 단위에는 **의도적으로 없다**(`drizzle.ts` 주석 — "이 조각으로 몇
  뽀모 했나"). 이월된 조각에서 오늘 목록은 `1시간 30분`, 주간 카드는 `0분` 이 된다.
  개수 도트로는 넘어갔지만 시간으로는 크게 읽히므로, **어느 쪽이든 해당 기능 문서에
  적고 그 근거를 남긴다.**
- [ ] IPC 계약의 행 스키마에 초 단위 필드를 더한다 (`measuredSec`). 기존
  `spentPomos`·`estPomos` 필드는 이 태스크에서 지우지 않는다 — UI 교체(Task 3·4)가
  끝난 뒤 계약에서 걷는다.
- [ ] renderer 포맷터 하나를 `src/renderer/shared/` 에 둔다. 규칙의 소유자는 위 기능
  문서이고 유틸은 그 규칙의 단일 구현이다. `CaptureBar` 의 기존 분 표기도 이 유틸로
  통일한다.
- [ ] 테스트: 휴식 세션 미산입 · 미완료 세션 미산입 · 이월 재부모화 후 귀속 이동 ·
  **폐기된 항목의 시간이 차액으로 흘러드는지**(ADR-027 A24 의 시간판) · 차액이 초
  단계에서 계산되는지.

**검증:** `pnpm test`. 이 태스크는 UI 를 바꾸지 않는다.

### Task 3 — UI 통화 교체 (오늘 · 주간 · 정산 · 마일스톤)

**대상:** `src/renderer/features/today|week|review|milestones/` **+ main 측**
`src/main/services/review.ts` · `milestones.ts` · `week-plan.ts` · `ports.ts` ·
`src/main/db/repositories/drizzle.ts` · `src/shared/ipc/contracts.ts`

> **⚠︎ 감사 결과** — 초안은 대상을 renderer 로만 적었지만, 롤업·정산 요약·차액은 전부
> main 에서 개수로 계산된다. 그리고 **처분은 2택이 된다** (ADR-031 §1) — 초안의
> "처분 3택은 건드리지 않는다"는 성립하지 않는다.

- [ ] 오늘 목록: 항목당 `소진/예상 뽀모` → 누적 측정 시간.
- [ ] 주간 카드: 예산 게이지(`BudgetGauge`) 제거, 헤더에 이번 주 측정 시간 합.
  항목마다 측정 시간. `기타` 행은 차액을 그대로 그린다.
- [ ] **요일 핍은 그대로 둔다.** 초안의 "부하 4상태 중 부하 축 제거"는 대상을 잘못
  짚었다 — 핍의 4상태(미배정·지난 요일·오늘·다가올 요일)에 부하 축이 없다. 죽는 것은
  **플래너의 요일별 부하 막대**(Task 4)다.
- [ ] **정산 처분을 2택으로 줄인다** (ADR-031 §1): `carry_reduced` 예외 타입·축소
  스테퍼·`remaining` 파생·`carriedPomos` 를 제거한다. `useDecisions.ts` ·
  `PendingSection.tsx` · `review.ts` · `contracts.ts` 의 review 스키마가 대상이다.
  이월 규모 카피는 **건수**로 바꾼다 (`이월 N건`).
- [ ] 정산 요약: `계획 대비`·차액 → 측정 시간 요약. main 의 `weekFacts`(`budget`·
  `unplannedPomos`)·`lastStudiedPomos` 와 renderer 의 `SummarySection`·
  `CompletedSection`·`ConfirmSection` 이 대상이다. 확정 트랜잭션·워터마크는 그대로
  두되 `weeks` 행 갱신 부분만 무력화한다.
- [ ] 마일스톤 롤업: `이번 주 3/8` → `이번 주 3시간 20분`. `drizzle.ts` 의
  `sum(est_pomos)` 분모 계산 → `measuredSec`, `ports.ts`·`milestones.ts`·`contracts.ts`
  ·`MilestoneRow.tsx` 를 함께 옮긴다. **`null`(롤업 없음)과 `0` 의 구분을 유지한다.**
- [ ] `PomoDots`·`SpentDots` 의 소비자가 전멸하므로 함께 제거한다. `Stepper` 는 유일
  소비자가 정산 축소였으므로 함께 죽는다.
- [ ] 문서: `weekly-review` prd·ux-spec·**technical-spec**(정산 계약·트랜잭션·
  `remaining` 수식이 여기 있다) · `today-tasks` · `milestones` prd(R3 롤업 분모) ·
  `week-plan` ux-spec §3.4(차액). PRODUCT.md 포지셔닝 1·3번 재작성.

**검증:** `pnpm test && pnpm typecheck`. 수동: 세션 하나 돌리고 네 화면에서 같은
시간이 올라오는지, 그리고 **항목 하나를 폐기했을 때 그 시간이 `기타` 행으로 옮겨가는지.**

### Task 4 — 플래너 다이어트

**대상:** `src/renderer/features/week/Planner.tsx` · **`ItemDrawer.tsx`** ·
`src/main/services/week-plan.ts` · `week:*` IPC 계약

> **⚠︎ 감사 결과** — `ItemDrawer` 는 Planner 와 코드를 공유하지 않는 **별도의 est 입력
> 경로**(`newTask.estPomos` → `pullFromDrawer`)를 갖는다. 초안 대상 목록에 없었다.

- [ ] est 스테퍼·주간 예산 입력·프리필·과적 경고·**요일별 부하 막대**를 제거한다.
  항목 추가는 제목(+마일스톤 연결·요일 배치)으로 끝난다.
- [ ] `ItemDrawer` 의 새 조각 est 입력과 `tasks.est_pomos` 쓰기 경로
  (`pullFromDrawer`·`planDraft`)를 제거한다.
- [ ] `week:*` 계약과 서비스에서 `estPomos`·`budget` 입출력을 제거한다
  (`effectiveBudget`·`budgetPrefill` 삭제). 이 시점부터 est 컬럼·`weeks.budget` 은
  아무도 읽고 쓰지 않는다 — **Task 3 의 review 계약 정리와 합쳐 이 조건이 완성된다.**
- [ ] Task 2 에서 유예했던 `estPomos`·`spentPomos` 계약 필드를 여기서 걷는다.
- [ ] 문서: `week-plan/` prd 는 **문제 서술 2번·목표 1~3·성공 지표를 재작성**한다
  (폐기 표기로는 부족하다 — 목표와 지표 자체가 est·예산 위에 서 있다). 폐기 요구는
  R6·R8·R9·R12·R16·R19~R23·R25. ux-spec 은 §5(플래너)·§7(게이지 4상태)·§8(빈 상태)이
  대상이다.

**검증:** `pnpm test && pnpm typecheck && pnpm lint`.

### Task 5 — 스키마 정리 (되돌릴 수 없는 지점)

**대상:** `src/main/db/schema.ts` · `migrate.ts` · `drizzle/` ·
`src/main/db/repositories/` · `test-helpers.ts`

> **⚠︎ 감사 결과 — 이 태스크가 계획 전체에서 가장 위험하다.** 감사에서 실제로
> 마이그레이션을 생성해 데이터가 든 1.1.0 DB 에 적용했고 **`FOREIGN KEY constraint
> failed` 로 실패했다.** 같은 마이그레이션이 빈 DB 에서는 성공한다 — 현행 테스트가
> 전부 빈 DB 라서 **CI 는 초록이고 사용자 기기에서만 앱이 안 켜진다.** 절차는
> ADR-032 가 소유한다.

- [ ] **백업 경로 확인 (통과 예정).** 조건은 `dbVersion > 0 && dbVersion < appVersion`
  이고 스키마 버전은 `drizzle/` 의 `.sql` 개수다. 지금 1개이므로 0001 을 더하면 모든
  1.x DB(`user_version = 1`)에 백업이 붙는다. `migrate.test.ts` 에 이미 "백업에 데이터가
  들어 있다" 케이스가 있다 — 확인만 하고 닫는다.
- [ ] **`migrate.ts` 에 FK 토글과 사후 검사를 넣는다** (ADR-032 §1·§2): `migrate()`
  호출을 트랜잭션 **바깥**의 `foreign_keys = OFF` / `finally` 복원으로 감싸고, 성공
  직후 **`user_version` 을 올리기 전에** `foreign_key_check` 를 돌려 결과가 비어 있지
  않으면 `MigrationError` 를 던진다.
- [ ] **마이그레이션 SQL 을 손질한다** (ADR-032 §3). `drizzle-kit generate` 산출물은
  초안이다: 무효한 `PRAGMA foreign_keys` 두 줄 제거 · `DROP TABLE weeks` 를 자식 테이블
  재생성 **뒤로** 이동 · `DELETE FROM settings WHERE key = 'weekly_capacity';` 를 손으로
  추가(drizzle-kit 은 데이터 조작을 생성하지 않는다). 내용은
  `week_items.est_pomos` drop · `tasks.est_pomos` drop · `weeks` drop ·
  `sessions.local_week` FK 제거 · 관련 CHECK 제거다.
  **`drizzle/` 에 `.sql` 이 정확히 2개인지 확인한다** — 스키마 버전이 파일 개수다.
- [ ] **데이터가 든 1.1.0 DB 로 마이그레이션 테스트를 추가한다** (ADR-032 §4).
  픽스처 조건: 세션이 있을 것(FK 가 실제로 걸려야 재현된다) · **`focus_min = 50` 같은
  비표준 길이의 주가 섞일 것** · 이월 항목과 폐기 항목이 있을 것. 검증: 적용 성공 ·
  `foreign_key_check` 가 비어 있음 · 세션·항목·조각·마일스톤 행 보존 · 과거 주의
  측정 시간이 소급 표시됨.
- [ ] 잔존 코드 제거: `weeks` 리포지토리·`ensure`·세션 INSERT 의 행 생성 경로 ·
  정산 확정의 `settled_at` 갱신 · **`test-helpers.ts` 의 `TEST_SNAPSHOT`·`ensureWeeks`**
  (전 테스트가 이것에 의존한다) · `migrate.test.ts` 의 `creates all 7 tables` → 6.
  **`weeks` 행 생성 제거와 FK 제거는 같은 커밋이어야 한다.**
- [ ] **`earliestRecordedWeek` 의 `weeks` 후보를 제거하고 그 주석의 근거를 갱신한다.**
  폴백이 3갈래에서 2갈래로 준다 — 계획만 있고 세션·항목이 없는 주가 최초 기록인
  경우에만 영향이 있고 안전 방향(정산 범위를 넓히는 쪽)이 좁아진다.
- [ ] **시딩 목록은 그대로 둔다.** 초안의 "`+ last_settled_week`" 지시는 틀렸다 —
  그 키는 **의도적으로 시딩하지 않으며** `bootstrapWatermark` 가 계산해 소유한다.
  넣으면 워터마크 유실 시 복구 폴백(R28)이 영구히 죽는다. `weekly_capacity` 도 애초에
  시딩 목록에 없으므로, 이 태스크가 `settings` 에서 할 일은 **행 DELETE 뿐**이다.

**검증:** `pnpm test`(데이터 든 DB 마이그레이션 테스트 포함) · 수동: 실제 사용 중인
`app.db` 복사본으로 `pnpm dev` 기동 → 과거 주 시간 표시 확인.

### Task 6 — 문서 정합·버전·릴리스 준비

> **⚠︎ 감사 결과** — 갱신 대상 문서가 초안 목록의 두 배다. 아래 6종이 통째로 빠져
> 있었다.

- [ ] 초안이 이미 적은 것: README 기능 절 · `docs/features/README.md` 인덱스 ·
  `docs/architecture/overview.md` 현황 문구(ADR 표에서 ADR-013 행이 죽는다는 점 명시).
  README 의 `가용량 편집 … 진행 중인 주의 분모는 안 바뀐다` 는 단순 문구가 아니라
  **사실 정정**이다.
- [ ] **추가 대상**: `docs/features/timer/` prd(주간 게이지 참조 + **중단 세션의 시간
  손실 명시**, ADR-031 §3) · `docs/features/app-shell/` prd·ux-spec·overview(가용량
  편집·예산 게이지 레이아웃) · `docs/features/calendar-records/prd.md`(비범위 서술의
  과적·예산 대비) · `docs/design-system/principles.md`(`뽀모 예산 초과는 실패가 아니다`
  색 규칙의 근거 개념 소멸) · `docs/design-system/tokens.md`(`--amber` 용도 설명) ·
  `docs/design-system/wireframes/v1-wireframe.html`(게이지·과적 시안).
- [ ] **캘린더의 통화를 결정해 문서에 적는다.** 날짜 패널은 `집중 3회` 로 남아 하루
  단위 시간을 볼 자리가 앱에 없어진다. `뽀모 = 사이클 단위` 정의상 `3회` 는 여전히
  참이므로 **의도된 예외로 두되, 그 사실을 `calendar-records` prd 에 명시한다.**
  (통화를 바꾸려면 Task 3 대상에 캘린더를 넣어야 하므로 여기서 정하고 넘어간다.)
- [ ] PRODUCT.md: 포지셔닝 1·3번 외에 조정 플로우 설명 · 1.x 로드맵의 요일별 부하
  그래프 · 층별 표의 `주간 할당 | 얼마만큼` 행 · `세션이 있는 주는 자기 분모 스냅샷을
  갖는다` 불변식 · 원칙 4 의 과적 언급이 함께 죽는다. 원장 Q6 파생(반응형 셸·트레이를
  2.x 이후로 재배치)도 여기서 반영한다.
- [ ] E2E 는 손댈 필요가 없다 — 카드 `aria-label` 5개만 검사하며 게이지·est 입력을
  참조하지 않는다. 확인만 하고 닫는다.
- [ ] `package.json` 버전 `2.0.0` (근거: ADR-030 Consequences · 결정 원장 Q6).
- [ ] 전체 게이트: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` + E2E.
- [ ] **릴리스 노트에 복귀선을 적는다** (ADR-032 Consequences): 이 마이그레이션은
  되돌릴 수 없고, 백업 파일만 복원하면 새 앱이 같은 마이그레이션을 다시 돌린다.
  실질 복귀는 **백업 파일 + 1.1.0 설치 파일** 조합뿐이므로, 사용자에게 1.1.0 설치
  파일 보관과 백업 위치(`userData`)를 안내한다.
- [ ] 릴리스는 CONTRIBUTING 절차대로 별도 진행 — release 브랜치·태그 생성은
  **사용자 확인 후에만** 한다 (태그 push = 배포 트리거).

---

## 이 계획이 하지 않는 것

- 과적을 대신할 신호 (원장 §미결 1 — 필요해지면 그때). **출시를 막지 않는다** —
  과적 경고는 원래도 확정을 막지 않는 정보였다.
- 첫 실행 온보딩 (원장 §미결 2 — 독립 작업이고 **화면이 아직 구현돼 있지 않다.**
  남는 것은 문서 부채뿐이다: `app-shell` R31·`pomo-baseline` R25 가 가용량을 묻는
  온보딩을 여전히 명세한다 → Task 6 에서 정리)
- 시간 단위 예산의 재도입 (Q1 기각지, 원장 §미결 3)
- 뽀모 횟수 병기 (Q4 기각지)
- 진행 중 세션의 실시간 표시 (ADR-031 §3 에서 기각 — 계약에 `runningSec` 를 얹지 않는다)
- 중단 세션의 시간 보존과 확인 대화 (ADR-031 §3 에서 기각 — 원칙 4 와 부딪힌다)
