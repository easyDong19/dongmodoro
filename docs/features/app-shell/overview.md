# app-shell — 창·레이아웃·트레이·수명주기

## 기능 목적

다른 모든 기능이 담기는 껍데기다. 3컬럼(MONTH·WEEK·TODAY) 배치와 그 반응형 3단계,
창 닫기와 앱 종료의 구분, 복귀 경로 4개와 단일 창 불변식, 첫 실행(계획 0개) 화면의
조합을 소유한다. 셸의 판단 기준은 둘이다 — 창이 좁아지거나 닫혀도 **타이머는 끝까지
남는다**(원칙 1: 타이머가 코어 루프, 계획은 레이어), 그리고 **어느 플랫폼에서도 종료
경로와 복귀 경로가 각각 존재한다.**

## 현재 상태

- Draft (2026-08-04 리뷰 케이스 7·8 반영 · 2026-08-13 시간 통화 전환 반영)

> **2.0.0 에서 셸이 받은 영향은 둘뿐이다.** WEEK 카드 하단의 예산 게이지가 사라져
> **카드에 하단 고정 요소가 없어졌고**(측정 시간 합은 헤더로 올라갔다 —
> week-plan ux-spec §7), 첫 실행 온보딩(R31)이 물을 값이 **뽀모 길이 3종만** 남았다.
> 컬럼·탭·오버레이 구성은 그대로다.

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 플랫폼 범위와 종료 요청 열거, 반응형 구간,
  창 수명주기와 복귀 경로, 단일 인스턴스 잠금, 트레이, 콜드 스타트와 온보딩 자리
- [UX Spec](./ux-spec.md): 구간별 배치도, 플랫폼 조건부 타이틀바 슬롯, MONTH 오버레이,
  내로우 탭·타이머 축약형, 정산 패널의 자리, 트레이 메뉴, 리사이즈 시 상태 보존, 접근성

## 관련 횡단 문서

- [ADR-001 (design-system)](../../design-system/decisions/adr-001-breakpoint-tokens.md): 브레이크포인트 토큰 2개와 구간 3개, 접힘 우선순위의 근거
- [tokens.md §4](../../design-system/tokens.md): `--bp-wide` · `--bp-medium` 값의 유일한 출처
- [principles.md](../../design-system/principles.md): 이모지 금지·아이콘 규칙(§6), 모션(§4), `--danger` 사용 조건(§2), 토큰 추가는 ADR 선행(§5)
- [ADR-005](../../architecture/decisions/adr-005-timer-architecture.md): 타이머를 main 이 소유한다 — 창이 없어도 타이머·알림이 도는 근거, 단일 인스턴스 잠금의 근거
- [ADR-029](../../architecture/decisions/adr-029-baseline-immediate-effect.md) §1: 뽀모 길이 상시 편집·즉시 효력 — 첫 실행 온보딩이 그 편집 경로 중 하나가 된 근거 (ADR-013 §3 을 대체한다)
- [ADR-030](../../architecture/decisions/adr-030-time-as-progress-currency.md): 예산 게이지가 죽고 하단 고정 요소가 사라진 근거
- [architecture/overview.md](../../architecture/overview.md): 프로세스 경계 (트레이·알림은 main)
- [ADR-004](../../architecture/decisions/adr-004-packaging-deploy.md): 패키징·배포 — 배포 대상을 macOS 로 한정하지 않는다(크로스플랫폼 전제), macOS 서명은 M4 미결
- [결정 원장 §D](../../decision-log/2026-08-04-planning-session.md): Q16(창 수명)·Q17·Q17-1(반응형)
- [2026-08-04 리뷰 결정](../../decision-log/2026-08-04-review-decisions.md): 케이스 7(플랫폼·복귀 경로·단일 인스턴스)·케이스 8(캡처 바 닫힘)
