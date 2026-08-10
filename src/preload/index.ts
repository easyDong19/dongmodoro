import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, EVENT_CHANNELS } from '@shared/ipc/channels'
import type { Api } from '@shared/ipc/api'

/**
 * main → renderer 이벤트 구독 헬퍼 (ADR-026 §4). 해제 함수를 반환하고,
 * 콜백에는 Electron `event` 를 넘기지 않는다. 수신 직후 parse 는 preload 가 아니라
 * renderer 리스너(Task 2 의 events.ts)가 한다 — preload 는 통로만 제공한다.
 */
function on(channel: string): (cb: (payload: unknown) => void) => () => void {
  return (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

/**
 * 화이트리스트 (ADR-007 §3). raw ipcRenderer 를 절대 노출하지 않는다 —
 * 노출하면 renderer 가 임의 채널을 호출할 수 있어 계약이 무의미해진다.
 * 채널 하나당 여기 한 줄씩 늘어나는 것이 곧 "무엇이 열려 있는지"의 목록이다.
 *
 * `: Api` 를 붙여 계약이 요구하는 표면을 다 구현했는지 컴파일러가 검사하게 한다.
 */
const api: Api = {
  system: {
    getAppInfo: () => ipcRenderer.invoke(CHANNELS.system.getAppInfo)
  },
  clock: {
    now: () => ipcRenderer.invoke(CHANNELS.clock.now)
  },
  today: {
    list: () => ipcRenderer.invoke(CHANNELS.today.list),
    addDirect: (title) => ipcRenderer.invoke(CHANNELS.today.addDirect, title),
    pull: (taskId) => ipcRenderer.invoke(CHANNELS.today.pull, taskId),
    remove: (taskId) => ipcRenderer.invoke(CHANNELS.today.remove, taskId),
    toggleComplete: (taskId) => ipcRenderer.invoke(CHANNELS.today.toggleComplete, taskId)
  },
  timer: {
    getState: () => ipcRenderer.invoke(CHANNELS.timer.getState),
    start: () => ipcRenderer.invoke(CHANNELS.timer.start),
    startWithTask: (taskId) => ipcRenderer.invoke(CHANNELS.timer.startWithTask, taskId),
    pause: () => ipcRenderer.invoke(CHANNELS.timer.pause),
    resume: () => ipcRenderer.invoke(CHANNELS.timer.resume),
    reset: () => ipcRenderer.invoke(CHANNELS.timer.reset),
    adjust: (deltaMin) => ipcRenderer.invoke(CHANNELS.timer.adjust, deltaMin),
    completeEarly: () => ipcRenderer.invoke(CHANNELS.timer.completeEarly),
    setMode: (mode) => ipcRenderer.invoke(CHANNELS.timer.setMode, mode)
  },
  sessions: {
    capture: (sessionId, title) => ipcRenderer.invoke(CHANNELS.sessions.capture, sessionId, title)
  },
  week: {
    summary: (week) => ipcRenderer.invoke(CHANNELS.week.summary, week),
    planDraft: (week) => ipcRenderer.invoke(CHANNELS.week.planDraft, week),
    confirmPlan: (input) => ipcRenderer.invoke(CHANNELS.week.confirmPlan, input),
    drawer: (weekItemId) => ipcRenderer.invoke(CHANNELS.week.drawer, weekItemId),
    pullNext: (weekItemId) => ipcRenderer.invoke(CHANNELS.week.pullNext, weekItemId),
    pullFromDrawer: (input) => ipcRenderer.invoke(CHANNELS.week.pullFromDrawer, input),
    complete: (weekItemId) => ipcRenderer.invoke(CHANNELS.week.complete, weekItemId),
    uncomplete: (weekItemId) => ipcRenderer.invoke(CHANNELS.week.uncomplete, weekItemId),
    drop: (weekItemId) => ipcRenderer.invoke(CHANNELS.week.drop, weekItemId)
  },
  review: {
    getStatus: () => ipcRenderer.invoke(CHANNELS.review.getStatus),
    getPending: () => ipcRenderer.invoke(CHANNELS.review.getPending)
  },
  events: {
    onTimerTransition: on(EVENT_CHANNELS.timerTransition),
    onSessionRecorded: on(EVENT_CHANNELS.sessionRecorded),
    onClockBoundary: on(EVENT_CHANNELS.clockBoundary)
  }
}

contextBridge.exposeInMainWorld('api', api)
