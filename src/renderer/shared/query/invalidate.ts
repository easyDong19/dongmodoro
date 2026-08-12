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
      type: 'settled'
      /** 확정 응답이 실어 보낸 주 키 그대로. renderer 가 범위를 다시 계산하지 않는다. */
      payload: { weeks: readonly string[]; targetWeek: string }
      currentDayKey: string
    }
  | {
      /**
       * 확정이 `STALE_RANGE` 로 거절됐다. 아무것도 저장되지 않았지만 **화면이 보던 범위가
       * 실제와 다르다**는 사실이 밝혀졌으므로 판정과 패널을 다시 읽는다 (ux-spec §8).
       */
      type: 'review-stale'
      currentDayKey: string
    }
  | {
      type: 'clock-boundary'
      payload: ClockBoundary
      previous: ClockBoundary
      currentDayKey: string
    } // 사건 12
  /**
   * 테마 선택이 바뀌었다. **`currentDayKey` 를 갖지 않는 유일한 사건이다** — 표시 설정은
   * 어떤 달력 키에도 매이지 않으므로 들고 다닐 이유가 없다.
   *
   * 화면 색은 이 무효화를 기다리지 않는다. main 이 `nativeTheme.themeSource` 를 바꾸는
   * 순간 CSS 가 이미 따라오고(design-system ADR-010 §3), 여기서 무효화하는 것은
   * **토글 버튼이 어느 쪽을 눌린 상태로 그릴지**뿐이다.
   */
  | { type: 'theme-changed' }
  /**
   * 전역 분모(길이 3종·가용량)가 바뀌었다. 테마와 마찬가지로 `currentDayKey` 를 갖지 않는다.
   *
   * **주간 카드는 대상이 아니다.** 카드는 그 주 `weeks` 스냅샷을 읽고, 이 편집은 스냅샷을
   * 건드리지 않는다 (pomo-baseline R19·R22). 넣으면 아무것도 안 바뀌는 재조회가 생기고,
   * 그 재조회가 다음 사람에게 "베이스라인이 주간 카드를 바꾼다"는 오해를 심는다.
   *
   * **타이머도 대상이 아니다.** 엔진의 `durationSec` 은 쿼리에서 파생되는 값이 아니라
   * 시작·리셋 시점에 확정되는 엔진 상태다. 새 길이는 다음 세션이 시작될 때 엔진이 스스로
   * 다시 읽는다 (timer R1) — 재조회로는 앞당길 수 없고, 앞당기는 것이 옳지도 않다.
   */
  | { type: 'baseline-changed' }
  /**
   * 마일스톤이 추가·수정·완료·보관·삭제·복사됐다. `currentDayKey` 를 갖지 않는다 —
   * 대상 달을 payload 가 이미 들고 있고, 카드가 한 달만 그리므로 화면이 그 달을 안다.
   *
   * **캘린더는 대상이 아니다.** 마일스톤은 점에 영향을 주지 않으므로, 넣으면 아무것도
   * 안 바뀌는 재조회가 생기고 그 재조회가 "마일스톤이 캘린더를 바꾼다"는 오해를 심는다.
   */
  | { type: 'milestone-changed'; payload: { month: string } }

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
    case 'settled':
      /**
       * 확정 하나가 네 레이어를 건드린다 (technical-spec 캐시 무효화 표):
       * 범위의 주들은 `settled_at`·스냅샷이 생기고, 계획 대상 주에는 이월 항목이 들어오며,
       * 미완료 조각의 소속 항목이 바뀌어 오늘 목록의 표시가 달라지고, 워터마크 전진으로
       * 배너가 사라진다. 마일스톤은 이월이 `milestone_id` 를 승계하므로 광역으로 턴다 —
       * 전용 쿼리가 아직 없어 활성 구독은 0 이다.
       *
       * 드로어·플래너 초안은 적지 않는다. 두 키가 `keys.week(w)` 의 하위라 접두사로 함께
       * 잡힌다. 반대 방향은 성립하지 않는다 — 긴 키로 짧은 키를 잡을 수 없다.
       */
      return [
        ...e.payload.weeks.map((w) => keys.week(w)),
        keys.week(e.payload.targetWeek),
        keys.today(e.currentDayKey),
        keys.monthAll(),
        keys.reviewPending()
      ]
    case 'review-stale':
      // 패널 키가 이 키의 하위라 접두사로 함께 잡힌다 (keys.ts) — 배너와 패널이 같은
      // 재판정 결과를 본다.
      return [keys.reviewPending()]
    case 'clock-boundary': {
      const out: (readonly string[])[] = [keys.todayAll(), keys.reviewPending()]
      if (e.payload.weekKey !== e.previous.weekKey) out.push(keys.weekAll())
      if (e.payload.monthKey !== e.previous.monthKey) out.push(keys.monthAll())
      return out
    }
    /**
     * 설정 키 하나뿐이다. 다른 레이어를 건드리지 않는 유일한 사건이며, 그것이 테마가
     * 표시 설정이라는 사실의 코드상 표현이다 — 어떤 집계도 테마에 의존하지 않는다.
     */
    case 'theme-changed':
      return [keys.settings()]
    /**
     * 설정 자신과 정산 패널 둘뿐이다. 패널이 포함되는 이유는 그것이 **현재 길이를 사실로
     * 표시하는 유일한 화면**이기 때문이고 (weekly-review ux-spec §6), 그 표시가 저장 직후
     * 옛 숫자로 남아 있으면 사용자는 저장이 실패했다고 읽는다.
     */
    case 'baseline-changed':
      return [keys.baseline(), keys.reviewPending()]
    case 'milestone-changed':
      return [keys.monthMilestones(e.payload.month)]
  }
}

/** 초크포인트 — renderer 에서 invalidateQueries 를 부르는 유일한 곳 (ADR-025 §3·§5). */
export function dispatchInvalidation(qc: QueryClient, e: InvalidationEvent): void {
  for (const queryKey of keysToInvalidate(e)) void qc.invalidateQueries({ queryKey })
}
