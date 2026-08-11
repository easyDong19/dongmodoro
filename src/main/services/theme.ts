import { nativeTheme } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Theme } from '@shared/ipc/contracts'
import type { UnitOfWork } from './ports'
import { OVERLAY_COLORS, TITLEBAR_HEIGHT } from './theme-colors'

/** `settings` 값은 JSON 문자열이다 (ADR-018 §5). */
const THEME_KEY = 'theme'
const DEFAULT_THEME: Theme = 'dark'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * 저장된 테마를 읽는다. 유효하지 않으면 `dark` 로 판정하고 **그 값을 즉시 되쓴다.**
 *
 * 되쓰기가 핵심이다. 기존 개발·사용자 DB 에는 `'"system"'` 이 그대로 남아 있다 —
 * 시딩은 멱등이라(ADR-018 §4 "키가 없을 때만") 기본값을 `dark` 로 바꾸는 것만으로는
 * 기존 DB 가 갱신되지 않는다. 읽을 때마다 조용히 `dark` 를 돌려주고 넘어가면 저장소에
 * 영원히 계약 밖의 값이 남고, 나중에 그 값을 직접 보는 사람이 혼란스러워진다
 * (design-system ADR-010 §1).
 *
 * JSON 파싱 실패도 같은 경로로 보낸다 — 손상된 설정 하나 때문에 앱이 안 뜨는 것보다
 * 기본값으로 복구하는 편이 낫다. 테마는 표시 설정이라 잘못 골라도 데이터가 상하지 않는다.
 */
export function readTheme(uow: UnitOfWork): Theme {
  return uow.run((repos) => {
    const raw = repos.settings.get(THEME_KEY)

    let parsed: unknown = null
    if (raw !== null) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }
    }

    if (isTheme(parsed)) return parsed

    repos.settings.set(THEME_KEY, JSON.stringify(DEFAULT_THEME))
    return DEFAULT_THEME
  })
}

/**
 * 테마를 실제로 적용한다 — **`nativeTheme.themeSource` 에 값을 넣는 유일한 곳이다**
 * (design-system ADR-010 §3).
 *
 * 이 한 줄이 두 세계를 동시에 움직인다. `themeSource` 는 렌더러의
 * `prefers-color-scheme` 미디어 쿼리까지 결정하므로 tokens.css 의 라이트 경로가 그대로
 * 동작하고, 동시에 macOS 트래픽 라이트의 명암도 여기서 따라온다. 해석 지점이 하나뿐이라
 * CSS 와 창 컨트롤이 어긋날 수 없다.
 *
 * **창 생성 이전에 불려야 한다.** 그래야 창이 태어나는 순간 이미 올바른 테마이고 첫 페인트
 * 깜빡임이 구조적으로 발생하지 않는다 (main/index.ts 의 호출 순서 참조).
 */
export function applyTheme(theme: Theme, win?: BrowserWindow | null): void {
  nativeTheme.themeSource = theme

  // macOS 는 부를 필요가 없다 — `setTitleBarOverlay` 는 win32·linux 전용이고, 트래픽
  // 라이트는 위의 themeSource 를 따라 OS 가 알아서 다시 그린다.
  if (process.platform === 'darwin') return
  if (!win || win.isDestroyed()) return

  win.setTitleBarOverlay({ ...OVERLAY_COLORS[theme], height: TITLEBAR_HEIGHT })
}

/** 저장하고 적용한다. 화면이 되돌려받을 값이므로 저장된 값을 그대로 반환한다. */
export function setTheme(uow: UnitOfWork, theme: Theme, win?: BrowserWindow | null): Theme {
  uow.run((repos) => repos.settings.set(THEME_KEY, JSON.stringify(theme)))
  applyTheme(theme, win)
  return theme
}
