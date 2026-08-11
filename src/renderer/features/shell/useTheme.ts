import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Theme } from '@shared/ipc/contracts'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { dispatchInvalidation } from '@renderer/shared/query/invalidate'

/**
 * 테마 선택의 읽기·쓰기.
 *
 * **이 훅은 화면 색을 바꾸지 않는다.** 색은 main 이 `nativeTheme.themeSource` 를 바꾸는
 * 순간 CSS 가 스스로 따라온다 (design-system ADR-010 §3). 여기서 다루는 것은 오직
 * **토글이 어느 쪽을 눌린 상태로 그릴지**이며, 그래서 렌더러에는 테마를 판단하는 코드가
 * 한 줄도 없다.
 *
 * 무효화는 dispatchInvalidation 초크포인트로만 한다 — ADR-025 §5, eslint 가 강제한다.
 */
export function useTheme(): {
  theme: Theme | undefined
  setTheme: (theme: Theme) => void
  isPending: boolean
} {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings.getTheme(),
    // 이 값을 바꾸는 경로가 아래 mutation 하나뿐이라 재요청할 이유가 없다. 트레이가 생겨
    // main 도 쓰기 시작하면 그때 settings:changed 이벤트가 갱신을 맡는다 (ADR-026).
    staleTime: Infinity
  })

  const mutation = useMutation({
    mutationFn: (theme: Theme) => api.settings.setTheme(theme),
    onSuccess: () => dispatchInvalidation(qc, { type: 'theme-changed' })
  })

  return {
    theme: query.data?.theme,
    setTheme: (theme: Theme) => mutation.mutate(theme),
    isPending: mutation.isPending
  }
}
