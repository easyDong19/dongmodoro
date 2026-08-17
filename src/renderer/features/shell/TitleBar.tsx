import { dayLabel } from '@shared/time'
import { useClock } from '@renderer/shared/query/useClock'
import { ThemeToggle } from './ThemeToggle'
import { MonthToggle } from './MonthToggle'

/**
 * 커스텀 타이틀바 (app-shell ux-spec §1.1).
 *
 * 슬롯 순서는 좌측 앱 이름 → (여백) → MONTH 토글 → 테마 세그먼트 → 날짜 라벨이다.
 * 창 컨트롤이 놓이는 변은 OS 관용구를 따르며 여기서 그리지 않는다 — 그 영역을 비켜 가는
 * 것은 CSS 의 `env(titlebar-area-*)` 가 한다 (global.css `.titlebar-content`).
 *
 * **MONTH 토글은 미디엄 구간 전용이다.** 그 판정을 여기서 하지 않고 `App` 이 넘겨주는
 * 이유는, 토글이 여닫는 상태의 소유자가 `App` 이기 때문이다 — 판정과 상태가 갈라지면
 * 구간 전환 시 둘을 맞추는 코드가 양쪽에 생긴다.
 *
 * 날짜는 `useClock()` 이 전역 단일 출처로 들고 있는 값이라, 자정을 넘으면
 * `clock:boundary` 이벤트가 캐시를 갱신하면서 라벨도 함께 따라온다.
 */
export function TitleBar({
  monthToggle
}: {
  monthToggle?: { open: boolean; onToggle: () => void } | null
}) {
  const { dayKey } = useClock()

  return (
    <header className="titlebar">
      <div className="titlebar-content">
        <span className="text-ink-dim">dongmodoro</span>
        <span className="flex-1" />
        {monthToggle ? <MonthToggle {...monthToggle} /> : null}
        <ThemeToggle />
        <span className="text-ink-dim">{dayLabel(dayKey)}</span>
      </div>
    </header>
  )
}
