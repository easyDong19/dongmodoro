import { useEffect } from 'react'
import { queryClient } from '../shared/query'
import { subscribeMainEvents } from '../shared/query/events'
import { TodayList } from '@renderer/features/today/TodayList'
import { TimerCard } from '@renderer/features/timer/TimerCard'
import { ClockGate } from './ClockGate'

export function App() {
  // main → renderer 이벤트 구독은 앱 최상단 한 곳에서만 한다 (ADR-026 §4).
  useEffect(() => subscribeMainEvents(queryClient), [])

  // 두 카드 단일 레이아웃 — 왼쪽은 타이머 카드 자리(Task 10), 오른쪽은 오늘 목록.
  // ClockGate 가 clock 캐시 준비 전에는 두 카드를 마운트하지 않는다 (콜드 스타트 크래시 수정).
  return (
    <ClockGate>
      <main className="flex min-h-screen items-start justify-center gap-6 p-6">
        <section
          className="min-h-[320px] flex-1 rounded-lg p-4"
          style={{ background: 'var(--glass)' }}
          aria-label="타이머"
        >
          <TimerCard />
        </section>
        <section
          className="w-[360px] rounded-lg"
          style={{ background: 'var(--glass)' }}
          aria-label="오늘 목록"
        >
          <TodayList />
        </section>
      </main>
    </ClockGate>
  )
}
