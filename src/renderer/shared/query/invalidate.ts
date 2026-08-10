import type { QueryClient } from '@tanstack/react-query'
import type { ClockBoundary, SessionRecorded } from '@shared/ipc/contracts'
import { keys } from './keys'

/**
 * ADR-025 §3 표의 M2 사건들 (사건 1·3·4·5 + 12 + 사후 캡처 2). 사건마다 currentDayKey 를
 * 함께 들고 다닌다 — "오늘이 언제인지"는 useClock()/clock 캐시에서만 오고, 이 함수 안에서
 * 다시 계산하지 않는다 (ADR-025 §1-2, 시간 초크포인트).
 */
export type InvalidationEvent =
  | { type: 'session-recorded'; payload: SessionRecorded; currentDayKey: string }
  | {
      type: 'capture-recorded'
      payload: { localDate: string; localWeek: string }
      currentDayKey: string
    }
  | { type: 'pull-changed'; payload: { itemWeek: string }; currentDayKey: string } // 사건 3·4
  | { type: 'task-toggled'; payload: { parentWeek: string }; currentDayKey: string } // 사건 5
  | { type: 'plan-confirmed'; payload: { week: string }; currentDayKey: string }
  | { type: 'item-changed'; payload: { itemWeek: string }; currentDayKey: string }
  | {
      type: 'clock-boundary'
      payload: ClockBoundary
      previous: ClockBoundary
      currentDayKey: string
    } // 사건 12

/**
 * 사건 → 무효화할 쿼리 키 목록의 순수 계산 (ADR-025 §3). QueryClient 를 몰라야 단위
 * 테스트가 가능하다 — 부수효과는 dispatchInvalidation 이 담당한다.
 *
 * `monthKey(localDate)` 파생은 payload 문자열 slice 로 한다 — 시간 계산이 아니라
 * 문자열 구조 파생이므로 시간 초크포인트 위반이 아니다.
 */
export function keysToInvalidate(e: InvalidationEvent): readonly (readonly string[])[] {
  switch (e.type) {
    case 'session-recorded': {
      const { localDate, localWeek } = e.payload
      const todayKey = localDate !== e.currentDayKey ? keys.todayAll() : keys.today(localDate)
      return [
        todayKey,
        keys.day(localDate),
        keys.week(localWeek),
        keys.monthCalendar(localDate.slice(0, 7)),
        keys.monthAll() // milestones 광역 — 마일스톤 쿼리가 아직 없어 prefix 로 표기 (활성 구독 0)
      ]
    }
    case 'capture-recorded': {
      const { localDate, localWeek } = e.payload
      return [keys.week(localWeek), keys.day(localDate), keys.monthAll()]
    }
    case 'pull-changed': {
      return [
        keys.today(e.currentDayKey),
        keys.day(e.currentDayKey),
        keys.week(e.payload.itemWeek),
        keys.monthCalendar(e.currentDayKey.slice(0, 7))
      ]
    }
    case 'task-toggled': {
      return [
        keys.today(e.currentDayKey),
        keys.dayAll(),
        keys.week(e.payload.parentWeek),
        keys.monthAll()
      ]
    }
    case 'plan-confirmed':
      // 항목이 늘거나 폐기되면 그 주 카드와, 그 항목에서 pull 해둔 오늘 목록이 함께 변한다.
      // 확정 주가 오늘 주가 아니어도 오늘을 무효화한다 — 판정 비용이 재조회 비용보다 크다.
      return [keys.week(e.payload.week), keys.today(e.currentDayKey)]
    case 'item-changed':
      // 완료·완료 해제·폐기·pull 이 모두 이 갈래다 — 바뀌는 캐시 집합이 같다.
      return [keys.week(e.payload.itemWeek), keys.today(e.currentDayKey)]
    case 'clock-boundary': {
      const out: (readonly string[])[] = [keys.todayAll(), keys.reviewPending()]
      if (e.payload.weekKey !== e.previous.weekKey) out.push(keys.weekAll())
      if (e.payload.monthKey !== e.previous.monthKey) out.push(keys.monthAll())
      return out
    }
  }
}

/** 초크포인트 — renderer 에서 invalidateQueries 를 부르는 유일한 곳 (ADR-025 §3·§5). */
export function dispatchInvalidation(qc: QueryClient, e: InvalidationEvent): void {
  for (const queryKey of keysToInvalidate(e)) void qc.invalidateQueries({ queryKey })
}
