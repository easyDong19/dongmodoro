import { app } from 'electron'
import { createWindow } from './window'

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit() // 트레이 도입(M1 후반, app-shell PRD R29) 전까지는 창 닫기 = 종료
})
