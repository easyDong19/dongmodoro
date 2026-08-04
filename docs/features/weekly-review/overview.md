# weekly-review — 주간 리뷰 (정산)

## 기능 목적

한 주가 끝나고 다음 주를 시작하는 지점에서, 남은 항목을 **한 번만 분류**하게 하고
다음 주 계획을 시작할 수 있는 상태로 넘긴다. 자동 이월도 자동 폐기도 하지 않으며
(원칙 4), 리뷰를 무시해도 앱의 모든 기능은 계속 동작한다 (원칙 5). 몇 주를 비우고
돌아와도 "밀린 숙제"라는 상태가 생기지 않도록, 정산은 항상 화면 1개로 병합된다.

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 정산 필요 판정, 이월 3택, 요약 구성 규칙
- [UX Spec](./ux-spec.md): 배너·리뷰 패널의 상태와 문구 — 항목 행 구성, 예외 화면, 확정 버튼
- [Technical Spec](./technical-spec.md): 판정식·확정 트랜잭션 의사코드, IPC 명령, 읽고 쓰는 테이블, 경계 시나리오

## 관련 횡단 문서

- [결정 원장 2026-08-04](../../decision-log/2026-08-04-planning-session.md): Q5(워터마크 판정)·Q6(전 구간 병합)·Q12(이월 배지)·Q13·Q14 + plan_lead_days
- [정산·계획 플로우 시각화](../../decision-log/2026-08-04-settlement-flow.html): 판정식과 시나리오 7종 (이 기능의 1차 근거 자료)
- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 시간 포맷 규약 — 달력 키는 쓸 때 1회 계산 후 불변
- [ADR-010](../../architecture/decisions/adr-010-week-definition.md): 주 정의 — 월요일 시작, 주 키 = 월요일 날짜, plan_lead_days
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md): `weeks`·`week_items.origin_week`·`completed_at`/`dropped_at` 스키마
- [ADR-007](../../architecture/decisions/adr-007-ipc-contract.md): 확정은 유스케이스 1개 = 트랜잭션 1개
- [design-system/principles.md](../../design-system/principles.md): 실패 프레임 금지(§1), `--danger` 조건(§2), 이모지 금지(§6)
