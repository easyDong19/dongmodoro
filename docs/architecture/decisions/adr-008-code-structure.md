# ADR-008: 코드 구조 — main 3층 + renderer FSD-lite

- 상태: accepted (2026-08-03)

## Context

main 과 renderer 는 성격이 다르다. main 은 사실상 작은 백엔드 서버(DB·트랜잭션·
도메인 규칙)이고, renderer 는 뷰다. 이 앱에서 가장 복잡한 로직(주간 리뷰 정산 —
빈 주 자동 통과, carry 사슬에 건너뛴 주 가산, 남은 몫 계산, "줄여서"의 절반 올림)은
버그가 나면 데이터가 오염되는 규칙들이라 테스트 가능성이 중요하다.

renderer 쪽에서는 FSD 적용 강도를 검토했다. 이 앱의 특성: 단일 창, 페이지 1개
(3컬럼 대시보드), 라우팅 없음, 개발자 1인.

## Decision

### main — 책임 계층 3층 (단, 규칙이 있는 곳에만)

```
IPC 핸들러 (zod 검증, 얇음)
  → 서비스 (트랜잭션, DB 읽기·쓰기)
    → 순수 도메인 함수 (정산 병합, carry 계산 — DB도 IPC도 모름)
```

- 순수 도메인 함수는 `(지난 주 상태, 사용자 결정) → 새 주에 만들 것들` 형태의
  입출력만 가져 Vitest 로 DB 없이 테스트한다. PRD M3 완료 기준인 "2주 공백 케이스"를
  유닛 테스트로 고정할 수 있다.
- **3층을 모든 핸들러에 강제하지 않는다.** `getWeekItems` 같은 단순 조회는
  핸들러 → 쿼리 직행. 순수 계층은 정산·carry·예산 검증처럼 규칙이 있는 곳에만 만든다.
  전 핸들러에 계층을 깔면 관료제가 된다.

### renderer — FSD-lite

```
src/renderer/
├── features/   # timer, today, week-plan, milestones, calendar, review
│                 (docs/features/ 의 기능 폴더와 1:1 대응)
├── entities/   # task, week-item, session, milestone — 타입·query hook·표시 컴포넌트
└── shared/     # UI 킷(shadcn 커스텀), lib
```

- 정통 FSD 의 `pages`/`widgets` 레이어는 생략한다 — 페이지가 1개뿐이라 빈 껍데기가
  되고, 1인 프로젝트에서 레이어 경계 관리 비용이 이득을 넘는다. 위젯 재사용이
  실제로 발생하면 그때 승격한다.
- FSD 의 **단방향 import**(상위만 하위를 import)와 **public API 노출** 원칙은 유지한다.

### FSD 를 main 에 적용하지 않는 이유

FSD 의 레이어 축(app → pages → widgets → features → entities → shared)은 **UI 합성의
계층**이다. main 에는 페이지도 위젯도 없어 축 자체가 무의미하다. main 에 맞는 축은
**책임의 계층**(핸들러 → 서비스 → 도메인 → DB)이며 이는 백엔드의 layered
architecture 다. 두 프로세스가 서로 다른 패턴을 갖는 것이 정상이다.
단 FSD 의 밑바닥 원칙(단방향 의존, public API)은 FSD 고유 발명이 아닌 일반 원칙이라
main 의 3층에도 그대로 적용된다.

### src/shared/ (프로세스 간 공유)

- IPC 채널 정의 + zod 계약 스키마 ([ADR-007](adr-007-ipc-contract.md))
- **양쪽이 모두 쓰는 순수 계산**: 타이머 남은 시간(main=완료 판정, renderer=표시 —
  [ADR-005](adr-005-timer-architecture.md)), 요일별 부하 분산(플래너 경고 미리보기)
- 여기에만 두어 로직 중복·불일치를 방지한다.

## Consequences

- (+) 정산 로직을 DB 셋업 없이 유닛 테스트할 수 있다 — PRD 에서 가장 위험한 로직의
  회귀를 값싸게 막는다.
- (+) renderer 의 features 슬라이스가 기획 문서(`docs/features/`)와 1:1 이라
  문서와 코드가 같은 언어를 쓴다.
- (+) 계층 규칙이 "규칙 있는 곳에만"이라 파일 수 폭증을 피한다.
- (−) 어디까지 순수 계층으로 뺄지는 판단이 필요하다. 기준: **DB 없이 테스트하고
  싶은 규칙이면 순수 함수로 뺀다.**
- (−) `src/shared/` 는 두 런타임에서 모두 로드되므로 Node/Electron API 나 DOM API 를
  import 해서는 안 된다 (순수 TS 만).
