import { useEffect } from 'react'
import { queryClient } from '../shared/query'
import { subscribeMainEvents } from '../shared/query/events'
import { TodayList } from '@renderer/features/today/TodayList'
import { TimerCard } from '@renderer/features/timer/TimerCard'
import { WeekCard } from '@renderer/features/week/WeekCard'
import { TitleBar } from '@renderer/features/shell/TitleBar'
import { ClockGate } from './ClockGate'

export function App() {
  // main → renderer 이벤트 구독은 앱 최상단 한 곳에서만 한다 (ADR-026 §4).
  useEffect(() => subscribeMainEvents(queryClient), [])

  // 타이틀바 + 세 카드 — 타이머 · 주간 계획 · 오늘 목록. 반응형은 만들지 않는다(M4).
  // ClockGate 가 clock 캐시 준비 전에는 자식을 마운트하지 않는다 (콜드 스타트 크래시 수정).
  // **타이틀바도 그 안쪽이다** — 날짜 라벨이 useClock 의 dayKey 를 읽는다.
  return (
    <ClockGate>
      <div className="flex h-screen flex-col">
        <TitleBar />
        <main className="flex min-h-0 flex-1 items-stretch justify-center gap-6 p-6">
          {/* `card` 는 표면 전용 클래스다 (global.css) — 배경·테두리·blur·그림자를 토큰으로
              가져온다. 여백과 폭은 여기서 유틸리티로 준다. */}
          <section className="card min-h-[320px] flex-1 p-4" aria-label="타이머">
            <TimerCard />
          </section>
          <section className="card w-[360px]" aria-label="주간 계획">
            <WeekCard />
          </section>
          <section className="card w-[360px]" aria-label="오늘 목록">
            <TodayList />
          </section>
        </main>
      </div>
    </ClockGate>
  )
}
