import type { TimerMode } from '@shared/timer/snapshot'

/**
 * 세션이 끝났음을 **창 밖으로** 알리는 규칙 (timer ux-spec §6).
 *
 * electron 을 import 하지 않는다 — 알림·Dock·포커스 판정이 전부 주입이라 순수하게
 * 테스트된다. electron 접착은 timer-host.ts 한 곳이고, 이 파일은 그것이 Dock 인지
 * 작업표시줄인지 모른다 (timer-engine ↔ timer-host 와 같은 구도).
 *
 * 이 신호가 존재하는 이유는 **앱이 눈에 안 보일 때**다. 화면 전환과 소리만으로는
 * 다른 창 뒤에 있는 앱의 세션 종료를 놓친다.
 */

export type SessionSignalPorts = {
  /** OS 알림을 띄운다. 알림이 지원되지 않는 환경이면 호스트가 아무것도 하지 않는다. */
  notify: (title: string) => void
  /** 앱 창이 지금 사용자의 눈앞에 있는가. 창이 없으면 false. */
  isWindowFocused: () => boolean
  /**
   * 주의를 끄는 신호를 시작하고 **취소에 쓸 id** 를 돌려준다.
   * 지원하지 않는 플랫폼이면 `null` — 그쪽에서는 취소할 것도 없다.
   */
  bounce: (type: 'critical' | 'informational') => number | null
  cancelBounce: (id: number) => void
}

export type SessionSignals = {
  /** 세션 완료 — 엔진의 `notify` 자리에 꽂힌다. */
  signalCompletion: (completedMode: TimerMode) => void
  /** 창이 포커스됐다 — 사용자가 신호를 봤으므로 더 튀지 않는다. */
  onWindowFocus: () => void
}

/** ux-spec §6 이 소유하는 문구. 휴식은 short·long 을 구분하지 않는다. */
function titleFor(completedMode: TimerMode): string {
  return completedMode === 'focus' ? '집중 완료 — 쉬어가요' : '휴식 끝 — 준비되면 시작하세요'
}

export function createSessionSignals(ports: SessionSignalPorts): SessionSignals {
  /** 아직 튀고 있는 신호의 id. 취소했거나 시작하지 않았으면 null. */
  let pending: number | null = null

  function cancelPending(): void {
    if (pending === null) return
    ports.cancelBounce(pending)
    pending = null
  }

  return {
    signalCompletion: (completedMode) => {
      /**
       * 알림은 **포커스 여부와 무관하게 항상** 보낸다. 창을 보고 있어도 다른 카드를 읽는
       * 중이면 타이머 영역의 변화는 놓칠 수 있고, 알림 센터에 남은 기록이 "몇 시에
       * 끝났는지"를 나중에 알려준다.
       */
      ports.notify(titleFor(completedMode))

      /**
       * 반대로 주의를 끄는 신호는 **보고 있으면 소음이다.** `critical` 은 포커스할 때까지
       * 계속 튀므로, 포커스된 창 앞에서 시작하면 아무도 멈추지 않는 상태가 된다.
       */
      if (ports.isWindowFocused()) return

      /**
       * `informational` 은 한 번만 튀고 끝난다 — 그 순간 화면을 안 보고 있으면 놓치므로,
       * "놓치는 것"을 풀려고 만든 신호가 같은 이유로 놓쳐진다. 그래서 `critical` 이다.
       *
       * 집중 완료와 휴식 완료를 같은 강도로 다룬다. 어느 쪽을 놓쳐도 아프고 방향만
       * 다르다 — 집중을 놓치면 쉬어야 할 때 계속 붙어 있고, 휴식을 놓치면 5분 자리에서
       * 그보다 훨씬 긴 시간을 흘린다.
       */
      cancelPending() // 앞 세션의 신호가 남아 있으면 겹치지 않게 정리한다
      pending = ports.bounce('critical')
    },

    onWindowFocus: cancelPending
  }
}
