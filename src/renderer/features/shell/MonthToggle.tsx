import { PanelRight } from 'lucide-react'

/**
 * 미디엄 구간의 MONTH 오버레이 토글 (app-shell ux-spec §3.1).
 *
 * 자리는 테마 세그먼트 **왼쪽** 이다 (§1.1 표). 창 컨트롤이 놓이는 변은 OS 관용구를 따르고,
 * 그 영역을 비켜 가는 것은 `.titlebar-content` 의 `env(titlebar-area-*)` 가 한다 —
 * 여기서 플랫폼별 상수를 박지 않는다.
 *
 * 아이콘이 `PanelLeft` 가 아니라 `PanelRight` 인 이유: 오버레이가 우측 계획 컬럼 위를
 * 덮기 때문이다. 왼쪽에서 열리면 좁은 창에서 타이머를 가리게 되고, 그러면 "열린 동안에도
 * 타이머를 조작할 수 있다"(PRD R10)가 말뿐이 된다.
 *
 * `aria-pressed` 로 열림 상태를 말한다 — 아이콘 하나짜리 토글은 그 아이콘이 "지금 상태"인지
 * "누르면 될 것"인지 말해주지 않으므로, 상태는 속성이 전달한다.
 *
 * **`.seg` 로 감싸는 것이 장식이 아닌 이유:** 그 클래스가 `-webkit-app-region: no-drag` 를
 * 준다. 타이틀바는 드래그 영역이라 이것이 없으면 버튼을 눌러도 눌리지 않고 창이 끌린다
 * (global.css `.seg`). 눌림 상태 스타일(`.seg button[aria-pressed='true']`)도 함께 온다.
 */
export function MonthToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="seg">
      <button
        type="button"
        aria-pressed={open}
        aria-label="MONTH"
        title="MONTH"
        onClick={onToggle}
        className="gap-1.5"
      >
        {/* 이모지 금지 — 아이콘은 lucide 컴포넌트로만 (principles §6). */}
        <PanelRight size={14} aria-hidden="true" />
        <span>MONTH</span>
      </button>
    </div>
  )
}
