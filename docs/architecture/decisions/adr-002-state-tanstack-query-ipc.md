# ADR-002: 상태관리 — TanStack Query (IPC = 서버) + 타이머 미니 스토어

- 상태: **superseded by [ADR-005](adr-005-timer-architecture.md)** (2026-08-03)
- 대체 사유: "타이머 미니 스토어(Zustand 등)" 부분이 뒤집혔다. 타이머 동기화를
  매초 tick push 가 아닌 **상태 전이 push + renderer wall-clock 산술**로 바꾸면서,
  타이머 상태도 TanStack Query 캐시에 합류시킬 수 있게 되어 별도 스토어가
  불필요해졌다. "DB 파생 상태는 TanStack Query" 부분은 ADR-005 에 그대로 승계된다.

## Context

네이티브 모듈이 main 전용이라 renderer 는 IPC 로만 DB 에 접근한다 ([ADR-001](adr-001-db-better-sqlite3-drizzle.md)).
PRD §5 는 "DB 가 source of truth, 스토어는 캐시" 원칙과 함께 Zustand 를 권장했다.

앱의 상태를 성격별로 나누면 세 종류다:

| 상태 종류 | 예시 | 특성 |
|---|---|---|
| DB 파생 상태 (대부분) | 오늘 목록, 주간 할당, 소진 집계, 캘린더 점 | 비동기 조회 + 변경 후 재조회 |
| main 이 push 하는 실시간 상태 | 타이머 남은 시간, 실행 여부, 집중 대상 | 초 단위 push, pull 모델에 안 맞음 |
| 일시적 UI 상태 | 모달 열림, 선택 날짜 | 컴포넌트 로컬 |

전역 스토어(Zustand 단독)에 세 종류를 다 넣으면 캐시 무효화(세션 완료 →
task 도트·주간 게이지·캘린더 점 동시 갱신)를 수동으로 관리하게 된다.

## Decision

**renderer 입장에서 main process 를 서버로 취급한다.**

1. **DB 파생 상태는 TanStack Query.** IPC 호출(`window.api.*`)을 queryFn 으로 쓰고,
   mutation 후 `invalidateQueries` 로 관련 파생값을 일괄 재조회한다.
   "DB 가 source of truth, 스토어는 캐시" 원칙이 Query 의 설계 그 자체가 된다.
2. **타이머 상태는 전용 미니 스토어.** main 이 IPC 이벤트로 push 하는 값(남은 초,
   모드, 실행 여부, 집중 대상)만 담는다. 구현체는 Zustand vs
   `useSyncExternalStore` 직접 사용 중 미결정 — 타이머 구현 착수 시(M1) 결정한다.
3. **일시적 UI 상태는 React 로컬 state.** 전역 스토어에 올리지 않는다.

## Consequences

- (+) 세션 완료 시 파생값 갱신이 invalidate 선언만으로 전파 — 수동 캐시 동기화 코드 없음.
- (+) 전역 스토어 비대화를 구조적으로 차단. 각 상태가 자기 성격에 맞는 도구에 담긴다.
- (+) IPC API 를 "서버 API 설계"처럼 다루게 되어 main/renderer 경계가 명확해진다.
- (−) 네트워크 없는 앱에 Query 도입은 관례에서 벗어나 보일 수 있다 — 이 ADR 이 그 근거다.
- (−) invalidation 키 설계(query key 계층)를 초기에 잡아야 한다.
- PRD §5 의 "Zustand 권장"과 다른 결정이다. Zustand 가 맡을 예정이던 역할(DB 캐시)을
  Query 가 더 정확히 수행하고, Zustand 는 채택되더라도 타이머 미니 스토어로 역할이 축소된다.
