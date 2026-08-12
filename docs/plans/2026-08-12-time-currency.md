# 시간 통화 전환 구현 계획 (2.0.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

**Goal:** 계획의 통화(예상 뽀모·예산·가용량)를 걷어내고, 진행 표시를 **세션에서
파생하는 측정 시간**으로 바꾼다. 뽀모 길이 편집은 **다음 세션부터 즉시** 효력을 갖는다.
끝나면 2.0.0 이다.

**Architecture:** 새 측정 장치가 없다 — `sessions.duration_sec` 가 이미 모든 세션의
실제 경과 초를 저장한다. 이 계획이 더하는 것은 **합산 조회**(주·항목·자유 집중·마일스톤
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
  (ADR-030 §5).
- **renderer 는 시간을 재계산하지 않는다.** 주·항목 귀속과 합산은 main 이 하고,
  renderer 는 받은 초를 포맷만 한다 (ADR-025 §1-2 의 연속).
- **개수 표시를 되살리지 않는다.** "정보가 아쉬우니 뽀모 횟수도 병기" 류 확장은
  이 계획의 범위 밖이다 — Q4 에서 기각된 선택지다 (결정 원장 참조).
- **마이그레이션 전 백업이 반드시 돈다.** 이 마이그레이션은 1.x 로 되돌릴 수 없다
  (ADR-030 Consequences). 기존 조건부 백업 경로(ADR-020)가 스키마 버전 상승을
  감지하는지 Task 5 에서 확인부터 한다.
- **작업 브랜치는 `feature/time-currency` 하나**이며 태스크마다 커밋한다.

## 이 계획서가 인용하는 결정 (소유자는 기존 문서다)

계획은 결정을 만들지 않는다 (docs/CLAUDE.md). 문서와 이 계획서가 어긋나면 문서가 이긴다.

| 항목 | 소유 문서 | 요지 |
|---|---|---|
| 길이 편집 즉시 효력, 스냅샷 폐지 | [ADR-029](../architecture/decisions/adr-029-baseline-immediate-effect.md) | 저장 즉시, 적용은 다음 세션 시작부터. `유효 베이스라인(week)` 계약 폐기 |
| 통화 교체·삭제 목록·화면별 표시 | [ADR-030](../architecture/decisions/adr-030-time-as-progress-currency.md) | est·budget·capacity·`weeks` 삭제, 측정 시간은 조회 시점 파생 |
| 귀속 술어 | [ADR-012](../architecture/decisions/adr-012-aggregation-predicate.md) §1~§3 | 세션의 주 = 저장된 `local_week`, 이월 재부모화 규칙 |
| 결정 과정·기각지 | [결정 원장 2026-08-12](../decision-log/2026-08-12-time-currency-session.md) | Q1~Q6, 미결 3건 |
| 용어 | [CONTEXT.md](../../CONTEXT.md) | `측정 시간` 신규, `뽀모` 재정의(사이클 단위), `예상 뽀모` 폐기 |

## 태스크 순서와 그 이유

앱은 **모든 태스크 경계에서 켜지고 동작해야 한다** (CI 그린). 그래서 스키마 제거가
마지막이다 — Task 1~4 동안 est 컬럼·weeks 테이블은 존재하되 아무도 읽지 않는 상태로
내려가고, Task 5 가 빈 껍데기를 걷는다.

---

### Task 1 — 길이 편집 즉시 효력 (ADR-029 실행분)

**대상:** `src/main/services/baseline.ts` · `timer-host.ts` · `src/shared/ipc/contracts.ts`
· `src/renderer/features/baseline/`

- [ ] `effectiveBaseline(repos, week)` 의 스냅샷 폴백을 제거하고 `globalBaseline(repos)`
  직독으로 대체한다. 소비자(타이머 호스트·정산 패널 표시)를 전부 옮긴다.
- [ ] `getBaseline`/`setBaseline` 계약에서 `capacity`·`basisPomos`·`basisSource` 를
  제거한다 — 남는 것은 길이 3종뿐이다. `writeBaseline` 에서 `weekly_capacity` 쓰기
  경로를 제거한다.
- [ ] `BaselineForm` 에서 요일별 가용량 7칸과 총 집중 시간 비교(R26)를 제거한다.
  안내 문구를 `다음 세션부터 적용돼요` 로 교체한다 (기존 `바꾼 길이는 다음 주부터
  적용돼요 · 이번 주 기록은 그대로예요` 는 거짓이 된다).
- [ ] `weekSnapshot`·`baselineBasis` 와 그 테스트를 제거한다. `weeks` 행 생성 경로
  중 **길이 박제 부분만** 무력화한다 (행 생성 자체는 Task 5 까지 남는다 — 세션
  INSERT 가 아직 FK 로 기대하는지 확인하고, 기대하지 않으면 여기서 함께 끊는다).
- [ ] 테스트: 길이 변경 → 진행 중 세션은 기존 길이 유지, **다음 세션부터** 새 길이
  (timer-engine 테스트의 "주 경계에서 바뀐다" 시나리오를 "다음 세션에서 바뀐다"로
  교체).
- [ ] 문서: `docs/features/pomo-baseline/` 의 prd·overview 를 ADR-029·030 기준으로
  재작성한다 (R5·R6 길이 하한·기본값·시딩은 생존, R7~R26 의 가용량·예산·스냅샷·비교
  요구는 폐기 표기).

**검증:** `pnpm test && pnpm typecheck && pnpm lint`. 수동: 조정에서 길이 변경 →
타이머 새 세션이 새 길이로 시작.

### Task 2 — 측정 시간 파생 조회

**대상:** `src/main/db/repositories/` · `src/main/services/` · `src/shared/ipc/contracts.ts`

- [ ] 리포지토리에 합산 조회를 더한다: 주 총 focus 초 · 항목별(week_item) focus 초 ·
  오늘 항목별(task) focus 초 · 자유 focus(항목 미귀속) 초 · 마일스톤 귀속 주 focus 초.
  전부 완료 focus 세션만, 주 판정은 저장된 `local_week`.
- [ ] IPC 계약의 행 스키마에 초 단위 필드를 더한다 (`measuredSec`). 기존
  `spentPomos`·`estPomos` 필드는 이 태스크에서 지우지 않는다 — UI 교체(Task 3·4)가
  끝난 뒤 계약에서 걷는다.
- [ ] renderer 포맷터 하나: 초 → `N시간 M분` (1시간 미만은 `M분`, 0 은 `—`).
  포맷 규칙의 소유자는 각 기능 ux-spec 이며, 유틸은 `src/renderer/shared/` 에 둔다.
- [ ] 테스트: 휴식 세션 미산입 · 미완료 세션 미산입 · 이월 재부모화 후 귀속 이동 ·
  자유 focus 분리.

**검증:** `pnpm test`. 이 태스크는 UI 를 바꾸지 않는다.

### Task 3 — UI 통화 교체 (오늘 · 주간 · 정산 · 마일스톤)

**대상:** `src/renderer/features/today|week|review|milestones/`

- [ ] 오늘 목록: 항목당 `소진/예상 뽀모` → 누적 측정 시간.
- [ ] 주간 카드: 예산 게이지(`BudgetGauge`) 제거, 헤더에 이번 주 측정 시간 합.
  항목마다 측정 시간. 요일 핍은 배치 표시만 남긴다 (부하 4상태 중 부하 축 제거).
- [ ] 정산 요약: `계획 대비`·차액 → 측정 시간 요약 (총 집중 · 항목별 · 자유 집중).
  `기타` 행은 차액 계산이 아니라 자유 focus 합산을 그대로 그린다. 처분 3택·확정
  트랜잭션·워터마크는 건드리지 않는다 (확정에서 `weeks` 행 갱신 부분만 무력화).
- [ ] 마일스톤 롤업: `이번 주 3/8` → `이번 주 3시간 20분` (rollup 페이로드를
  `spentPomos/plannedPomos` → `measuredSec` 로).
- [ ] 문서: `docs/features/weekly-review|today-tasks|milestones/` 의 해당 요구를
  갱신한다. PRODUCT.md 포지셔닝 1·3번을 ADR-030 기준으로 재작성한다.

**검증:** `pnpm test && pnpm typecheck`. 수동: 세션 하나 돌리고 네 화면에서 같은
시간이 올라오는지.

### Task 4 — 플래너 다이어트

**대상:** `src/renderer/features/week/Planner.tsx` 외 · `week:*` IPC 계약

- [ ] est 스테퍼·주간 예산 입력·프리필·과적 경고를 제거한다. 항목 추가는
  제목(+마일스톤 연결·요일 배치)으로 끝난다.
- [ ] `week:*` 계약과 서비스에서 `estPomos`·`budget` 입출력을 제거한다
  (`effectiveBudget`·`budgetPrefill` 삭제). 이 시점부터 est 컬럼·`weeks.budget` 은
  아무도 읽고 쓰지 않는다.
- [ ] Task 2 에서 유예했던 `estPomos`·`spentPomos` 계약 필드를 여기서 걷는다.
- [ ] 문서: `docs/features/week-plan/` prd 재작성 (R6 est 필수 · R16 기타 est=0 ·
  R19~R21 예산·과적 폐기 표기).

**검증:** `pnpm test && pnpm typecheck && pnpm lint`.

### Task 5 — 스키마 정리 (되돌릴 수 없는 지점)

**대상:** `src/main/db/schema.ts` · `drizzle/` · `src/main/db/repositories/`

- [ ] **백업 경로부터 확인한다.** 마이그레이션 직전 조건부 백업(ADR-020)이 이 스키마
  버전 상승에서 실제로 스냅샷을 남기는지 테스트로 못 박는다. 안 남기면 이 태스크를
  멈추고 백업을 먼저 고친다.
- [ ] drizzle 마이그레이션 생성: `week_items.est_pomos` drop · `tasks.est_pomos` drop ·
  `weeks` drop table · `settings` 에서 `weekly_capacity` 행 DELETE.
- [ ] `weeks` 리포지토리·`ensure`·세션 INSERT 의 행 생성 경로·정산 확정의 `settled_at`
  갱신 등 잔존 코드를 제거한다. 시딩 목록은 길이 3종 + `theme` + `plan_lead_days` +
  `last_settled_week` 로 준다.
- [ ] 기존 데이터로 마이그레이션 테스트: 1.1.0 스키마의 DB 를 열어 세션·항목·마일스톤이
  전부 살아 있고 시간 표시가 소급되는지.

**검증:** `pnpm test`(마이그레이션 테스트 포함) · 수동: 기존 `app.db` 복사본으로
`pnpm dev` 기동 → 과거 주 시간 표시 확인.

### Task 6 — 문서 정합·버전·릴리스 준비

- [ ] README 기능 절·`docs/features/README.md` 인덱스·architecture overview 의 현황
  문구를 갱신한다.
- [ ] E2E 스모크가 제거된 UI(게이지·est 입력)를 참조하지 않는지 확인·갱신.
- [ ] `package.json` 버전 `2.0.0` (근거: ADR-030 Consequences · 결정 원장 Q6).
- [ ] 전체 게이트: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` + E2E.
- [ ] 릴리스는 CONTRIBUTING 절차대로 별도 진행 — release 브랜치·태그 생성은
  **사용자 확인 후에만** 한다 (태그 push = 배포 트리거).

---

## 이 계획이 하지 않는 것

- 과적을 대신할 신호 (원장 §미결 1 — 필요해지면 그때)
- 첫 실행 온보딩 (독립 작업, 물을 값이 길이 3종으로 줄었다는 사실만 기록)
- 시간 단위 예산의 재도입 (Q1 기각지)
- 뽀모 횟수 병기 (Q4 기각지)
