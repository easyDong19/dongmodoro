# ADR-026: main → renderer 이벤트 채널 — 커밋 후 발송, 양쪽 parse, 구독은 한 곳

- 상태: accepted (2026-08-07)
- 관계: [ADR-005](adr-005-timer-architecture.md) §2·§4 의 **결정("상태 전이 push +
  Query 캐시 합류")을 유지하고 실행분을 확정한다.** ADR-005 는 "무엇을 보낼지"를
  정했고 이 문서는 "어떤 규칙으로 보내고 받을지"를 정한다. §4 의 "재마운트/새로고침
  시 queryFn 이 당겨온다"는 서술은 절반만 참으로 확인됐다 — **캐시가 없을 때만**
  (새로고침·GC 후) pull 이 일어난다. 캐시 생존 중 재마운트는 pull 하지 않으며,
  이것이 무해한 조건(§4)을 이 문서가 정한다.
  [ADR-007](adr-007-ipc-contract.md) 의 invoke 계약 규칙을 push 방향으로 연장한다.
  이벤트가 도착한 뒤 무엇을 지우는가는 [ADR-025](adr-025-query-key-hierarchy.md) §3 소관.
- 결정 근거: `@tanstack/query-core@5.101.4` 설치 소스 검증(레이스 확인) + 기능 PRD
  대조. 설계 원본:
  [2026-08-07 설계 문서](../../superpowers/specs/2026-08-07-query-keys-and-events-design.md).

## Context

M1 이 세운 IPC 인프라는 요청→응답(invoke) 한 방향뿐이다. `handleIpc` 는 발신자
검증과 요청·응답 parse 를 강제하지만(ADR-007), main 이 스스로 일으키는 사건 —
타이머 전이, 세션 기록, 트레이에서의 설정 변경, 자정 경계 — 을 renderer 에 알리는
방향은 규칙이 없다. 이대로 타이머를 만들면 규칙 없는 두 번째 IPC 경로가 생긴다.

리뷰에서 확인된 함정이 셋이다.

1. **`timer:done` ≠ 세션 기록.** 기록 여부와 귀속(짧은 세션 폐기, 사후 캡처의 소급
   생성)은 main 의 정책이다. renderer 가 "done 이면 기록됐겠지"라고 추론하면 같은
   정책이 두 곳에 산다.
2. **push 가 DB 커밋보다 먼저 도착하면 영구 stale.** renderer 가 커밋 전 데이터를
   재조회하고, `refetchOnWindowFocus: false`(ADR-024) 라 다음 사건까지 낡은 채 남는다.
3. **새로고침 직후 역전 레이스.** 캐시가 비어 마운트 fetch(getState)가 날아가는 사이
   전이 push 가 도착하면, 나중에 resolve 된 **옛 스냅샷이 새 push 를 덮는다** — v5 는
   fetch 성공이 시각 비교 없이 무조건 캐시를 쓴다(`query.ts` `setData`). 화면은 끝난
   타이머를 계속 카운트다운한다.

## Decision

### 1. 이벤트는 4종이다 (v1 전체)

| 채널 | payload | 역할 |
|---|---|---|
| `timer:transition` | 타이머 스냅샷 `{phase, startedAt, durationSec, taskId}` | ADR-005 §2 의 전이 push. **`['timer']` 캐시 갱신 전용** — 무효화를 일으키지 않는다 |
| `session:recorded` | `{localDate, localWeek}` — **저장값** | 세션 INSERT **커밋 후** 발송. ADR-025 §3 사건 1의 입력 |
| `settings:changed` | 바뀐 설정 스냅샷 | main 이 직접 settings 를 쓰는 경로(트레이 테마 — app-shell prd R42) 전용. 사건 11의 입력 |
| `clock:boundary` | `{dayKey, weekKey, monthKey}` — 전이 후 값 | 자정 정각 알람 1개 + `powerMonitor` resume 시 놓친 경계의 보정 발사. 사건 12의 입력 |

`timer:transition` 과 `session:recorded` 를 분리하는 이유가 함정 1 이다. 전자는
"타이머 상태가 바뀌었다"(표시), 후자는 "사실이 기록됐다"(무효화) — 서로 다른
소비자를 가지며, 후자의 payload 키는 renderer 가 재계산하지 않고 그대로 쓴다
(ADR-025 §1-2).

`clock:boundary` 가 정각 알람이고 매분 tick 이 아닌 이유: ADR-005 가 매초 tick push
를 기각한 논리 그대로다 — 사실이 바뀌는 순간(날짜 전이)에만 이벤트를 보낸다.
23시 이후의 안내 힌트(today-tasks prd R19 H1/H2)는 표시 전용이므로 renderer 로컬
1분 인터벌로 판정한다 — "표시는 renderer, 사실은 main" 분업(ADR-005 §3)과 같은 구도.

### 2. 불변식: main 은 커밋 후에만 발송한다

`session:recorded` 를 포함해 DB 상태를 가리키는 모든 이벤트는 **해당 트랜잭션이
커밋된 뒤에** 발송한다. better-sqlite3 가 동기이므로(ADR-015) "INSERT → send" 코드
순서만으로 보장된다 — 비용은 0이고, 어기면 함정 2(영구 stale)가 열린다.

### 3. 계약과 검증 — invoke 와 대칭

- 이벤트도 채널마다 **payload zod 스키마**를 `src/shared/ipc/contracts.ts` 에 갖는다.
  채널 이름은 `channels.ts` 상수. invoke 의 req/res 쌍과 같은 자리, 같은 규칙이다.
- **양쪽 parse**: main 은 발송 직전에, renderer 는 수신 직후에 같은 스키마로 parse
  한다. `handleIpc` 가 자기 응답까지 검사하는 것과 같은 이유다 — main 쪽 버그로
  계약과 다른 payload 가 나가면 화면이 조용히 `undefined` 를 렌더하는 대신 그
  자리에서 터진다.
- `handleIpc` 와 대칭인 헬퍼 두 개를 만든다: main 쪽 `sendEvent(win, channel,
  contract, payload)`, renderer 쪽 `subscribe(channel, contract, handler)`. raw
  `webContents.send`·`ipcRenderer.on` 직접 호출은 이 헬퍼 밖에서 금지한다.

### 4. preload 표면과 구독 지점

- preload 는 채널마다 `onX(callback): () => void` — **구독 해제 함수를 반환하는
  형태만** 노출한다. raw `ipcRenderer` 비노출 원칙(ADR-007 §3)은 그대로다.
- 콜백에 Electron 의 `event` 객체를 넘기지 않고 **payload 만** 넘긴다 — renderer
  코드가 Electron 표면에 닿지 않는다.
- 구독은 **앱 최상단 한 곳**(QueryClientProvider 안쪽의 단일 이펙트)에서만 한다.
  화면 컴포넌트는 이벤트를 직접 구독하지 않고 캐시를 읽는다. 해제 함수로 핫
  리로드·재마운트 시 리스너 누적을 차단한다.
- **타이머 리스너의 순서 고정**: `cancelQueries({ queryKey: ['timer'] })` →
  `setQueryData(['timer'], snapshot)`. in-flight pull 을 취소해 함정 3(역전 레이스)을
  차단한다 — 낙관적 업데이트의 표준 처방과 동일하다.
- **복구 경로**: `['timer']`·`['clock']` 모두 queryFn(`timer.getState` /
  `clock.now` invoke)을 가진다. 창이 닫혔다 열리거나 캐시가 GC 되면 pull 로
  복원된다 — 이벤트 유실이 영구 상태가 되지 않는다. 이것이 ADR-005 §4 서술이
  실제로 성립하는 조건이다: 상주 리스너(이 문서 §4)가 캐시 생존 중의 전이를 덮고,
  pull 은 캐시가 없는 경우를 덮는다.

## Consequences

- (+) push 방향도 invoke 와 같은 밀도의 계약을 갖는다. 계약 위반이 발송·수신
  양쪽에서 즉시 터진다.
- (+) "타이머는 끝났는데 소진이 그대로"(이벤트 유실·순서 역전) 계열의 버그가
  구조적으로 닫힌다: 커밋 후 발송(§2) + cancel 선행(§4) + pull 복구(§4).
- (+) 세션 기록 정책이 main 한 곳에 남는다. renderer 는 payload 를 소비할 뿐이다.
- (−) 이벤트 하나 추가에 다섯 곳(contracts, channels, sendEvent 호출, preload,
  최상단 구독)이 늘어난다. invoke 의 "4곳 규칙"과 같은 성격의 비용이며, 그 대가로
  "무엇이 열려 있는지"가 목록으로 남는다.
- (−) `clock:boundary` 의 resume 보정을 빼먹으면 "덮개 닫고 아침에 열었더니 어제
  목록"이 된다. 타이머 태스크의 상시 관찰 지점이다.
- v1 에서 이벤트는 4종뿐이다. 다섯 번째가 필요해지는 순간(예: 백업 완료 알림)은
  이 문서의 규칙을 따르되 목록 확장으로 족하다 — 새 ADR 이 필요한 결정이 아니다.
