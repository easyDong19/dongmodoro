import { useEffect } from 'react'
import { queryClient } from '../shared/query'
import { subscribeMainEvents } from '../shared/query/events'
import { TodayList } from '@renderer/features/today/TodayList'
import { TimerCard } from '@renderer/features/timer/TimerCard'
import { WeekCard } from '@renderer/features/week/WeekCard'
import { ClockGate } from './ClockGate'

export function App() {
  // main → renderer 이벤트 구독은 앱 최상단 한 곳에서만 한다 (ADR-026 §4).
  useEffect(() => subscribeMainEvents(queryClient), [])

  // 세 카드 단일 레이아웃 — 타이머 · 주간 계획 · 오늘 목록. 반응형은 만들지 않는다(M4).
  // ClockGate 가 clock 캐시 준비 전에는 카드를 마운트하지 않는다 (콜드 스타트 크래시 수정).
  // 주간 카드도 그 안쪽이다 — useWeek 이 useClock 의 weekKey 로 쿼리 키를 만든다.
  return (
    <ClockGate>
      <main className="flex h-screen items-stretch justify-center gap-6 p-6">
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
          aria-label="주간 계획"
        >
          <WeekCard />
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
