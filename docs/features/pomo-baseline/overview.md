# pomo-baseline — 뽀모 베이스라인과 주간 예산

## 기능 목적

"뽀모 1개가 몇 분인가"(베이스라인)와 "이번 주에 쓸 수 있는 뽀모가 몇 개인가"(가용량·예산)를
정의하고, 그 값이 나중에 바뀌어도 **과거 주의 기록 해석이 흔들리지 않게** 보존한다.
집계의 분자(소진)는 세션이 만들고, 이 기능은 분모(단위와 예산)만 소유한다 —
분모를 읽는 조회 계약 `유효 베이스라인(week)` · `유효 예산(week)` 두 개가 이 기능에 속하며,
다른 기능은 계약 이름만 참조한다.

## 현재 상태

- In Review — 조회 계약 2개·스냅샷 박제·편집 폼이 구현됐다. 편집 경로 2개 중
  **정산 진입점만 열려 있고**, 첫 실행 온보딩(R25 의 (a))은 app-shell 이 그 화면을
  만들어야 살아난다. 요일별 부하 경고(R9)는 배열이 채워지기 시작했을 뿐 표시는
  week-plan 소관으로 남아 있다.

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 뽀모의 정의, 조회 계약 2개, 가용량의 미설정 표현, 스냅샷 박제 시점, 편집 시점과 효력 시점의 분리

## 관련 횡단 문서

- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 길이 값의 단위 규약 (설정 길이는 분 `_min`, 측정 경과는 초 `duration_sec`)
- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 시작 = 월요일, `weekly_capacity` 인덱스 0 = 월요일, 주 키 = 그 주 월요일 날짜
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md) §1: `weeks` 테이블 — 스키마 정의(컬럼·자료형·제약)의 소유자
- [ADR-013](../../architecture/decisions/adr-013-baseline-budget-effect.md): 예산 확정 저장, 행 생성 시점 확장(첫 세션), 편집 시점과 효력 시점의 분리 — ADR-011 §1 의 `budget NULL` **조회 시점 파생**을 폐기. §1 의 NOT NULL 은 ADR-018 이 정정
- [ADR-018](../../architecture/decisions/adr-018-first-run-state.md): `budget`·`capacity` nullable, `유효 예산` 판별 조건 확장, `settings` 시딩 목록 — 이 기능의 계약 정의에 직접 반영된다
- [ADR-019](../../architecture/decisions/adr-019-constraint-implementation.md) §3·§6: 길이 3종 `>= 1` CHECK, `settings.value` JSON 유효성, `settings.updated_at`
- [design-system/principles.md](../../design-system/principles.md) §1: 예산 초과는 실패가 아니다 (경고·빨간색 금지)
- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q4·Q8-1·Q9·ERD 평가 B4
- [리뷰 결정 2026-08-04](../../decision-log/2026-08-04-review-decisions.md): D2(베이스라인 효력 시점)·D3(예산 확정 저장)
