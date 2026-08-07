# ADR-005: 타이머 아키텍처 — main 소유 + 상태 전이 push + Query 캐시 합류

- 상태: accepted (2026-08-03) · **실행분 보강 (2026-08-06)** — §4 가 정한 "Query 캐시
  합류"는 유효하고, **QueryClient 기본값**은 [ADR-024](adr-024-query-client-defaults.md)
  가 확정한다. 특히 `networkMode: 'always'` 가 없으면 브라우저가 오프라인이라고 판단하는
  순간 **로컬 SQLite 조회가 `paused` 로 멈춘다**(실측). §4 의 `staleTime: Infinity` 는
  전역 기본값이 아니라 타이머 쿼리에 명시하는 값으로 읽는다 (ADR-024 §4).
  · **실행분 보강 (2026-08-07)** — push 의 계약·구독·복구 규칙은
  [ADR-026](adr-026-main-to-renderer-events.md) 이 확정한다. §4 의 "재마운트/새로고침 시
  queryFn 이 스냅샷을 당겨온다"는 **캐시가 없을 때만**(새로고침·GC 후) 참이다 — 캐시
  생존 중 재마운트는 pull 하지 않으며, 그 구간은 상주 리스너가 덮는다 (ADR-026 §4).
  또한 `timer:done` 은 세션 기록의 신호가 아니다 — 무효화는 별도 이벤트
  `session:recorded` 가 맡는다 (ADR-026 §1).
- 대체: [ADR-002](adr-002-state-tanstack-query-ipc.md) (타이머 미니 스토어 부분)

## Context

뽀모 앱의 핵심 사용 패턴은 "타이머를 켜고 창을 최소화한 채 딴 일을 한다"이다.
그런데 Chromium 은 가려진/최소화된 창의 타이머(setInterval)를 스로틀링하므로,
renderer 가 시간을 소유하면 앱을 안 보고 있을 때 타이머가 부정확해진다 — 앱의
존재 이유가 죽는 시나리오가 기본 동작이다. 잠자기(sleep) 복원, 창을 닫고 트레이로
내린 상태에서의 동작, 완료 시 OS 알림도 renderer 소유로는 해결되지 않는다 (PRD §3.1).

타이머 상태를 renderer 로 전달하는 방식은 두 가지를 검토했다:

| 방식 | 동작 | 문제 |
|---|---|---|
| 매초 tick push | main 이 1초마다 `{remainingSec}` 이벤트 발송 | renderer 의 정확도가 "이벤트가 제때 도착·처리됨"에 의존. 창이 가려지면 이벤트 처리도 스로틀링될 수 있어 표시가 밀림. 재접속 복구용 pull 이 별도로 필요 |
| 상태 전이 push | `started/paused/adjusted/done` 전이 시점에만 타임스탬프 포함 상태 발송 | renderer 가 남은 시간을 직접 계산해야 함 (아래 Decision 에서 수용) |

**주의: tick push 를 기각하는 이유는 IPC 성능이 아니다.** Electron IPC 는 1Hz 부하를
아무렇지 않게 처리한다. 이유는 정확성의 구조다.

## Decision

1. **타이머는 main process 가 소유한다.** 완료 판정, sessions INSERT, OS 알림,
   트레이 갱신은 main 만 수행한다. wall-clock(`Date.now()` 차분) 기준으로 관리해
   sleep/스로틀링에 대응한다 (PRD §5 그대로).
2. **main → renderer 동기화는 상태 전이 push.** `timer:started { startedAt, durationSec, taskId }`,
   `timer:paused`, `timer:adjusted`, `timer:done` 등 전이 시점에만 스냅샷을 발송한다.
   IPC 는 세션당 몇 건으로 줄어든다.
3. **renderer 는 표시값을 wall-clock 산술로 파생한다.** 로컬 인터벌은 "언제 다시
   그릴까"만 정하고, "얼마 남았나"는 매번 `duration - (Date.now() - startedAt)` 로
   계산한다. 스로틀링으로 화면 갱신이 멈춰도 다시 보이는 순간 자동 복구 —
   누적 오차가 구조적으로 불가능하다 (권위 서버 + 클라이언트 보간 패턴).
4. **타이머 상태는 TanStack Query 캐시에 합류한다.** 전이 이벤트 리스너가
   `queryClient.setQueryData(['timer'], snapshot)`, 컴포넌트는
   `useQuery({ queryKey: ['timer'], queryFn: () => api.timer.getState(), staleTime: Infinity })`.
   재마운트/새로고침 시 queryFn 이 main 에서 스냅샷을 당겨오므로 별도 재동기화
   코드가 필요 없다 (웹소켓 push 를 Query 캐시에 흘리는 상용 패턴과 동일).
5. **전역 상태 라이브러리(Zustand 등)는 채택하지 않는다.** renderer 의 상태 계층은
   TanStack Query + React 로컬 state 로 끝난다.

## Consequences

- (+) 최소화·잠자기·창 닫힘 상태에서도 타이머 정확성과 완료 처리가 보장된다.
- (+) renderer 상태 도구가 문자 그대로 하나 — 검토 결과 이 앱에는 renderer 고유의
  전역 공유 상태가 0개다. 집중 대상(◎)도 main 타이머 상태의 일부다 (세션 귀속을
  main 이 결정하므로 어차피 main 이 알아야 하는 값).
- (−) 불변식이 수정된다: "renderer 는 시간 계산 안 함" → **"renderer 는 시간을
  소유하지 않는다."** renderer 의 계산은 표시값(파생)일 뿐이며, renderer 계산이
  0 에 도달해도 아무 일도 일어나지 않는다. 사실을 만드는 것은 main 의 `timer:done` 뿐.
- (−) 남은 시간 계산 순수 함수를 main(완료 판정)과 renderer(표시)가 공유해야 한다
  → `src/shared/` 에 배치 ([ADR-008](adr-008-code-structure.md)).
- 상태 스키마는 스냅샷형(`{remainingSec}`)이 아니라 타임스탬프형
  (`{phase, startedAt, durationSec, taskId}`)이다. 실행 중 ±조절(PRD §3.1)도
  `timer:adjusted` 전이 이벤트다.
- 같은 기기의 두 프로세스라 시계 공유는 안전하다. 시스템 시계 점프(NTP 보정)는
  v1 에서 무시 가능한 엣지로 판단.
