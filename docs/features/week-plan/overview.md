# week-plan — 주 레이어: 이번 주 할당

## 기능 목적

"그 결과를 위해 이번 주 **무엇을**?" 에 답하는 레이어다 (원칙 2). 주간 항목마다 제목과
요일 배치 의도를 잡고, 그 항목으로 실제로 얼마나 집중했는지를 세션에서 파생한 **측정
시간**으로 되비춘다. **계획 시점에 매기는 숫자는 없다** — 예상 뽀모·주간 예산·가용량은
[ADR-030](../../architecture/decisions/adr-030-time-as-progress-currency.md) 이 폐지했다. 하루 계획은 주간 항목에서 **pull** 하는 것이 정석 경로이며, 직접 추가·
사후 캡처로 생긴 조각도 시스템 "기타" 항목에 붙으므로 **구조적으로 모든 오늘 조각은
주간 항목에 귀속된다.**

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 주 정의, 편집 대상 주, 항목·요일 배치, 측정 시간의 집계 술어, 기타 행의 차액 정의, 완료·폐기 (예산·과적 절은 폐기 표기로 남아 있다)
- [UX Spec](./ux-spec.md): 주간 카드의 상태·전이·문구 — 일반 뷰 항목 행, 플래너 모드, 항목 드로어, 빈 상태

## 관련 횡단 문서

- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 시작 = 월요일, 주 키 = 그 주 월요일 날짜, `plan_lead_days` 계획일 모델
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `week_items`(`origin_week`·`is_system`·`completed_at`/`dropped_at`), `weeks`, `task_pulls`, 제약을 초기 마이그레이션에 두는 규칙(§6)
- [ADR-012](../../architecture/decisions/adr-012-aggregation-predicate.md): 집계 술어 `sessions.local_week = week_items.week`, pull 주 제한 폐기, 이월 시 재부모화·`milestone_id` 승계 — §4(차액의 옛 정의)는 ADR-030 이 폐기하고 ADR-031 §2 가 통화만 바꿔 되살렸다
- **[ADR-030](../../architecture/decisions/adr-030-time-as-progress-currency.md)**: 통화 교체 — est·예산·가용량 폐지, 측정 시간은 조회 시점 파생. 이 기능의 문제 서술·목표·성공 지표가 이 결정 위에 다시 쓰였다
- [ADR-031](../../architecture/decisions/adr-031-settlement-without-est.md) §2: 기타 행 차액의 통화 교체와 "반올림은 표시 직전 한 번"
- ~~[ADR-013](../../architecture/decisions/adr-013-baseline-budget-effect.md)~~: `weeks.budget` 확정 저장 — §1·§2 는 ADR-030 이, §3·§4 는 ADR-029 가 폐기했다
- [ADR-014](../../architecture/decisions/adr-014-deletion-and-archive.md): 삭제(`deleted_at`)와 폐기(`dropped_at`)의 구분
- ~~[ADR-018](../../architecture/decisions/adr-018-first-run-state.md)~~: `weeks.budget`·`capacity` 의 nullable 논의 — 두 저장소가 사라져 ADR-030 §4 가 폐기했다
- ~~[ADR-019](../../architecture/decisions/adr-019-constraint-implementation.md)~~ 중 est 관련 절: 남은 몫·이월 est·`est_pomos` CHECK — ADR-030·ADR-031 이 폐기했다. `sessions.local_week` FK 규정(§6)은 스키마 정리 전까지 유효하다
- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 주 키·달력 키의 포맷과 "쓰는 순간 1회 계산 후 불변" 규약
- [principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), `--danger` 사용 조건(§2), 이모지 금지(§6)
- [tokens.md](../../design-system/tokens.md): 이 기능의 모든 시각 값의 출처
- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q7·Q10~Q14 와 Q8-1·Q9 의 결정 근거
- [리뷰 결정 2026-08-04](../../decision-log/2026-08-04-review-decisions.md): D1(Q10 폐기)·D3(예산 확정 저장)과 문서 수정으로 닫은 지적 목록
