import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { BaselineForm } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'

export type BaselineView = Awaited<ReturnType<Api['settings']['getBaseline']>>

/**
 * 전역 분모(길이 3종·가용량)의 읽기·쓰기.
 *
 * **이 훅은 어떤 주의 분모도 계산하지 않는다.** `유효 베이스라인`·`유효 예산` 계약은
 * main 에만 있고 (pomo-baseline R13), 여기서 다루는 것은 "지금 저장된 값" 하나다.
 * 그래서 저장 결과가 진행 중인 주에 어떻게 반영되는지를 이 파일은 알지 못하며,
 * 알 필요도 없다 — 반영되지 않는 것이 규칙이다 (R22).
 *
 * 무효화는 dispatchInvalidation 초크포인트로만 한다 — ADR-025 §5, eslint 가 강제한다.
 */
export function useBaseline(): {
  data: BaselineView | undefined
  save: (form: BaselineForm, options?: { onSuccess: () => void }) => void
  isPending: boolean
  failed: boolean
} {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.baseline(),
    queryFn: () => api.settings.getBaseline(),
    // 테마와 달리 staleTime 을 무한으로 두지 않는다 — `basisPomos` 는 저장값이 아니라
    // 계획 대상 주의 예산에서 파생된 값이라, 플래너에서 예산을 고치면 낡는다.
    staleTime: 0
  })

  const mutation = useMutation({
    mutationFn: (form: BaselineForm) => api.settings.setBaseline(form),
    onSuccess: () => dispatchInvalidation(qc, { type: 'baseline-changed' })
  })

  return {
    data: query.data,
    // 성공 콜백은 호출부가 준다 — 폼을 접는 것은 저장의 일부가 아니라 화면의 반응이다.
    save: (form: BaselineForm, options?: { onSuccess: () => void }) =>
      mutation.mutate(form, { onSuccess: () => options?.onSuccess() }),
    isPending: mutation.isPending,
    failed: mutation.isError
  }
}
