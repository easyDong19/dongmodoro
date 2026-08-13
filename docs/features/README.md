# 기능 기획 문서 인덱스

> 이 표가 기능별 기획 문서의 진입점 목록이다. 각 기능의 세부는 `overview.md` 에서 시작한다.
> 문서 작성·분리 규칙은 [docs/CLAUDE.md](../CLAUDE.md), 횡단 결정은
> [architecture/](../architecture/) 와 [design-system/](../design-system/) 이 소유한다.

## 기능 목록

| 기능 | 상태 | 진입점 | 보유 문서 | 한 줄 설명 |
|---|---|---|---|---|
| timer | Draft | [overview](./timer/overview.md) | prd, ux-spec | 집중·휴식 사이클과 세션 기록. 이 앱의 코어 루프 |
| today-tasks | Draft | [overview](./today-tasks/overview.md) | prd | 오늘 목록 — 주간 조각을 가져와 지금 할 일을 고른다 |
| week-plan | Draft | [overview](./week-plan/overview.md) | prd, ux-spec | 주간 할당 — 이번 주에 뭘 할지를 제목으로 잡고 요일에 배치한다 |
| milestones | In Review | [overview](./milestones/overview.md) | prd | 월간 결과물. 수치 없이 상태로 기술 |
| calendar-records | In Review | [overview](./calendar-records/overview.md) | prd | 월 캘린더 점과 날짜별 기록 열람 |
| weekly-review | Draft | [overview](./weekly-review/overview.md) | prd, ux-spec, technical-spec | 주간 정산 — 판정·병합·처분 2택 |
| pomo-baseline | Draft | [overview](./pomo-baseline/overview.md) | prd | 뽀모 길이 3종의 소유자 |
| app-shell | Draft | [overview](./app-shell/overview.md) | prd, ux-spec | 창·레이아웃·반응형·트레이·수명주기 |

`renderer/features/` 코드 슬라이스는 이 폴더 구조와 1:1 로 대응한다
([architecture/overview.md](../architecture/overview.md) 디렉토리 구조 참조).

## 기능 간 소유권 경계

병렬 작성 후 정합성 감사에서 확인된 소유권이다. 같은 규칙을 두 문서가 각자 정의하지 않는다.

| 규칙·값 | 소유 | 참조하는 쪽 |
|---|---|---|
| 세션 기록·완료 판정·알림 | timer | 전부 |
| 사후 캡처 바의 문구·닫힘 조건 | timer | app-shell(배치) |
| 종료 확인 다이얼로그의 문구·조건 | timer | app-shell(경로 열거) |
| 종료 요청 경로·창 수명주기·복귀 경로 | app-shell | timer |
| 구간별 레이아웃·정산 패널 배치·콜드 스타트 조합 | app-shell | week-plan, weekly-review |
| 각 카드의 빈 상태 카피 | 해당 기능 | app-shell(존재만 검증) |
| 오늘 목록의 pull 이력·자정 힌트 | today-tasks | calendar-records |
| 주간 항목·플래너·요일 배치 | week-plan | weekly-review |
| 측정 시간의 합산 대상·귀속 술어 | timer | week-plan, today-tasks, milestones, weekly-review |
| 측정 시간의 표기 규칙(1분 미만·0·반올림·빈 상태) | week-plan [ux-spec §0](./week-plan/ux-spec.md) | today-tasks, milestones, weekly-review, timer |
| 정산 판정식·확정 트랜잭션 | weekly-review | week-plan, pomo-baseline |
| 뽀모 길이 3종 조회 계약 | pomo-baseline | timer, weekly-review |
| 표시 대상 월·"공부한 날 수" 데이터 | calendar-records | milestones(월 동기), timer(자리) |
| 마일스톤 연결·보관·달성률 배지 | milestones | week-plan, weekly-review |

## 횡단 결정 (기능 문서가 따르는 상위 규칙)

| 주제 | 문서 |
|---|---|
| 시간 포맷 4종 분류·시간 모듈 초크포인트 | [ADR-009](../architecture/decisions/adr-009-time-format-convention.md) |
| 주 정의(월요일 시작·주 키)·계획일 모델 | [ADR-010](../architecture/decisions/adr-010-week-definition.md) |
| 스키마 확정 (부분 정정 3건 + `weeks`·`est_pomos` 부분 폐기) | [ADR-011](../architecture/decisions/adr-011-schema-final.md) |
| 집계 술어·pull 주 제한 폐기 | [ADR-012](../architecture/decisions/adr-012-aggregation-predicate.md) (§4 수식은 ADR-027 로 부분 정정) |
| 기타 행 차액의 정의역·표시 조건 | [ADR-027](../architecture/decisions/adr-027-other-row-domain.md) (통화만 교체돼 유효 — [ADR-031](../architecture/decisions/adr-031-settlement-without-est.md) §2) |
| **진행 통화 = 측정 시간.** est·예산·가용량·`weeks` 폐기 | [ADR-030](../architecture/decisions/adr-030-time-as-progress-currency.md) |
| **처분 2택 · 차액 유지 · `측정 시간` 정의** | [ADR-031](../architecture/decisions/adr-031-settlement-without-est.md) |
| 뽀모 길이 편집의 즉시 효력 (스냅샷 폐지) | [ADR-029](../architecture/decisions/adr-029-baseline-immediate-effect.md) — [ADR-013](../architecture/decisions/adr-013-baseline-budget-effect.md) 은 **전체 폐기됐다** |
| 삭제·보관 표현 | [ADR-014](../architecture/decisions/adr-014-deletion-and-archive.md) |
| 반응형 브레이크포인트 토큰 | [design-system ADR-001](../design-system/decisions/adr-001-breakpoint-tokens.md) |
| 시각 철칙(실패 프레임 금지·이모지 금지) | [principles.md](../design-system/principles.md) |
| 결정 이력 (기각된 선택지·AI 오판 포함) | [decision-log/](../decision-log/) |

## Phase 3 Harness 체크리스트 결과

[docs/CLAUDE.md](../CLAUDE.md) 의 체크리스트를 8개 폴더 전체에 기계 검증한 결과다 (2026-08-04).

| 항목 | 결과 |
|---|---|
| 모든 폴더에 overview.md·prd.md·meta.yaml 존재 | 8/8 통과 |
| prd.md 필수 섹션 7종(문제·대상 사용자·목표·범위·요구사항·성공 지표·인수 기준) | 8/8 통과 |
| technical-spec.md 가 있으면 API·DB·시스템 영향 섹션 | weekly-review 1/1 통과 |
| ADR·rollout 보유 폴더 | 0개 — 분리 신호 없는 선택 문서를 만들지 않았다(규칙 준수) |
| 내부 링크가 실제 파일을 가리킴 | 깨진 링크 0 |
| meta.yaml id 중복 없음, docs 목록이 실제 파일과 일치 | 8/8 통과 |
| overview.md 에 세부 스펙 중복 없음 | 8/8 통과 (목적·상태·링크만) |
| 렌더 UI 이모지 | 0건 — 검출된 3건은 "이모지 금지"를 설명하는 문맥(principles.md §6 과 같은 용법) |

미결(TBD)은 각 문서에 `> ⚠️ 가정:` 또는 TBD 로 표기돼 있고, 세션 단위 미결 목록은
[2026-08-04-review-decisions.md](../decision-log/2026-08-04-review-decisions.md) 의 "미결" 절에 모여 있다.

> **2026-08-13 (2.0.0) 갱신.** 진행 통화가 뽀모 개수에서 측정 시간으로 바뀌면서
> 예상 뽀모·예산·가용량·과적이 전 기능 문서에서 폐기됐다. 폐기된 요구사항은 삭제하지
> 않고 각 prd·ux-spec 안에 폐기 표기로 남아 있으므로, 문서에서 그 단어를 만나면
> 그 자리의 표기를 먼저 읽는다. 용어 대조표는 [CONTEXT.md](../../CONTEXT.md) 의
> "폐기된 용어" 절이다.
