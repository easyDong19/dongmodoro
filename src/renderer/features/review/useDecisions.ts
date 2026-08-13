import { useState } from 'react'
import type { Api } from '@shared/ipc/api'

type Panel = Extract<Awaited<ReturnType<Api['review']['getPending']>>, { needed: true }>
export type PendingRow = Panel['pending'][number]
export type SettleException = Parameters<Api['review']['settle']>[0]['exceptions'][number]

/**
 * 화면의 2택 (ADR-031 §1). `carry` 는 기본값이라 전송되지 않는다.
 *
 * `reduce` 가 없다 — 줄일 대상이던 est 가 사라졌고, 시간으로 대체하지 않는다. 이월
 * 항목의 측정 시간은 정의상 0(아직 하지 않은 일)이라 "줄인다"가 성립하지 않는다.
 */
export type Choice = 'carry' | 'drop'

/**
 * 2택 상태. **기본은 이월이고 예외만 담는다** (R12·R13) — 아무것도 건드리지 않고
 * 확정하면 남은 항목 전체가 이월된다.
 *
 * 상태를 항목 id 로 잡는 것이 `STALE_RANGE` 재렌더의 전제다 (ux-spec §8.1): 범위가
 * 달라져 목록이 바뀌어도 살아남은 행의 선택은 id 로 그대로 이어지고, 사라진 행의 선택은
 * 전송 시점에 자연히 빠진다. 사용자가 손댄 값을 조용히 버리지 않기 위한 배치다.
 *
 * 선택이 boolean 이 아니라 집합인 이유도 그것이다 — `보내주기` 를 고른 id 만 담는다.
 */
export function useDecisions() {
  const [drops, setDrops] = useState<ReadonlySet<string>>(() => new Set())

  const choiceOf = (row: PendingRow): Choice => (drops.has(row.id) ? 'drop' : 'carry')

  const pick = (row: PendingRow, choice: Choice): void =>
    setDrops((prev) => {
      const next = new Set(prev)
      if (choice === 'drop') next.add(row.id)
      else next.delete(row.id)
      return next
    })

  /**
   * 전송할 예외 목록. **지금 목록에 있는 항목만** 담는다 — 그 사이 사라진 항목의 예외는
   * 서버가 무시하지만(R29), 보내지 않는 편이 응답의 `ignoredExceptionIds` 를 실제 사고에만
   * 쓰게 해 준다.
   */
  const exceptionsFor = (rows: readonly PendingRow[]): SettleException[] =>
    rows.filter((row) => drops.has(row.id)).map((row) => ({ kind: 'drop', itemId: row.id }))

  /**
   * 확정 버튼의 `이월 N건` (ux-spec §7.1). **건수다** — 이월 규모를 시간으로 말할 수
   * 없기 때문이다 (ADR-031 §1): 이월 항목의 측정 시간은 0 이라 합이 언제나 `0분` 이 된다.
   */
  const carriedCountOf = (rows: readonly PendingRow[]): number =>
    rows.filter((row) => !drops.has(row.id)).length

  return { choiceOf, pick, exceptionsFor, carriedCountOf }
}
