import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import { STALE_RANGE } from '@shared/ipc/contracts'
import { weeksBetween } from '@shared/time'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'
import { useClock } from '@renderer/shared/query/useClock'

export type ReviewPending = Awaited<ReturnType<Api['review']['getPending']>>
export type SettleInput = Parameters<Api['review']['settle']>[0]
export type SettleResult = Awaited<ReturnType<Api['review']['settle']>>

/** 확정이 실패할 수 있는 두 갈래. 그 밖의 실패는 없다 (technical-spec 에러 코드 표). */
export type ReviewError = 'stale' | 'failed'

/**
 * IPC 를 건너온 Error 는 메시지만 남고 앞에 Electron 의 문구가 붙는다. 그래서 코드를
 * 포함 여부로 본다 — 문자열 자체는 `@shared/ipc/contracts` 가 양쪽에 하나로 준다.
 */
function classify(error: unknown): ReviewError {
  return error instanceof Error && error.message.includes(STALE_RANGE) ? 'stale' : 'failed'
}

/**
 * 정산 패널 데이터 + 확정.
 *
 * 조회는 패널이 열려 있는 동안에만 한다 — 배너는 `useReviewStatus` 의 가벼운 판정만으로
 * 충분하고, 요약 집계는 패널을 열 때 치르면 된다. 키가 `keys.reviewPending()` 의 하위라
 * 배너와 함께 무효화된다 (keys.ts).
 */
export function useReview(open: boolean) {
  const { dayKey } = useClock()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.reviewPanel(),
    queryFn: () => api.review.getPending(),
    enabled: open
  })

  const settle = useMutation({
    mutationFn: (input: SettleInput) => api.review.settle(input),
    onSuccess: (_result, input) =>
      dispatchInvalidation(qc, {
        type: 'settled',
        payload: {
          // 서버가 준 범위를 주 단위로 펼치기만 한다 — renderer 가 판정식을 다시 돌려
          // 범위를 만들어내지 않는다 (ADR-025 §2).
          weeks: weeksBetween(input.expectedRange.from, input.expectedRange.to),
          targetWeek: input.targetWeek
        },
        currentDayKey: dayKey
      }),
    onError: (error) => {
      // 아무것도 저장되지 않았지만 범위가 달라졌다는 사실은 확인됐다. 판정과 패널을
      // 다시 읽어 새 데이터로 재렌더한다 (§8) — 선택은 항목 id 로 살아남는다 (§8.1).
      if (classify(error) === 'stale') {
        dispatchInvalidation(qc, { type: 'review-stale', currentDayKey: dayKey })
      }
    }
  })

  return {
    query,
    settle,
    /**
     * 확정 실패의 갈래. `stale` 이면 무효화가 이미 재조회를 걸어 뒀으므로 화면은 새
     * 데이터로 다시 그려지고, 이 값은 그 사실을 알리는 한 줄에만 쓰인다 (ux-spec §8).
     */
    error: settle.isError ? classify(settle.error) : null
  }
}
