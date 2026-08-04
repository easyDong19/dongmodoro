# milestones — 월 레이어 마일스톤

## 기능 목적

"이번 달이 끝나면 뭐가 달라져 있나?"에 답하는 결과물을 2~3개, 숫자가 아닌 **상태로**
적어두는 월 레이어다 (원칙 2). 주간 항목이 이 결과물 중 하나에 선택적으로 매달려,
아래에서 올라온 소진량이 "이 결과물이 얼마나 진행됐는가"로 보이게 한다.

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 월 키·편집·완료 표현·순서·보관·소진 파생·지난달 읽기 전용 규칙

## 관련 횡단 문서

- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 월 키 `'YYYY-MM'` 는 로컬 기준 달력 키 — 쓰는 순간 1회 계산 후 불변
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `completed_at` 기반 완료 표현(§5), 주간 항목의 `milestone_id` nullable 연결(§4)
- [design-system/principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), 상태 → 색 매핑(§3), UI 이모지 금지(§6)
- [2026-08-04 기획 검증 세션](../../decision-log/2026-08-04-planning-session.md): Q15(지난달 카드 표시 범위), ERD 평가 S3(완료 표현)
