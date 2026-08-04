# today-tasks — 오늘 할 일

## 기능 목적

"지금 뭐 하나?"에 답하는 일 레이어다. 오늘 새로 계획하지 않고, 이번 주 주간 항목에서
할 조각(task)을 **끌어와(pull)** 3개 이하로 세워 두고, 완료를 체크하고, 자정이 되면
남은 조각을 주간 풀로 돌려보낸다(원칙 2). 오늘 목록은 별도 엔티티가 아니라 task 의
뷰이며, 목록에서 빼는 것은 삭제가 아니다.

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — pull 범위 제약, 완료 표현, 하루 경계, 빈 상태·힌트 문구

## 관련 횡단 문서

- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): `pull_date` 는 로컬 기준 달력 키, 쓰는 순간 1회 계산 후 불변
- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): "오늘이 속한 주"의 정의 (월요일 시작, 주 키 = 그 주 월요일 날짜)
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `task_pulls` 행 승격(§2), 시스템 "기타" 항목(§4), `completed_at`(§5)
- [design-system/principles.md](../../design-system/principles.md): 실패 프레임 금지, 아이콘·이모지 규칙
- [결정 원장](../../decision-log/2026-08-04-planning-session.md): Q7·Q10·Q18 등 이 기능이 따르는 확정 결정
