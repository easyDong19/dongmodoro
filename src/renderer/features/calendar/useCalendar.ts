import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { useDisplayMonth } from './DisplayMonthProvider'

/**
 * 캘린더 카드가 쓰는 두 조회. 둘 다 **화면 하나 = 응답 하나**라 컴포넌트가 조각을 모아
 * 조립하지 않는다.
 *
 * 새 query key 를 만들지 않는다 — `monthCalendar`·`day` 는 M2 가 이미 예약해 뒀고
 * ([keys.ts](../../shared/query/keys.ts)), 무효화 배선도 그 키를 이미 털고 있다.
 *
 * `placeholderData: keepPreviousData` — 달·날짜가 바뀌면 쿼리 키가 바뀌어 `data` 가
 * 한 커밋 동안 `undefined` 가 되고, 카드가 그리드·패널을 언마운트했다 다시 그린다.
 * 그 두 번 커밋이 전환마다 layout-shift 를 만든다 (실측: 전환당 2건). 이전 키의
 * 데이터를 자리로 쓰면 응답 도착 시 한 번에 갈아끼운다.
 */
export function useCalendar() {
  const { month, selectedDay } = useDisplayMonth()

  const grid = useQuery({
    queryKey: keys.monthCalendar(month),
    queryFn: () => api.calendar.month(month),
    placeholderData: keepPreviousData
  })

  const day = useQuery({
    queryKey: keys.day(selectedDay),
    queryFn: () => api.calendar.day(selectedDay),
    placeholderData: keepPreviousData
  })

  return { month, selectedDay, grid, day }
}
