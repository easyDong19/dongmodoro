import { useEffect, useState } from 'react'
import { api } from '../shared/api'
import type { AppInfo } from '@shared/ipc/contracts'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  // 임시 배선이다 — Task 6 에서 TanStack Query 로 교체된다.
  useEffect(() => {
    api.system.getAppInfo().then(setInfo)
  }, [])

  return (
    <main>
      <h1>dongmodoro</h1>
      <p>{info ? `v${info.appVersion} · schema v${info.schemaVersion}` : '로딩 중'}</p>
    </main>
  )
}
