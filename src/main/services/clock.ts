import type { BrowserWindow } from 'electron'
import { powerMonitor } from 'electron'
import { calendarKeys, nowMs, startOfNextLocalDayMs } from '@shared/time'
import { EVENT_CHANNELS } from '@shared/ipc/channels'
import { eventContracts, type ClockBoundary } from '@shared/ipc/contracts'
import { sendEvent } from '../ipc/events'

/** 순수 계산: 주어진 순간에서 다음 자정(로컬)까지 남은 ms. */
export function msUntilNextMidnight(atEpochMs: number): number {
  return startOfNextLocalDayMs(atEpochMs) - atEpochMs
}

/** 순수 계산: 경계 전이 후 시각에서 만드는 이벤트 payload (한 번의 시계 읽기, ADR-022 §1). */
export function boundaryPayload(atEpochMs: number): ClockBoundary {
  return calendarKeys(atEpochMs)
}

/** 순수 계산: 마지막 발화 날짜 키와 지금 시각을 비교해 자정을 건넜는지 판정한다. */
export function crossedBoundary(lastFiredDayKey: string, atEpochMs: number): boolean {
  return calendarKeys(atEpochMs).dayKey !== lastFiredDayKey
}

/**
 * 자정 정각 알람 1개 + powerMonitor resume 보정 (ADR-026 §1).
 * 매분 tick 이 아니다 — 사실이 바뀌는 순간(날짜 전이)에만 이벤트를 보낸다 (ADR-005 의 원칙).
 * setTimeout 은 잠자기 중 얼어붙으므로 resume 에서 crossedBoundary 로 보정 발사한다.
 * 이 보정을 빼먹으면 "덮개 닫고 아침에 열었더니 어제 목록"이 된다 (ADR-026 Consequences).
 */
export function startClock(getWin: () => BrowserWindow | null): () => void {
  let lastFiredDayKey = calendarKeys(nowMs()).dayKey
  let timer: ReturnType<typeof setTimeout> | undefined

  function fire(): void {
    const at = nowMs()
    lastFiredDayKey = calendarKeys(at).dayKey
    const win = getWin()
    if (win) {
      sendEvent(
        win,
        EVENT_CHANNELS.clockBoundary,
        eventContracts.clockBoundary,
        boundaryPayload(at)
      )
    }
    schedule()
  }

  function schedule(): void {
    timer = setTimeout(fire, msUntilNextMidnight(nowMs()))
  }

  function onResume(): void {
    if (crossedBoundary(lastFiredDayKey, nowMs())) {
      clearTimeout(timer)
      fire()
    }
  }

  schedule()
  powerMonitor.on('resume', onResume)

  return () => {
    clearTimeout(timer)
    powerMonitor.removeListener('resume', onResume)
  }
}
