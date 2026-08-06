import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'

export function App() {
  const { data, error } = useQuery({
    queryKey: ['system', 'appInfo'],
    queryFn: () => api.system.getAppInfo()
  })

  // 스캐폴딩 표시다 — 실제 화면과 카피는 Task 7 이후 디자인 토큰 위에서 만든다.
  // 에러 갈래를 지금 두는 이유: retry 를 끈 상태라(query.ts) 실패가 곧 최종 상태이고,
  // 없으면 IPC 계약 위반이 영원한 '로딩 중' 으로 위장된다.
  return (
    <main>
      <h1>dongmodoro</h1>
      <p>
        {error
          ? `불러오지 못했습니다: ${error.message}`
          : data
            ? `v${data.appVersion} · schema v${data.schemaVersion}`
            : '로딩 중'}
      </p>
    </main>
  )
}
