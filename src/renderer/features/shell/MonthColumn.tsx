import { CalendarCard } from '@renderer/features/calendar/CalendarCard'
import { DisplayMonthProvider } from '@renderer/features/calendar/DisplayMonthProvider'
import { MilestoneCard } from '@renderer/features/milestones/MilestoneCard'

/**
 * MONTH 묶음 — 마일스톤 카드 + 캘린더 카드 (app-shell ux-spec §2).
 *
 * **컴포넌트로 뽑은 이유는 재사용이 아니라 동일성이다.** 와이드에서는 좌 컬럼이,
 * 미디엄에서는 오버레이(`MonthOverlay`)가 이것을 렌더한다. 두 자리가 각자 카드를 배치하면
 * 구성이 바뀔 때 한쪽만 고쳐지고, 그 사고는 창을 넓혔다 좁혀야만 보인다.
 *
 * 두 카드를 **인접 배치** 하는 것이 §2 의 요구다 — 캘린더의 달 이동이 마일스톤 카드를
 * 함께 바꾸는 것이 시야 안에서 일어나야 한다. `DisplayMonthProvider` 가 그 묶음을 감싸고,
 * 표시 대상 월의 소유자는 캘린더다 (calendar-records R26).
 */
export function MonthColumn() {
  return (
    <DisplayMonthProvider>
      <div className="flex h-full w-[300px] min-h-0 flex-col gap-6">
        {/* 높이는 **컬럼의 40% 고정**이다 — 내용이 아니라 뷰포트에서만 결정된다.
            min~max 사이에서 내용 따라 자라는 구간을 두면 항목을 추가할 때마다 아래
            캘린더가 눈에 띄게 밀린다 (2026-08-16 decision-log Q7). 내용이 짧으면
            카드 안이 비고, 길면 카드 안에서 스크롤한다 (MilestoneCard).

            min-h 148px 는 작은 창의 하한이다 — 편집 모드(항목 2개) 실측 높이로,
            창이 낮아 40% 가 이보다 작아지면 카드가 내용을 못 담는다.

            flex 컨테이너인 이유: 자식(MilestoneCard)이 이 고정 높이를 넘을 때
            줄어드는 길이 flex 수축(min-h-0)이다. */}
        <section
          className="card flex h-[40%] min-h-[148px] shrink-0 flex-col overflow-hidden p-4"
          aria-label="Milestone"
        >
          <MilestoneCard />
        </section>
        <section className="card min-h-0 flex-1 overflow-hidden p-4" aria-label="캘린더">
          <CalendarCard />
        </section>
      </div>
    </DisplayMonthProvider>
  )
}
