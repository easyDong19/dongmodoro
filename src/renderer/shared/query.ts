import { QueryClient } from '@tanstack/react-query'

/**
 * renderer 는 main 프로세스를 **서버처럼** 취급한다 (ADR-002 §1, ADR-005 §4).
 * IPC 호출이 queryFn 이고, 변경 후 `invalidateQueries` 로 파생값을 일괄 재조회한다.
 * "DB 가 source of truth, 캐시는 캐시"라는 원칙이 Query 의 설계 그 자체가 된다.
 *
 * 기본값을 네트워크 앱과 다르게 잡는 이유 — **여기엔 네트워크가 없다.**
 * queryFn 은 같은 기계 안의 IPC 왕복이고 DB 질의는 마이크로초 단위다.
 *
 * - `networkMode: 'always'` — **이것이 없으면 앱이 인터넷 상태에 인질로 잡힌다.**
 *   기본값 `'online'` 에서 `canFetch()` 는 `onlineManager.isOnline()` 을 통과해야 fetch 를
 *   시작하는데(query-core `retryer.js`), 그 값은 브라우저의 `offline` 이벤트로 `false` 가
 *   된다. 그러면 **로컬 SQLite 조회가 `fetchStatus: 'paused'` 로 멈춘다.**
 *   실측(빌드된 앱, devtools 프로토콜): `offline` 이벤트 후 invalidate → `paused` 이고
 *   `dataUpdateCount` 가 늘지 않았다. `'always'` 로 바꾼 뒤 같은 절차 → `idle`, 1→2.
 *   앱을 인터넷 없이 **시작**하는 것은 무해하다 — `onlineManager` 는 `navigator.onLine` 을
 *   읽지 않고 `#online = true` 로 출발한다. 위험한 것은 **실행 중 연결이 끊기는** 경우다:
 *   노트북 덮개, 카페 와이파이, VPN 재접속. 그때 DB 가 조용히 멎는다.
 * - `retry: false` — IPC 실패는 일시적 네트워크 장애가 아니라 **버그이거나 계약 위반**이다
 *   (handleIpc 의 zod parse 실패, 발신자 검증 실패). 재시도하면 같은 이유로 또 실패하면서
 *   원인만 늦게 드러난다.
 * - `refetchOnWindowFocus: false` — 데스크톱 앱은 창 포커스가 수시로 오간다. 서버 앱에서
 *   이 기본값이 유용한 이유(다른 사용자가 데이터를 바꿨을 수 있다)가 1인 로컬 앱에는
 *   없다. 데이터를 바꾸는 것은 이 앱 자신뿐이고, 그 경로는 invalidate 가 덮는다.
 *
 * `mutations` 에도 같은 값을 준다. `defaultOptions.queries` 는 mutation 에 적용되지
 * 않으므로, 여기 빼두면 첫 쓰기 유스케이스가 생기는 날 같은 함정을 다시 밟는다.
 *
 * `staleTime` 은 여기서 정하지 않는다 — 쿼리마다 성격이 다르고(타이머는 `Infinity`,
 * ADR-005 §4), 전역 기본값을 잘못 잡으면 화면마다 다른 이유로 어긋난다.
 *
 * 쿼리 키 계층은 이 태스크에서 설계하지 않는다 (타이머 착수 시 별도 ADR — plan Task 6).
 * 지금 존재하는 키는 `['system','appInfo']` 하나뿐이다.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      retry: false,
      refetchOnWindowFocus: false
    },
    mutations: {
      networkMode: 'always',
      retry: false
    }
  }
})
