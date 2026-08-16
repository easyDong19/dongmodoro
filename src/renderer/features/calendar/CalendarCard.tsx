import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel } from '@shared/time'
import { useClock } from '@renderer/shared/query/useClock'
import { Button } from '@renderer/shared/ui/button'
import { DayPanel } from './DayPanel'
import { MonthGrid } from './MonthGrid'
import { useCalendar } from './useCalendar'
import { useDisplayMonth } from './DisplayMonthProvider'

/**
 * 캘린더 카드 — 월 그리드 + 날짜 기록 패널 (calendar-records).
 *
 * **`‹ ›` 이동에 범위 제한이 없다** (R9 · A17). 기록이 없는 과거·미래 달로도 이동할 수
 * 있고, 그 달은 점 없는 그리드로 정상 렌더된다 — 에러도 빈 화면도 아니다. 데이터 시작일을
 * 하한으로 삼는 규칙을 두지 않는다.
 *
 * 이 컨트롤이 바꾸는 값은 `DisplayMonthProvider` 하나이며, 같은 컬럼의 마일스톤 카드가
 * 그 값을 구독한다 (R26 · A24). 여기서 마일스톤을 직접 알지 않는다.
 */
export function CalendarCard() {
  const { dayKey } = useClock()
  const { goPrevMonth, goNextMonth, selectDay } = useDisplayMonth()
  const { month, selectedDay, grid, day } = useCalendar()

  return (
    // h-full 이 없으면 이 div 는 내용 높이로 자라 아래 스크롤 영역의 flex-1 이 기준을
    // 잃는다 — overflow 가 영영 발동하지 않아 목록이 카드 밖으로 넘쳤다 (섹션 높이는
    // App 의 flex-1 로 확정이므로 % 가 풀린다).
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-1 pb-2">
        <h2 className="card-title text-ink">{monthLabel(month)}</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="이전 달"
            onClick={goPrevMonth}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="다음 달"
            onClick={goNextMonth}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
        {grid.data ? (
          <MonthGrid
            data={grid.data}
            todayKey={dayKey}
            selectedDay={selectedDay}
            onSelectDay={selectDay}
          />
        ) : null}
        {day.data ? <DayPanel data={day.data} todayKey={dayKey} /> : null}
      </div>
    </div>
  )
}
