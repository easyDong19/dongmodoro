# week-plan — 주 레이어: 이번 주 할당

## 기능 목적

"그 결과를 위해 이번 주 얼마만큼?" 에 숫자로 답하는 레이어다 (원칙 2). 주간 항목마다
예상 뽀모(est)와 요일 배치 의도를 잡고, 그 항목이 실제로 얼마나 소진됐는지를 세션
집계로 되비춘다. 하루 계획은 여기서 **pull** 만 하므로, 이 카드는 오늘 목록의 유일한
공급원이기도 하다.

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 주 정의, 항목 est·요일 배치, 예산·과적, 완료·폐기, 기타 항목
- [UX Spec](./ux-spec.md): 주간 카드의 상태·전이·문구 — 일반 뷰 항목 행, 플래너 모드, 항목 드로어, 빈 상태

## 관련 횡단 문서

- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 시작 = 월요일, 주 키 = 그 주 월요일 날짜, `plan_lead_days` 계획일 모델
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `week_items`(`origin_week`·`is_system`·`completed_at`/`dropped_at`), `weeks`(주별 예산 오버라이드), `task_pulls`, pull 범위 제한
- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 주 키·달력 키의 포맷과 "쓰는 순간 1회 계산 후 불변" 규약
- [principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), `--danger` 사용 조건(§2), 이모지 금지(§6)
- [tokens.md](../../design-system/tokens.md): 이 기능의 모든 시각 값의 출처
- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q7·Q10~Q14 와 Q8-1·Q9 의 결정 근거
