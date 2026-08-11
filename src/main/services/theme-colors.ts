import type { Theme } from '@shared/ipc/contracts'

/**
 * 창 컨트롤 오버레이의 색 — **CSS 밖에 존재하는 유일한 색 값이다.**
 *
 * Windows·Linux 는 창 컨트롤(닫기·최소화·최대화)을 OS 가 그리고 그 색을
 * `titleBarOverlay` 로 **JS 가 지정**해야 한다. main 프로세스는 CSS 커스텀 프로퍼티를
 * 읽을 수 없으므로 값이 여기 한 벌 더 있다.
 *
 * 이것은 "raw hex 금지"(design-system principles §5)의 **실질적 예외**이며
 * [design-system ADR-010 §5](../../../docs/design-system/decisions/adr-010-app-owned-theme.md)
 * 가 명시적으로 허용한다. 값의 원본은 여전히
 * [tokens.css](../../renderer/shared/styles/tokens.css) 이고, **이 파일의 테스트가 그
 * 파일을 직접 읽어 문자열 일치를 단언한다** — 토큰을 바꾸고 여기를 안 고치면 테스트가
 * 먼저 깨진다. 그 감시 장치가 이 예외를 감당 가능하게 만든다.
 *
 * 알파가 있는 토큰(`--ink-dim` 등)을 쓰지 않는다. 창 컨트롤 글리프는 배경과 합성되지 않는
 * 자리라 불투명 색이어야 한다.
 *
 * **알려진 한계:** 앱의 타이틀바는 라디얼 광원 위에 투명하지만 OS 오버레이 영역은 불투명
 * `--bg-deep` 이다. Windows·Linux 에서 창 컨트롤 주변에 미세한 색 이음매가 보이며,
 * 오버레이 영역을 투명하게 만들 방법이 없다.
 */
export const OVERLAY_COLORS: Record<Theme, { color: string; symbolColor: string }> = {
  dark: {
    color: '#0c1a16', // --bg-deep
    symbolColor: '#eef4ef' // --ink
  },
  light: {
    color: '#e7eeec', // --light-bg-deep
    symbolColor: '#0c1a16' // --light-ink
  }
}

/**
 * 타이틀바 높이. 와이어프레임의 `.titlebar` 와 같은 값이며, Windows·Linux 에서는 이 높이가
 * 곧 OS 가 그리는 오버레이 영역의 높이가 된다(`titleBarOverlay.height`).
 *
 * px 이다 — 모서리·타깃 크기와 같은 부류이고 글자 크기에 비례하지 않는다
 * (design-system ADR-007).
 */
export const TITLEBAR_HEIGHT = 38
