import { useQuery } from '@tanstack/react-query'
import { api } from '@renderer/shared/api'
import { keys } from '@renderer/shared/query/keys'
import { useClock } from '@renderer/shared/query/useClock'

/**
 * `이번 주 N일 공부 중` (calendar-records R24·R25 · A21·A22).
 *
 * **데이터와 카피의 소유는 이 기능이고, 렌더되는 자리만 타이머 카드다** (R27). 문구·판정
 * 조건을 바꿀 때 고치는 문서는 calendar-records PRD 이며, 타이머 문서는 자리(행)만 갖는다.
 * 그래서 컴포넌트가 `features/calendar/` 에 있고 타이머는 이것을 배치만 한다.
 *
 * 판정은 **완료 focus ≥ 1 인 날** 단독이며 pull 은 세지 않는다 — `기록 있음`(R5)과 다른
 * 유일한 지점이고 의도된 예외다 (A23). 조각을 체크만 한 날은 집중한 날이 아니다.
 *
 * **연속 일수가 아니다.** 사이가 비어도 각각 세며, 끊긴 날을 세거나 실패로 프레이밍하는
 * 표현을 쓰지 않는다 (R25).
 */
export function StudyDaysLine() {
  const { weekKey } = useClock()
  const { data } = useQuery({
    queryKey: keys.studyDays(weekKey),
    queryFn: () => api.calendar.studyDays(weekKey)
  })

  if (data === undefined) return null

  return (
    <p data-testid="study-days" className="text-center text-xs text-ink-dim">
      {data.days === 0 ? '오늘부터 기록이 쌓여요' : `이번 주 ${data.days}일 공부 중`}
    </p>
  )
}
