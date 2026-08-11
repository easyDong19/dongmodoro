import { useState } from 'react'
import type { Api } from '@shared/ipc/api'

type Panel = Extract<Awaited<ReturnType<Api['review']['getPending']>>, { needed: true }>
export type PendingRow = Panel['pending'][number]
export type SettleException = Parameters<Api['review']['settle']>[0]['exceptions'][number]

/** 화면의 3택. `carry` 는 기본값이라 전송되지 않는다. */
export type Choice = 'carry' | 'reduce' | 'drop'

/** 예외로 전송되는 것만 담는다. 기본 이월인 항목은 여기 없다. */
type Decision = { choice: Exclude<Choice, 'carry'>; estPomos: number }

/**
 * 이월 est = `max(1, 남은 몫)` (R14-1 · ADR-019 §1). 하한 1 은 남은 몫의 성질이 아니라
 * **이월 규칙**이다 — 이월한다는 것은 다음 주에도 계속한다는 뜻이므로 최소 1 을 계획한다.
 */
export function carryEstOf(row: PendingRow): number {
  return Math.max(1, row.remaining)
}

/** 축소의 기본 제안값 — 이월 est 의 절반(올림), `1 … 이월 est` 로 클램프 (R15). */
export function reduceDefault(row: PendingRow): number {
  const carryEst = carryEstOf(row)
  return Math.min(carryEst, Math.max(1, Math.ceil(carryEst / 2)))
}

/**
 * 3택 상태. **기본은 이월이고 예외만 담는다** (R12·R13) — 아무것도 건드리지 않고
 * 확정하면 남은 항목 전체가 이월된다.
 *
 * 상태를 항목 id 로 잡는 것이 `STALE_RANGE` 재렌더의 전제다 (ux-spec §8.1): 범위가
 * 달라져 목록이 바뀌어도 살아남은 행의 선택은 id 로 그대로 이어지고, 사라진 행의 선택은
 * 전송 시점에 자연히 빠진다. 사용자가 손댄 값을 조용히 버리지 않기 위한 배치다.
 */
export function useDecisions() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})

  const choiceOf = (row: PendingRow): Choice => decisions[row.id]?.choice ?? 'carry'

  /** 축소 스테퍼의 현재 값. 축소가 아니면 기본 제안값을 보여줄 자리가 없으므로 계산만 한다. */
  const reduceValueOf = (row: PendingRow): number =>
    decisions[row.id]?.estPomos ?? reduceDefault(row)

  const pick = (row: PendingRow, choice: Choice): void =>
    setDecisions((prev) => {
      if (choice === 'carry') {
        const { [row.id]: _dropped, ...rest } = prev
        return rest
      }
      return { ...prev, [row.id]: { choice, estPomos: reduceValueOf(row) } }
    })

  const setReduceValue = (row: PendingRow, estPomos: number): void =>
    setDecisions((prev) => ({ ...prev, [row.id]: { choice: 'reduce', estPomos } }))

  /**
   * 전송할 예외 목록. **지금 목록에 있는 항목만** 담는다 — 그 사이 사라진 항목의 예외는
   * 서버가 무시하지만(R29), 보내지 않는 편이 응답의 `ignoredExceptionIds` 를 실제 사고에만
   * 쓰게 해 준다.
   *
   * 축소 값은 여기서도 상한으로 자른다. 패널을 열어둔 채 세션이 돌면 남은 몫이 줄어드는데,
   * 서버도 같은 클램프를 하지만(규칙 4) 화면이 보낸 값과 실제가 다르면 그 사실이
   * `clampedExceptionIds` 로 돌아온다 — 화면이 먼저 맞추면 그 알림이 진짜 충돌에만 뜬다.
   */
  const exceptionsFor = (rows: readonly PendingRow[]): SettleException[] =>
    rows.flatMap((row): SettleException[] => {
      const decision = decisions[row.id]
      if (decision === undefined) return []
      if (decision.choice === 'drop') return [{ kind: 'drop', itemId: row.id }]
      return [
        {
          kind: 'carry_reduced',
          itemId: row.id,
          estPomos: Math.min(carryEstOf(row), Math.max(1, decision.estPomos))
        }
      ]
    })

  /** 확정 버튼 라벨의 `이월 뽀모 N` (ux-spec §7.1). 보내주기는 0 으로 센다. */
  const carriedPomosOf = (rows: readonly PendingRow[]): number =>
    rows.reduce((sum, row) => {
      const decision = decisions[row.id]
      if (decision?.choice === 'drop') return sum
      if (decision?.choice === 'reduce') {
        return sum + Math.min(carryEstOf(row), Math.max(1, decision.estPomos))
      }
      return sum + carryEstOf(row)
    }, 0)

  return { choiceOf, reduceValueOf, pick, setReduceValue, exceptionsFor, carriedPomosOf }
}
