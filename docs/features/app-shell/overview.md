# app-shell — 창·레이아웃·트레이·수명주기

## 기능 목적

다른 모든 기능이 담기는 껍데기다. 3컬럼(MONTH·WEEK·TODAY) 배치와 그 반응형 3단계,
창 닫기와 앱 종료의 구분, 트레이를 통한 복귀 경로, 첫 실행(계획 0개) 화면의 조합을
소유한다. 셸의 판단 기준은 하나다 — 창이 좁아지거나 닫혀도 **타이머는 끝까지 남는다**
(원칙 1: 타이머가 코어 루프, 계획은 레이어).

## 현재 상태

- Draft

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 반응형 구간, 창 수명주기, 트레이, 콜드 스타트
- [UX Spec](./ux-spec.md): 구간별 배치도, MONTH 오버레이, 내로우 탭·타이머 축약형, 트레이 메뉴, 리사이즈 시 상태 보존

## 관련 횡단 문서

- [ADR-001 (design-system)](../../design-system/decisions/adr-001-breakpoint-tokens.md): 브레이크포인트 토큰 2개와 구간 3개, 접힘 우선순위의 근거
- [tokens.md §4](../../design-system/tokens.md): `--bp-wide` · `--bp-medium` 값의 유일한 출처
- [principles.md](../../design-system/principles.md): 이모지 금지·아이콘 규칙(§6), 모션(§4), `--danger` 사용 조건(§2)
- [ADR-005](../../architecture/decisions/adr-005-timer-architecture.md): 타이머를 main 이 소유한다 — 창이 없어도 타이머·알림이 도는 근거
- [architecture/overview.md](../../architecture/overview.md): 프로세스 경계 (트레이·알림은 main)
- [ADR-004](../../architecture/decisions/adr-004-packaging-deploy.md): 패키징·배포 (macOS 서명은 M4 미결)
- [결정 원장 §D](../../decision-log/2026-08-04-planning-session.md): Q16(창 수명)·Q17·Q17-1(반응형)
