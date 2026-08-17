import { useEffect, useState } from 'react'
import { queryClient } from '../shared/query'
import { subscribeMainEvents } from '../shared/query/events'
import { TodayList } from '@renderer/features/today/TodayList'
import { TimerCard } from '@renderer/features/timer/TimerCard'
import { WeekCard } from '@renderer/features/week/WeekCard'
import { MonthColumn } from '@renderer/features/shell/MonthColumn'
import { MonthOverlay } from '@renderer/features/shell/MonthOverlay'
import { TitleBar } from '@renderer/features/shell/TitleBar'
import { useBreakpoint } from '@renderer/shared/layout/useBreakpoint'
import { ClockGate } from './ClockGate'

export function App() {
  // main → renderer 이벤트 구독은 앱 최상단 한 곳에서만 한다 (ADR-026 §4).
  useEffect(() => subscribeMainEvents(queryClient), [])

  // 타이틀바 + ux-spec §2 의 **와이드 3컬럼**:
  //   좌 MONTH(마일스톤 + 캘린더) / 중 타이머 / 우 WEEK + TODAY
  //
  // 구간은 둘이다 — 와이드(3컬럼)와 미디엄(MONTH 접힘 + 오버레이). 내로우는 아직 없고,
  // 창 최소 폭(main/window.ts)이 그 구간 진입을 막는다.
  //
  // 타이머 섹션의 `min-w-[288px]` 은 창 하한과 짝이다. 타이머만 `flex-1`(기준 폭 0)이라
  // 좌우 고정폭을 뺀 나머지를 전부 받는 구조이고, 최소 폭이 없으면 폭이 모자랄 때
  // 사라지는 것이 하필 코어 루프가 된다.
  //
  // 두 MONTH 카드를 **같은 컬럼에 인접 배치**하는 것이 §2 의 요구다 — 달 이동이 두 카드를
  // 함께 바꾸는 것이 시야 안에서 일어나야 한다. MONTH 묶음은 `MonthColumn` 이 소유한다
  // (calendar-records R26).
  //
  // ClockGate 가 clock 캐시 준비 전에는 자식을 마운트하지 않는다 (콜드 스타트 크래시 수정).
  // **타이틀바도 그 안쪽이다** — 날짜 라벨이 useClock 의 dayKey 를 읽는다.

  const breakpoint = useBreakpoint()
  const [monthOpen, setMonthOpen] = useState(false)
  const isWide = breakpoint === 'wide'

  return (
    <ClockGate>
      <div className="flex h-screen flex-col">
        <TitleBar
          monthToggle={
            isWide ? null : { open: monthOpen, onToggle: () => setMonthOpen((open) => !open) }
          }
        />
        {/* `main` 은 global.css 가 이미 `position: relative` 로 두었다 (광원 위에 콘텐츠를
            올리는 장치). 다음 태스크의 오버레이가 그것을 기준으로 삼으므로 여기에 `relative`
            유틸리티를 또 붙이지 않는다. */}
        <main className="flex min-h-0 flex-1 items-stretch justify-center gap-6 p-6">
          {isWide ? <MonthColumn /> : null}
          {/* overflow-hidden 은 다섯 섹션 공통 안전망이다 — 내부 스크롤 사슬이 끊겨도
              내용이 유리 카드의 둥근 모서리 밖으로 그려지는 일은 없어야 한다. `.card` 는
              표면만 소유하므로(global.css) 레이아웃인 이 속성은 여기서 준다. */}
          <section
            className="card min-h-[320px] min-w-[288px] flex-1 overflow-hidden p-4"
            aria-label="타이머"
          >
            <TimerCard />
          </section>
          <div className="flex w-[360px] min-h-0 flex-col gap-6">
            <section className="card min-h-0 flex-1 overflow-hidden" aria-label="Sprint">
              <WeekCard />
            </section>
            <section className="card min-h-0 flex-1 overflow-hidden" aria-label="오늘 목록">
              <TodayList />
            </section>
          </div>
          {!isWide && monthOpen ? <MonthOverlay onClose={() => setMonthOpen(false)} /> : null}
        </main>
      </div>
    </ClockGate>
  )
}
