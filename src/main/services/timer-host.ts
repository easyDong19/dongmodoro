import { Notification, powerMonitor } from 'electron'
import type { BrowserWindow } from 'electron'
import { localKeys, nowMs } from '@shared/time'
import { EVENT_CHANNELS } from '@shared/ipc/channels'
import { eventContracts } from '@shared/ipc/contracts'
import { sendEvent } from '../ipc/events'
import { globalBaseline, writeModeLength } from './baseline'
import type { UnitOfWork } from './ports'
import { recordSession } from './sessions'
import { TimerEngine } from './timer-engine'

/**
 * 타이머의 electron 접착부 — 실 시계·setTimeout·DB·이벤트·알림·powerMonitor 를
 * 엔진에 꽂는 유일한 곳이다. 엔진(timer-engine.ts)은 이 파일 없이는 아무 부수효과도
 * 일으키지 못하고, 이 파일은 상태 기계 규칙을 하나도 모른다.
 */
export function startTimerHost(
  uow: UnitOfWork,
  getWin: () => BrowserWindow | null
): { engine: TimerEngine; stop: () => void } {
  const engine = new TimerEngine({
    now: nowMs,
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),

    // 길이는 전역값 하나뿐이다 (ADR-029 §2) — 세션 시작·idle 진입 시점마다 새로 읽히므로
    // 저장 즉시 다음 세션부터 새 길이가 적용된다 (R1 · ADR-029 §1).
    getBaseline: () => uow.run(globalBaseline),
    // 조절이 곧 기준이다 (설계 R2) — 엔진이 조절을 처리하면서 이 함수로 저장한다.
    saveModeLength: (mode, minutes) => writeModeLength(uow, mode, minutes),
    getFocusCountToday: () =>
      uow.run((repos) => repos.sessions.countFocusOn(localKeys().localDate)),
    getFocusSinceLastLong: () => uow.run((repos) => repos.sessions.focusCountSinceLastLong()),
    getTaskTitle: (taskId) => uow.run((repos) => repos.tasks.titleOf(taskId)),

    onTransition: (snapshot) => {
      const win = getWin()
      if (win) {
        sendEvent(win, EVENT_CHANNELS.timerTransition, eventContracts.timerTransition, snapshot)
      }
    },

    // ADR-026 §2 불변식: 커밋(recordSession) → session:recorded → (엔진이 이어서)
    // timer:transition → notify. better-sqlite3 가 동기라 코드 순서가 곧 보장이다.
    onComplete: (record) => {
      const payload = recordSession(uow, {
        kind: record.mode,
        startedAtMs: record.startedAtMs,
        endedAtMs: record.endedAtMs,
        durationSec: record.durationSec,
        taskId: record.taskId
      })
      const win = getWin()
      if (win) {
        sendEvent(win, EVENT_CHANNELS.sessionRecorded, eventContracts.sessionRecorded, payload)
      }
      if (record.mode !== 'focus') return 'focus' // 휴식 완료 → 집중 idle (R10)
      // R10: 기록 후 계산 — 방금 INSERT 된 세션이 "마지막 long 이후 4회째"를 만든다.
      const count = uow.run((repos) => repos.sessions.focusCountSinceLastLong())
      return count % 4 === 0 ? 'long' : 'short'
    },

    // ux-spec §6. 클릭 핸들러를 달지 않는다 — 알림 클릭이 무엇도 자동 시작하지 않는다.
    notify: (completedMode) => {
      if (!Notification.isSupported()) return
      const title =
        completedMode === 'focus' ? '집중 완료 — 쉬어가요' : '휴식 끝 — 준비되면 시작하세요'
      new Notification({ title }).show()
    }
  })

  // setTimeout 은 잠자기 중 얼어붙는다 — resume 에서 wall-clock 으로 만기를 재검증한다
  // (ADR-005 §1, clock.ts 의 자정 보정과 같은 구도).
  const onResume = (): void => engine.reverify()
  powerMonitor.on('resume', onResume)

  return {
    engine,
    stop: () => powerMonitor.removeListener('resume', onResume)
  }
}
