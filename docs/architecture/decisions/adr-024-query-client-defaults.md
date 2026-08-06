# ADR-024: 로컬 앱의 QueryClient 기본값 — 네트워크 전제를 걷어낸다

- 상태: accepted (2026-08-06)
- 관계: [ADR-002](adr-002-state-tanstack-query-ipc.md) §1 · [ADR-005](adr-005-timer-architecture.md) §4
  의 **결정("DB 파생 상태는 TanStack Query")을 유지하고 실행분을 확정한다.**
  두 ADR 은 "무엇을 쓸지"를 정했고 이 ADR 은 "어떤 기본값으로 쓸지"를 정한다.
  ADR-011 §6 → ADR-019, ADR-011 §7 → ADR-020 과 같은 관계다.
- 결정 근거: Task 6 착수 후 실측. query-core 소스 확인 + 빌드된 앱에 devtools
  프로토콜로 붙어 재현.

## Context

ADR-002 는 renderer 가 main 을 **서버처럼** 취급하기로 정했다. 그 비유가 정확한 만큼
위험한 지점이 하나 있다 — **TanStack Query 의 기본값은 진짜 서버를 전제한다.**

이 앱에는 네트워크가 없다. queryFn 은 같은 기계 안의 IPC 왕복이고, 그 뒤는 마이크로초
단위로 답하는 로컬 SQLite 다. 서버 앱에서 옳은 기본값 몇 개가 여기서는 틀리거나 해롭다.

### 1. `networkMode` 기본값이 로컬 DB 조회를 멈춘다

query-core 의 `retryer.js` 가 모든 fetch 를 이 게이트에 통과시킨다:

```js
function canFetch(networkMode) {
  return (networkMode ?? "online") === "online" ? onlineManager.isOnline() : true
}
const canStart = () => canFetch(config.networkMode) && config.canRun()
```

기본값이 `'online'` 이므로 **브라우저가 오프라인이라고 판단하면 fetch 가 시작되지
않는다.** 우리 queryFn 은 네트워크를 전혀 쓰지 않지만 이 게이트는 그것을 모른다.

빌드된 앱에서 재현했다 (devtools 프로토콜, `offline` 이벤트 발생 후 invalidate):

| | `fetchStatus` | `dataUpdateCount` |
|---|---|---|
| 기본값(`'online'`) | **`paused`** | 1 (변화 없음) |
| `'always'` | `idle` | 1 → 2 |

**에러가 나지 않는다.** 화면은 마지막 캐시를 계속 보여주고, 새 조회는 조용히 멎는다.

**터지는 조건이 좁아서 더 위험하다.** `onlineManager` 는 `#online = true` 로 출발하며
`navigator.onLine` 을 **읽지 않는다** — `online`/`offline` **이벤트**로만 값이 바뀐다:

```js
var OnlineManager = class extends Subscribable {
  #online = true;
  // window.addEventListener('online' | 'offline') 로만 갱신
```

따라서 **인터넷 없이 앱을 시작하는 것은 무해하고**, 위험한 것은 **실행 중 연결이
끊기는** 경우다 — 노트북 덮개, 카페 와이파이, VPN 재접속. 개발 중에는 거의 재현되지
않는 조건이다.

### 2. 재시도의 전제가 다르다

서버 앱에서 재시도가 유용한 이유는 실패가 **일시적**(패킷 유실, 순간 과부하)이기
때문이다. 우리 IPC 실패는 그렇지 않다 — `handleIpc` 의 zod 요청/응답 parse 실패이거나
발신자 검증 실패다(ADR-007). **버그이거나 계약 위반이며, 재시도하면 같은 이유로 또
실패하면서 원인만 늦게 드러난다.**

### 3. 포커스 재조회의 전제가 다르다

`refetchOnWindowFocus` 가 웹에서 유용한 이유는 **다른 사용자가 그 사이 데이터를 바꿨을
수 있기** 때문이다. 1인 로컬 앱에는 다른 사용자가 없다. 데이터를 바꾸는 것은 이 앱
자신뿐이고, 그 경로는 이미 `invalidateQueries` 가 덮는다. 반면 데스크톱 앱은 창 포커스가
수시로 오간다 — 이득 없는 재조회만 늘어난다.

## Decision

### 1. `networkMode: 'always'` — queries 와 mutations 양쪽에

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always', retry: false, refetchOnWindowFocus: false },
    mutations: { networkMode: 'always', retry: false }
  }
})
```

**`mutations` 를 따로 적는 것이 중요하다.** `defaultOptions.queries` 는 mutation 에
적용되지 않으므로, 빼두면 첫 쓰기 유스케이스가 생기는 날 같은 함정을 다시 밟는다.
지금은 mutation 이 0개라 검증할 대상이 없지만, 그래서 더 지금 넣어야 한다.

이 값을 개별 쿼리에서 뒤집지 않는다. 뒤집어야 하는 상황은 "이 쿼리는 진짜 네트워크를
쓴다"뿐인데, 그런 쿼리가 생기면 그것 자체가 별도 결정 대상이다.

### 2. `retry: false`

실패를 즉시 최종 상태로 만든다. 화면은 로딩과 실패를 구분해 표시해야 한다 — 에러 갈래가
없으면 계약 위반이 **영원한 "로딩 중"으로 위장**된다.

### 3. `refetchOnWindowFocus: false`

`invalidateQueries` 가 갱신의 유일한 경로다. 포커스는 갱신 신호가 아니다.

### 4. `staleTime` 은 전역으로 정하지 않는다

쿼리마다 성격이 다르다 — 타이머는 `Infinity`(ADR-005 §4), 캘린더 점은 그렇지 않다.
전역 기본값을 잘못 잡으면 화면마다 다른 이유로 어긋나고, 그 원인이 한 줄에 숨는다.
**쿼리를 정의하는 자리에서 명시한다.**

### 5. 쿼리 키 계층은 여전히 이연한다

타이머 착수 시 별도 ADR 로 다룬다(계획서 Task 6). 현재 존재하는 키는
`['system','appInfo']` 하나이며, 하나로 계층을 설계하면 틀린다.

## Consequences

- (+) 인터넷 상태가 로컬 DB 조회를 막지 못한다. 재현 가능한 실패 하나가 닫힌다.
- (+) 기본값이 왜 그런지가 한 곳에 모인다. 개별 화면에서 같은 판단을 반복하지 않는다.
- (+) IPC 실패가 즉시 드러난다 — 재시도로 지연되지 않는다.
- (−) `retry: false` 이므로 **모든 화면이 에러 상태를 직접 다뤄야 한다.** 로딩만 그리고
  넘어가면 실패가 영원한 로딩으로 보인다. 화면 작업의 상시 관찰 지점이다.
- (−) `refetchOnWindowFocus: false` 이므로 **invalidate 를 빠뜨리면 화면이 낡은 채로
  남는다.** 포커스가 덮어주던 안전망이 사라진 대가다.
- (−) `networkMode: 'always'` 는 진짜 네트워크를 쓰는 쿼리가 생기면 **틀린 기본값**이
  된다. v1 에 그런 쿼리는 없고(서버 없음 — ADR-004), 생긴다면 그 자체가 결정 대상이다.
- 관찰 지점 (지금 조치하지 않음): **`refetchInterval` 은 OS 절전에서 멈춘다.** 내부적으로
  `setInterval` 을 쓰는데 OS 가 절전에 들어가면 JS 이벤트 루프가 얼어붙기 때문이다
  ([TanStack Discussion #10224](https://github.com/TanStack/query/discussions/10224) 의
  메인테이너 답변). 권장 해법은 main 의
  `powerMonitor.on('resume')` 을 IPC 로 알려 `refetchQueries({ type: 'active' })` 를
  호출하는 것이다. **우리는 현재 폴링을 쓰지 않으므로 해당 없다** — ADR-005 가 타이머를
  매초 tick 이 아니라 상태 전이 push + wall-clock 산술로 정했다. 폴링이 필요해지면 이
  항목을 먼저 볼 것.
- 지금 하지 않는 것: `@tanstack/react-query-persist-client`(캐시 영속화). DB 가 이미
  영속 계층이고 캐시를 디스크에 또 쓰면 두 개의 진실이 생긴다.
