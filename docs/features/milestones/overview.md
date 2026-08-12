# milestones — 월 레이어 마일스톤

## 기능 목적

"이번 달이 끝나면 뭐가 달라져 있나?"에 답하는 결과물을 2~3개, 숫자가 아닌 **상태로**
적어두는 월 레이어다 (원칙 2). 주간 항목이 이 결과물 중 하나에 선택적으로 매달려,
아래에서 올라온 소진량이 **"이 결과물에 이번 주 얼마를 썼는가"**(범위가 명시된 주 단위
롤업)로 보이게 한다. 월 누적 진행은 v1 에 존재하지 않는다.

## 현재 상태

- In Review — 구현 완료 ([월 레이어 계획](../../plans/2026-08-12-month-layer.md)).
  목록·인라인 편집·완료 토글·보관/해제·삭제 확인·표시 모드 6분기·달성 배지·주 단위 롤업·
  직전 달 제목 복사까지 섰다. **수동 순서 변경과 월 누적 소진은 여전히 비범위**이며,
  월말 정산의 마일스톤 재설정 흐름도 v1 밖 그대로다.

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 월 키·편집 가능 범위(이번 달 + 다음 달)·
  완료 표현·물리 삭제·보관의 집계 중립성·범위 라벨이 붙은 소진 롤업·표시 모드 판정 순서

## 관련 횡단 문서

- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 월 키 `'YYYY-MM'` 는 로컬 기준 달력 키 — 쓰는 순간 1회 계산 후 불변
- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 시작·주 키·계획일(`plan_lead_days`) 모델 — 다음 달 선행 편집의 근거
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `completed_at` 기반 완료 표현(§5), 주간 항목의 `milestone_id` nullable 연결(§4)
- [ADR-012](../../architecture/decisions/adr-012-aggregation-predicate.md): 집계 술어(세션의 주 = 항목의 주)와 이월 시 `milestone_id` 승계(§3)
- [ADR-014](../../architecture/decisions/adr-014-deletion-and-archive.md): 마일스톤은 물리 삭제 + `ON DELETE SET NULL`(§3), 보관은 달성 배지 분모에 중립(§4)
- [design-system/principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), 상태 → 색 매핑(§3), UI 이모지 금지(§6)
- [2026-08-04 기획 검증 세션](../../decision-log/2026-08-04-planning-session.md): Q15(지난달 카드 표시 범위), ERD 평가 S3(완료 표현)
- [2026-08-04 리뷰 후속 결정](../../decision-log/2026-08-04-review-decisions.md): D4(보관의 집계 중립성), D1(집계 술어 단일화)
