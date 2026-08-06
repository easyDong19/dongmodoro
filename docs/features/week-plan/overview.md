# week-plan — 주 레이어: 이번 주 할당

## 기능 목적

"그 결과를 위해 이번 주 얼마만큼?" 에 숫자로 답하는 레이어다 (원칙 2). 주간 항목마다
예상 뽀모(est)와 요일 배치 의도를 잡고, 그 항목이 실제로 얼마나 소진됐는지를 세션
집계로 되비춘다. 하루 계획은 주간 항목에서 **pull** 하는 것이 정석 경로이며, 직접 추가·
사후 캡처로 생긴 조각도 시스템 "기타" 항목에 붙으므로 **구조적으로 모든 오늘 조각은
주간 항목에 귀속된다.**

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 주 정의, 편집 대상 주, 항목 est·요일 배치, 집계 술어, 예산·과적, 완료·폐기, 기타 항목
- [UX Spec](./ux-spec.md): 주간 카드의 상태·전이·문구 — 일반 뷰 항목 행, 플래너 모드, 항목 드로어, 빈 상태

## 관련 횡단 문서

- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 시작 = 월요일, 주 키 = 그 주 월요일 날짜, `plan_lead_days` 계획일 모델
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `week_items`(`origin_week`·`is_system`·`completed_at`/`dropped_at`), `weeks`, `task_pulls`, 제약을 초기 마이그레이션에 두는 규칙(§6)
- [ADR-012](../../architecture/decisions/adr-012-aggregation-predicate.md): 집계 술어 `sessions.local_week = week_items.week`, pull 주 제한 폐기, 기타 행 소진의 차액 정의, 이월 시 재부모화·`milestone_id` 승계
- [ADR-013](../../architecture/decisions/adr-013-baseline-budget-effect.md): `weeks.budget` 확정 저장, `weeks` 행 생성 시점, 베이스라인 효력 시점 — §1 의 NOT NULL 은 ADR-018 이 정정
- [ADR-014](../../architecture/decisions/adr-014-deletion-and-archive.md): 삭제(`deleted_at`)와 폐기(`dropped_at`)의 구분
- [ADR-018](../../architecture/decisions/adr-018-first-run-state.md): `weeks.budget`·`capacity` 는 nullable — "아직 정하지 않았다"와 "0 으로 하겠다"의 구분
- [ADR-019](../../architecture/decisions/adr-019-constraint-implementation.md): 남은 몫 = `max(0, est − 소진)`, 이월 est = `max(1, 남은 몫)`, `est_pomos` 값 범위 CHECK
- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 주 키·달력 키의 포맷과 "쓰는 순간 1회 계산 후 불변" 규약
- [principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), `--danger` 사용 조건(§2), 이모지 금지(§6)
- [tokens.md](../../design-system/tokens.md): 이 기능의 모든 시각 값의 출처
- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q7·Q10~Q14 와 Q8-1·Q9 의 결정 근거
- [리뷰 결정 2026-08-04](../../decision-log/2026-08-04-review-decisions.md): D1(Q10 폐기)·D3(예산 확정 저장)과 문서 수정으로 닫은 지적 목록
