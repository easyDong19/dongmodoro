import { useEffect } from 'react'
import { queryClient } from '../shared/query'
import { subscribeMainEvents } from '../shared/query/events'
import { TodayList } from '@renderer/features/today/TodayList'
import { TimerCard } from '@renderer/features/timer/TimerCard'
import { WeekCard } from '@renderer/features/week/WeekCard'
import { DisplayMonthProvider } from '@renderer/features/calendar/DisplayMonthProvider'
import { MonthSlot } from '@renderer/features/shell/MonthSlot'
import { useMonthOverlay } from '@renderer/features/shell/useMonthOverlay'
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
  // 함께 바꾸는 것이 시야 안에서 일어나야 한다. MONTH 묶음은 `MonthColumn` 이, 그것이 놓이는
  // 두 자리(컬럼·오버레이)는 `MonthSlot` 이 소유한다 (calendar-records R26).
  //
  // 오버레이의 상태·전환·포커스 규칙은 전부 `useMonthOverlay` 안에 있다 — 여기는 구성
  // 루트이고, 그 규칙들이 배치 사이에 섞이면 "무엇이 어디에 놓이는가"를 읽을 수 없게 된다.
  //
  // ClockGate 가 clock 캐시 준비 전에는 자식을 마운트하지 않는다 (콜드 스타트 크래시 수정).
  // **타이틀바도 그 안쪽이다** — 날짜 라벨이 useClock 의 dayKey 를 읽는다.

  const breakpoint = useBreakpoint()
  const isWide = breakpoint === 'wide'
  const month = useMonthOverlay(breakpoint)

  return (
    <ClockGate>
      {/*
        표시 대상 월을 **MONTH 묶음보다 위** 에서 든다. 오버레이를 닫아 두면 MONTH 가
        언마운트되는데, provider 가 그 안에 있으면 7월을 보던 사용자가 닫았다 열 때마다
        이번 달로 되돌아온다 (ux-spec §5 — 구간·가시성을 넘어 유지되는 상태).
      */}
      <DisplayMonthProvider>
        <div className="flex h-screen flex-col">
          <TitleBar monthToggle={isWide ? null : { open: month.open, onToggle: month.toggle }} />
          {/* `main` 은 global.css 가 이미 `position: relative` 로 두었다 (광원 위에 콘텐츠를
              올리는 장치). 오버레이가 그것을 기준으로 삼으므로 여기에 `relative` 유틸리티를
              또 붙이지 않는다. */}
          <main className="flex min-h-0 flex-1 items-stretch justify-center gap-6 p-6">
            {/* 자리가 바뀌어도 **같은 위치·같은 타입** 이라 MONTH 서브트리가 살아남는다.
                오버레이일 때는 절대 배치라 이 자리가 흐름을 차지하지 않는다. */}
            {month.visible ? <MonthSlot {...month.slotProps} /> : null}
            {/* overflow-hidden 은 다섯 섹션 공통 안전망이다 — 내부 스크롤 사슬이 끊겨도
                내용이 유리 카드의 둥근 모서리 밖으로 그려지는 일은 없어야 한다. `.card` 는
                표면만 소유하므로(global.css) 레이아웃인 이 속성은 여기서 준다. */}
            <section
              className="card min-h-[320px] min-w-[288px] flex-1 overflow-hidden p-4"
              aria-label="타이머"
            >
              <TimerCard />
            </section>
            {/*
              오버레이가 덮고 있는 동안 계획 컬럼은 `inert` 다 (ux-spec §3.1·§8.1).
              비모달이라 포커스 트랩은 없지만, 트랩이 없다는 것이 "가려진 컨트롤에 `Tab` 이
              닿아도 된다"는 뜻은 아니다 — 흐린 판 뒤에서 포커스 링만 뜨고 눌러도 보이지 않는
              버튼이 그 결과다. 타이머는 이 밖이라 어떤 상태에서도 조작 가능하다 (PRD R10).
            */}
            <div
              className="flex w-[360px] min-h-0 flex-col gap-6"
              inert={!isWide && month.open}
              data-testid="plan-column"
            >
              <section className="card min-h-0 flex-1 overflow-hidden" aria-label="Sprint">
                <WeekCard />
              </section>
              <section className="card min-h-0 flex-1 overflow-hidden" aria-label="오늘 목록">
                <TodayList />
              </section>
            </div>
          </main>
        </div>
      </DisplayMonthProvider>
    </ClockGate>
  )
}
