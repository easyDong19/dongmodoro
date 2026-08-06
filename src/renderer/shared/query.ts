import { QueryClient } from '@tanstack/react-query'

/**
 * renderer 는 main 프로세스를 **서버처럼** 취급한다 (ADR-002 §1, ADR-005 §4).
 * IPC 호출이 queryFn 이고, 변경 후 `invalidateQueries` 로 파생값을 일괄 재조회한다.
 * "DB 가 source of truth, 캐시는 캐시"라는 원칙이 Query 의 설계 그 자체가 된다.
 *
 * 기본값을 네트워크 앱과 다르게 잡는 이유 — **여기엔 네트워크가 없다.**
 * queryFn 은 같은 기계 안의 IPC 왕복이고 DB 질의는 마이크로초 단위다.
 *
 * - `retry: false` — IPC 실패는 일시적 네트워크 장애가 아니라 **버그이거나 계약 위반**이다
 *   (handleIpc 의 zod parse 실패, 발신자 검증 실패). 재시도하면 같은 이유로 또 실패하면서
 *   원인만 늦게 드러난다.
 * - `refetchOnWindowFocus: false` — 데스크톱 앱은 창 포커스가 수시로 오간다. 서버 앱에서
 *   이 기본값이 유용한 이유(다른 사용자가 데이터를 바꿨을 수 있다)가 1인 로컬 앱에는
 *   없다. 데이터를 바꾸는 것은 이 앱 자신뿐이고, 그 경로는 invalidate 가 덮는다.
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
      retry: false,
      refetchOnWindowFocus: false
    }
  }
})
