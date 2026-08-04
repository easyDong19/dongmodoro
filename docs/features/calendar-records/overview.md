# calendar-records — 캘린더와 날짜 기록

## 기능 목적

월 그리드에 "공부한 날"을 점으로 찍고, 날짜를 고르면 그날의 기록(집중 횟수·그날
오늘 목록에 있던 조각들)을 되돌려 보여준다. 계획이 하나도 없어도 세션 기록만으로
완전히 동작하는 열람 기능이며(원칙 1), 사실만 표시하고 판단하지 않는다(원칙 6·7).

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 날짜 귀속 기준, 점 규칙, 날짜 패널의 과거 복원, 스트릭 표시

## 관련 횡단 문서

- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 시간 포맷 4종 분류 — 달력 키는 쓰는 순간 1회 계산 후 불변, 시간 모듈 초크포인트
- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 정의 — 주 시작은 월요일 (캘린더 그리드 요일 순서의 근거)
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `sessions.local_date`·`local_week` 불변 저장(§3), `task_pulls` 행 승격(§2), `completed_at`(§5)
- [design-system/principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), 상태→색 매핑(§3), UI 이모지 금지(§6)
- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q1(하루 경계)·Q2(자정 걸친 세션 귀속)·Q8-1(주 시작 요일)
