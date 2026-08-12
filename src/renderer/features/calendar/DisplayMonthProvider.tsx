import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { addMonths } from '@shared/time'
import { useClock } from '@renderer/shared/query/useClock'

/**
 * **표시 대상 월과 선택 날짜를 이 기능이 소유한다** (calendar-records R26 · A24).
 *
 * 같은 MONTH 컬럼에 놓이는 마일스톤 카드는 자기 월 상태를 갖지 않고 이 값을 구독한다.
 * 그래서 두 카드가 서로 다른 달을 말하는 상태가 **표현 자체로 불가능**하다 — 마일스톤
 * 전용 월 선택기를 만들지 않는 것(R19)이 규율이 아니라 구조가 된다.
 */
type DisplayMonth = {
  /** `'YYYY-MM'`. 그리드와 마일스톤 카드가 함께 보는 달. */
  month: string
  /** `'YYYY-MM-DD'`. **표시 월과 다른 달일 수 있고 그것이 정상이다** (R8). */
  selectedDay: string
  goPrevMonth: () => void
  goNextMonth: () => void
  selectDay: (dayKey: string) => void
}

const Ctx = createContext<DisplayMonth | null>(null)

export function DisplayMonthProvider({ children }: { children: ReactNode }) {
  const { monthKey, dayKey } = useClock()

  /**
   * 초기값만 시계에서 읽는다. 자정을 넘겨 달이 바뀌어도 **보고 있던 달이 따라 움직이지
   * 않는다** — 그것은 사용자가 하지 않은 월 이동이고, 과거 달을 열어 둔 채 자정을 맞은
   * 사람의 화면이 예고 없이 튀는 일이 된다. 오늘 강조는 여전히 현재 시각에서 오므로
   * 그 순간 그리드에 오늘이 안 보일 수 있는데, 그것이 R8 이 이미 정상이라고 적어 둔 상태다.
   */
  const [month, setMonth] = useState(monthKey)
  const [selectedDay, setSelectedDay] = useState(dayKey)

  const value = useMemo<DisplayMonth>(
    () => ({
      month,
      selectedDay,
      // 월 이동은 **표시 대상 월만** 바꾼다 (R8) — 선택 날짜도 타이머 상태도 건드리지 않는다.
      goPrevMonth: () => setMonth((m) => addMonths(m, -1)),
      goNextMonth: () => setMonth((m) => addMonths(m, 1)),
      selectDay: setSelectedDay
    }),
    [month, selectedDay]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDisplayMonth(): DisplayMonth {
  const ctx = useContext(Ctx)
  if (ctx === null) {
    throw new Error('useDisplayMonth must be used inside DisplayMonthProvider')
  }
  return ctx
}
