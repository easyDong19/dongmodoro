import { dayLabel } from '@shared/time'
import { useClock } from '@renderer/shared/query/useClock'
import { ThemeToggle } from './ThemeToggle'

/**
 * 커스텀 타이틀바 (app-shell ux-spec §1.1).
 *
 * 슬롯 순서는 좌측 앱 이름 → (여백) → 테마 세그먼트 → 날짜 라벨이다. 창 컨트롤이 놓이는
 * 변은 OS 관용구를 따르며 여기서 그리지 않는다 — 그 영역을 비켜 가는 것은 CSS 의
 * `env(titlebar-area-*)` 가 한다 (global.css `.titlebar-content`).
 *
 * **MONTH 토글은 아직 없다.** 미디엄 구간 전용인데 반응형이 없고, 그 토글이 열 MONTH
 * 컬럼(마일스톤·캘린더)도 미구현이라 지금 넣으면 아무것도 열지 않는 버튼이 된다.
 * 자리는 테마 세그먼트 **왼쪽**이다 (ux-spec §1.1 표).
 *
 * 날짜는 `useClock()` 이 전역 단일 출처로 들고 있는 값이라, 자정을 넘으면
 * `clock:boundary` 이벤트가 캐시를 갱신하면서 라벨도 함께 따라온다 — 여기에 별도 타이머를
 * 두지 않는다.
 */
export function TitleBar() {
  const { dayKey } = useClock()

  return (
    <header className="titlebar">
      <div className="titlebar-content">
        <span className="text-ink-dim">dongmodoro</span>
        <span className="flex-1" />
        <ThemeToggle />
        <span className="text-ink-dim">{dayLabel(dayKey)}</span>
      </div>
    </header>
  )
}
