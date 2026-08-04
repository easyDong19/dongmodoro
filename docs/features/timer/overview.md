# timer — 뽀모 타이머

## 기능 목적

집중/휴식 사이클을 돌리고, 완료된 집중 1회를 세션 기록으로 남긴다. 이 앱의 코어
루프다 — 월/주/일 계획이 하나도 없어도 타이머와 기록은 완전히 동작해야 하며(원칙 1),
계획 기능(오늘 목록·주간 할당)은 이 기록 위에 얹히는 레이어다.

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 모드·완료 판정·세션 기록·사후 캡처 규칙
- [UX Spec](./ux-spec.md): 타이머 카드의 상태·전이·문구 — 모드 전환, 캡처 바, 종료 확인

## 관련 횡단 문서

- [ADR-005](../../architecture/decisions/adr-005-timer-architecture.md): 타이머는 main 프로세스가 소유하고 renderer 는 표시만 한다
- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 세션 기록의 시간 포맷 (순간 UTC / 달력 키 불변 / 길이 초)
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): sessions 스키마, 사후 캡처의 소급 task 가 붙는 "기타" 항목
- [ADR-012](../../architecture/decisions/adr-012-aggregation-predicate.md): 집계 술어 — 세션의 주가 귀속을 결정하고, 사후 캡처의 "기타"는 세션의 주 기준
- [ADR-013](../../architecture/decisions/adr-013-baseline-budget-effect.md): 베이스라인 편집은 상시, 효력은 다음 주 경계부터
- [ADR-014](../../architecture/decisions/adr-014-deletion-and-archive.md): 세션은 삭제하지 않는다 (§2)
