import { useEffect } from 'react'
import { queryClient } from '../shared/query'
import { subscribeMainEvents } from '../shared/query/events'
import { TodayList } from '@renderer/features/today/TodayList'
import { TimerCard } from '@renderer/features/timer/TimerCard'
import { WeekCard } from '@renderer/features/week/WeekCard'
import { TitleBar } from '@renderer/features/shell/TitleBar'
import { CalendarCard } from '@renderer/features/calendar/CalendarCard'
import { DisplayMonthProvider } from '@renderer/features/calendar/DisplayMonthProvider'
import { MilestoneCard } from '@renderer/features/milestones/MilestoneCard'
import { ClockGate } from './ClockGate'

export function App() {
  // main → renderer 이벤트 구독은 앱 최상단 한 곳에서만 한다 (ADR-026 §4).
  useEffect(() => subscribeMainEvents(queryClient), [])

  // 타이틀바 + ux-spec §2 의 **와이드 3컬럼**:
  //   좌 MONTH(마일스톤 + 캘린더) / 중 타이머 / 우 WEEK + TODAY
  //
  // **반응형은 여전히 만들지 않는다.** 미디엄·컴팩트 구간과 §3.1 의 MONTH 오버레이
  // 토글은 별개 작업이며, 창을 좁히면 카드가 눌리는 상태는 M4 와 같다.
  //
  // 두 MONTH 카드를 **같은 컬럼에 인접 배치**하는 것이 §2 의 요구다 — 달 이동이 두 카드를
  // 함께 바꾸는 것이 시야 안에서 일어나야 한다. `DisplayMonthProvider` 가 그 컬럼을
  // 감싸고, 표시 대상 월의 소유자는 캘린더다 (calendar-records R26).
  //
  // ClockGate 가 clock 캐시 준비 전에는 자식을 마운트하지 않는다 (콜드 스타트 크래시 수정).
  // **타이틀바도 그 안쪽이다** — 날짜 라벨이 useClock 의 dayKey 를 읽는다.
  return (
    <ClockGate>
      <div className="flex h-screen flex-col">
        <TitleBar />
        <main className="flex min-h-0 flex-1 items-stretch justify-center gap-6 p-6">
          {/* `card` 는 표면 전용 클래스다 (global.css) — 배경·테두리·blur·그림자를 토큰으로
              가져온다. 여백과 폭은 여기서 유틸리티로 준다. */}
          <DisplayMonthProvider>
            <div className="flex w-[300px] min-h-0 flex-col gap-6">
              {/* min-h 148px 는 편집 모드(항목 2개) 실측 높이다 — 모드별 내용 높이가
                  76~146px 로 달라서, 하한이 없으면 달 이동마다 아래 캘린더 카드가 최대
                  70px 주저앉았다 솟는다 (실측). 내용이 더 길면 자라되 **컬럼의 40% 가
                  상한**이다 — 상한이 없으면 항목 수만큼 무한정 자라 아래 캘린더를 짓누른다.
                  상한에 닿으면 카드 안에서 스크롤한다 (MilestoneCard).

                  이 섹션만 flex 컨테이너인 이유: 높이가 내용을 따라가는(auto) 구간에서는
                  자식의 `h-full`(%) 이 풀리지 않아, 상한에 닿았을 때 자식을 줄이는 길이
                  flex 수축(min-h-0)뿐이다. 다른 섹션들은 flex-1 로 높이가 확정이라 자식이
                  `h-full` 을 쓴다. */}
              <section
                className="card flex max-h-[40%] min-h-[148px] shrink-0 flex-col overflow-hidden p-4"
                aria-label="월 결과물"
              >
                <MilestoneCard />
              </section>
              <section className="card min-h-0 flex-1 overflow-hidden p-4" aria-label="캘린더">
                <CalendarCard />
              </section>
            </div>
          </DisplayMonthProvider>
          {/* overflow-hidden 은 다섯 섹션 공통 안전망이다 — 내부 스크롤 사슬이 끊겨도
              내용이 유리 카드의 둥근 모서리 밖으로 그려지는 일은 없어야 한다. `.card` 는
              표면만 소유하므로(global.css) 레이아웃인 이 속성은 여기서 준다. */}
          <section className="card min-h-[320px] flex-1 overflow-hidden p-4" aria-label="타이머">
            <TimerCard />
          </section>
          <div className="flex w-[360px] min-h-0 flex-col gap-6">
            <section className="card min-h-0 flex-1 overflow-hidden" aria-label="주간 계획">
              <WeekCard />
            </section>
            <section className="card min-h-0 flex-1 overflow-hidden" aria-label="오늘 목록">
              <TodayList />
            </section>
          </div>
        </main>
      </div>
    </ClockGate>
  )
}
