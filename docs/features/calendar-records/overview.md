# calendar-records — 캘린더와 날짜 기록

## 기능 목적

월 그리드에 "기록이 있는 날"을 점으로 찍고, 날짜를 고르면 그날의 기록(집중 횟수·그날
오늘 목록에 있던 조각과 그날 세션이 붙은 조각)을 되돌려 보여준다. 계획이 하나도 없어도
세션 기록만으로 완전히 동작하는 열람 기능이며(원칙 1), 사실만 표시하고 판단하지
않는다(원칙 6·7). "기록 있음" 판정을 한 곳에 정의해 점·목록·빈 상태가 같은 날짜에 대해
어긋나지 않게 하는 것도 이 기능의 책임이다.

## 현재 상태

- In Review — 구현 완료 ([월 레이어 계획](../../plans/2026-08-12-month-layer.md)).
  월 그리드·셀 3채널·공부 점 2단계·날짜 기록 패널·`자유 집중 시작` CTA·공부한 날 수까지
  섰고, `기록 있음` 술어는 `services/calendar.ts` 한 곳에만 있다. **시점별 완료 여부
  복원은 여전히 비범위**다 — 불변 완료 달력 키가 선행되어야 하고 그것은 새 ADR 사안이다.
- **2.0.0 (2026-08-13):** 앱 전체의 진행 통화가 측정 시간으로 바뀌었지만 **이 기능은
  횟수 표기를 유지한다** — `뽀모 = 사이클 단위` 정의상 `집중 3회` 는 여전히 참이기
  때문이다. 이 예외와 그 대가(하루 단위 시간을 볼 자리가 없어진다)는
  [PRD](./prd.md) 의 "캘린더의 통화" 절이 소유한다.

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 날짜 귀속 기준, "기록 있음" 술어 정의, 점·셀 상태 규칙, 날짜 패널의 과거 복원 범위, 공부한 날 수 표시, 경계 소유권

## 관련 횡단 문서

- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 시간 포맷 4종 분류 — 달력 키는 쓰는 순간 1회 계산 후 불변, 시간 모듈 초크포인트
- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 정의 — 주 시작은 월요일 (캘린더 그리드 요일 순서의 근거)
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `sessions.local_date`·`local_week` 불변 저장(§3), `task_pulls` 행 승격(§2), `completed_at`(§5)
- [ADR-012](../../architecture/decisions/adr-012-aggregation-predicate.md): 집계 술어 단일화 — pull 주 제한 폐기(§2), 사후 캡처의 귀속 기준(§3)
- [ADR-014](../../architecture/decisions/adr-014-deletion-and-archive.md): `tasks`·`week_items` soft delete 와 `deleted_at IS NULL` 기본 조건(§1), `sessions` 는 삭제하지 않음(§2)
- [design-system/tokens.md](../../design-system/tokens.md): 셀 상태 채널에 쓰는 색·radius 토큰의 유일한 출처
- [design-system/principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), 상태→색 매핑(§3), UI 이모지 금지(§6)
- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q1(하루 경계)·Q2(자정 걸친 세션 귀속)·Q8-1(주 시작 요일)
- [리뷰 결정 2026-08-04](../../decision-log/2026-08-04-review-decisions.md): "기록 있음" 술어 단일화(케이스 6)·× 삭제 시 이력 보존(케이스 5)·"공부한 날 수" 소유 경계
