# pomo-baseline — 뽀모 베이스라인과 주간 예산

## 기능 목적

"뽀모 1개가 몇 분인가"(베이스라인)와 "이번 주에 쓸 수 있는 뽀모가 몇 개인가"(가용량·예산)를
정의하고, 그 값이 나중에 바뀌어도 **과거 주의 기록 해석이 흔들리지 않게** 보존한다.
집계의 분자(소진)는 세션이 만들고, 이 기능은 분모(단위와 예산)만 소유한다.

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 뽀모의 정의, 가용량·예산 산출, 베이스라인 변경 시점, 주별 스냅샷 규칙

## 관련 횡단 문서

- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 길이 값의 단위 규약 (설정 길이는 분 `_min`, 측정 경과는 초 `duration_sec`)
- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 시작 = 월요일, `weekly_capacity` 인덱스 0 = 월요일, 주 키 = 그 주 월요일 날짜
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md) §1: `weeks` 테이블 — 주별 예산 오버라이드와 베이스라인 스냅샷
- [design-system/principles.md](../../design-system/principles.md) §1: 예산 초과는 실패가 아니다 (경고·빨간색 금지)
- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q4·Q8-1·Q9·ERD 평가 B4
