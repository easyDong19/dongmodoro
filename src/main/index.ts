import { app } from 'electron'
import { createWindow } from './window'
import { registerSystemHandlers } from './ipc/system'

app.whenReady().then(() => {
  // 핸들러를 창보다 먼저 등록한다 — renderer 가 뜨자마자 호출해도 받을 사람이 있어야 한다.
  registerSystemHandlers(() => 0) // Task 4 에서 실제 스키마 버전이 연결된다
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit() // 트레이 도입(M1 후반, app-shell PRD R29) 전까지는 창 닫기 = 종료
})
