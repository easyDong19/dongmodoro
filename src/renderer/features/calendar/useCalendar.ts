import { useQuery } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { useDisplayMonth } from './DisplayMonthProvider'

/**
 * 캘린더 카드가 쓰는 두 조회. 둘 다 **화면 하나 = 응답 하나**라 컴포넌트가 조각을 모아
 * 조립하지 않는다.
 *
 * 새 query key 를 만들지 않는다 — `monthCalendar`·`day` 는 M2 가 이미 예약해 뒀고
 * ([keys.ts](../../shared/query/keys.ts)), 무효화 배선도 그 키를 이미 털고 있다.
 */
export function useCalendar() {
  const { month, selectedDay } = useDisplayMonth()

  const grid = useQuery({
    queryKey: keys.monthCalendar(month),
    queryFn: () => api.calendar.month(month)
  })

  const day = useQuery({
    queryKey: keys.day(selectedDay),
    queryFn: () => api.calendar.day(selectedDay)
  })

  return { month, selectedDay, grid, day }
}
