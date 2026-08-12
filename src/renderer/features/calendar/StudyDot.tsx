/**
 * 캘린더의 공부 점 (calendar-records R14 · A25).
 *
 * lucide 아이콘도 이모지도 아닌 **토큰 기반 커스텀 요소**다 — 뽀모 도트와 같은 이유로
 * 도메인 심볼은 lucide 에 없다 (principles §6). 색·크기는 토큰 이름으로만 기술한다.
 *
 * **점 채널 단독**이다 (R15). 숫자 색도 셀 배경도 건드리지 않으므로 `오늘 + 선택 + 진한
 * 점` 이 겹친 셀에서도 세 정보가 모두 읽힌다. 진한 점과 오늘 숫자가 같은 `--amber` 지만
 * 서로 다른 요소라 "오늘"이라는 정보가 사라지지 않는다.
 */
export function StudyDot({ level }: { level: 'basic' | 'strong' }) {
  const strong = level === 'strong'
  return (
    <span
      data-testid={strong ? 'study-dot-strong' : 'study-dot-basic'}
      aria-hidden="true"
      className={
        strong ? 'block size-[5px] rounded-full bg-amber' : 'block size-[3px] rounded-full bg-teal'
      }
    />
  )
}
