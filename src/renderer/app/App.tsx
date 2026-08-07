import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'
import { queryClient } from '../shared/query'
import { subscribeMainEvents } from '../shared/query/events'
import { Button } from '@renderer/shared/ui/button'

export function App() {
  // main → renderer 이벤트 구독은 앱 최상단 한 곳에서만 한다 (ADR-026 §4).
  useEffect(() => subscribeMainEvents(queryClient), [])

  const { data, error } = useQuery({
    queryKey: ['system', 'appInfo'],
    queryFn: () => api.system.getAppInfo()
  })

  // 스캐폴딩 표시다 — 실제 화면과 카피는 기능 구현 때 만든다. 여기 있는 것은
  // "토큰이 실제로 적용되는가"를 눈으로 확인할 최소한이며, 시안의 레이아웃이 아니다.
  // 에러 갈래를 두는 이유: retry 를 끈 상태라(query.ts) 실패가 곧 최종 상태이고,
  // 없으면 IPC 계약 위반이 영원한 '로딩 중' 으로 위장된다.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      {/* text-xl·font-mono 는 Tailwind 유틸리티지만 값은 tokens.css 가 덮은 --text-xl·
          --font-mono 다. 유틸리티를 쓰는 것이 곧 토큰을 쓰는 것인지 여기서 확인된다. */}
      <h1 className="text-xl text-ink">dongmodoro</h1>
      <p className="font-mono text-ink-dim">
        {error
          ? `불러오지 못했습니다: ${error.message}`
          : data
            ? `v${data.appVersion} · schema v${data.schemaVersion}`
            : '로딩 중'}
      </p>
      <Button>스캐폴딩 확인용 버튼</Button>
    </main>
  )
}
