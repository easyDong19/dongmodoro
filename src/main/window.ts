import { BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'

/**
 * `shouldConfirmClose` 는 종료 확인 조건(timer R13 — focus 가 running/paused)의
 * 판정 함수다. M2 는 트레이가 없으므로 창 닫기 = 종료 요청이고, 모든 종료 경로가
 * 이 close 이벤트 하나를 지난다 (app-shell 소관의 경로 열거는 트레이 도입 때).
 */
export function createWindow(shouldConfirmClose: () => boolean = () => false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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
