import { BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import type { Theme } from '@shared/ipc/contracts'
import { OVERLAY_COLORS, TITLEBAR_HEIGHT } from './services/theme-colors'

/**
 * `shouldConfirmClose` 는 종료 확인 조건(timer R13 — focus 가 running/paused)의
 * 판정 함수다. M2 는 트레이가 없으므로 창 닫기 = 종료 요청이고, 모든 종료 경로가
 * 이 close 이벤트 하나를 지난다 (app-shell 소관의 경로 열거는 트레이 도입 때).
 *
 * `theme` 를 인자로 받는 이유는 **창이 만들어지는 시점에 이미 필요하기 때문**이다 —
 * Windows·Linux 의 `titleBarOverlay` 색은 생성 옵션이라 나중에 고칠 수는 있어도 처음 한 번은
 * 값이 있어야 하고, 그것이 없으면 첫 프레임에 시스템 기본색 창 컨트롤이 한 번 그려진다.
 * main/index.ts 가 창보다 먼저 테마를 읽는 순서가 이 인자를 가능하게 한다.
 */
export function createWindow(
  theme: Theme,
  shouldConfirmClose: () => boolean = () => false
): BrowserWindow {
  /**
   * 창 컨트롤은 **OS 가 그린다** (app-shell ux-spec §1.1 — 놓이는 변은 OS 관용구를 따른다).
   * 직접 그리지 않으므로 플랫폼별 관용구·접근성·고대비 대응을 공짜로 얻는다.
   *
   * - macOS: `hiddenInset` 이 트래픽 라이트를 남기고 콘텐츠를 상단까지 넓힌다. 색은
   *   `nativeTheme.themeSource` 를 따라 OS 가 알아서 바꾸므로 우리가 지정하지 않는다.
   * - Windows·Linux: `hidden` + `titleBarOverlay` 로 OS 가 우측에 컨트롤을 그리고,
   *   **색은 우리가 준다** (그쪽은 CSS 를 따라오지 않는다 — services/theme-colors.ts).
   *
   * macOS 에서도 `titleBarOverlay` 를 켜는 이유는 색 때문이 아니라 **CSS 환경 변수**
   * (`env(titlebar-area-*)`) 때문이다. 그 값으로 타이틀바가 컨트롤 폭을 런타임에 비켜 가므로
   * 플랫폼별 상수를 박지 않아도 된다. 활성화되지 않는 환경을 대비해 CSS 쪽에 폴백을 함께
   * 둔다 (global.css `.titlebar`).
   */
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isMac ? true : { ...OVERLAY_COLORS[theme], height: TITLEBAR_HEIGHT },
    // 38px 바의 세로 중앙에 맞춘 값이다(트래픽 라이트 지름 ≈14px). 계산으로 떨어지지
    // 않아 눈으로 재서 넣었다 — 바 높이를 바꾸면 여기도 같이 봐야 한다.
    ...(isMac ? { trafficLightPosition: { x: 13, y: 12 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'), // CJS 강제 — electron.vite.config.ts 참조
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 종료 확인 (ux-spec §7): focus running/paused 에서만 1회 묻고, 그 외에는 즉시 종료.
  // `--danger` 없음 — 세션 하나가 안 남을 뿐 데이터를 없애는 게 아니다 (principles §2).
  win.on('close', (event) => {
    if (!shouldConfirmClose()) return
    // macOS 는 title 을 렌더하지 않는다 — 제목을 message(헤드라인)에, 본문을 detail 에
    // 놓아야 ux-spec §7 의 제목/본문이 둘 다 보인다. title 은 타 플랫폼용으로 함께 준다.
    const choice = dialog.showMessageBoxSync(win, {
      title: '지금 종료할까요?',
      message: '지금 종료할까요?',
      detail: '종료하면 진행 중인 이 세션은 기록되지 않아요.',
      buttons: ['계속 집중', '종료'],
      defaultId: 0,
      cancelId: 0
    })
    if (choice === 0) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
