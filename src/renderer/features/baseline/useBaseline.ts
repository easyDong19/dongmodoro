import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Api } from '@shared/ipc/api'
import type { BaselineForm } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'

export type BaselineView = Awaited<ReturnType<Api['settings']['getBaseline']>>

/**
 * 뽀모 길이 3종의 읽기·쓰기.
 *
 * **이 훅은 어떤 주의 값도 계산하지 않는다.** 길이의 저장소는 전역값 하나뿐이고
 * (ADR-029 §2), 여기서 다루는 것은 "지금 저장된 값" 하나다. 저장은 즉시 효력을 갖고
 * 적용 시점은 다음 세션 시작이며, 그 시점 판정은 타이머가 갖는다 (timer R1).
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
    // 응답이 저장값 3종뿐이라 파생 필드가 낡을 일은 없지만, staleTime 을 무한으로 두지는
    // 않는다 — 폼을 다시 열 때 다른 경로(첫 실행 온보딩)로 바뀐 값을 놓치지 않기 위해서다.
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
