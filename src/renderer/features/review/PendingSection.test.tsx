// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PendingSection } from './PendingSection'
import { useDecisions, type PendingRow } from './useDecisions'

function row(over: Partial<PendingRow> & { id: string }): PendingRow {
  return {
    week: '2026-08-17',
    title: over.id,
    estPomos: 5,
    spentPomos: 0,
    remaining: 5,
    carryWeeks: 1,
    ...over
  }
}

/** 상태는 훅이 갖는다 — 테스트도 실제 배선과 같은 경로를 지나야 한다. */
function Host({ rows, merged = false }: { rows: PendingRow[]; merged?: boolean }) {
  const d = useDecisions()
  return (
    <>
      <PendingSection
        rows={rows}
        merged={merged}
        choiceOf={d.choiceOf}
        reduceValueOf={d.reduceValueOf}
        onPick={d.pick}
        onReduce={d.setReduceValue}
      />
      <output data-testid="exceptions">{JSON.stringify(d.exceptionsFor(rows))}</output>
      <output data-testid="carried">{d.carriedPomosOf(rows)}</output>
    </>
  )
}

const exceptions = () => JSON.parse(screen.getByTestId('exceptions').textContent ?? '[]')
const carried = () => Number(screen.getByTestId('carried').textContent)
/** 행의 제목은 첫 span 이다 — 배지·주 라벨이 뒤에 붙으므로 문자열 자르기로 읽지 않는다. */
const titleOf = (rowEl: HTMLElement) => rowEl.querySelector('span')?.textContent ?? ''
const titlesInOrder = () => screen.getAllByTestId('pending-row').map(titleOf)
const rowByTitle = (title: string) =>
  screen.getAllByTestId('pending-row').find((el) => titleOf(el) === title)!

describe('PendingSection — 기본 선택과 전송 (R12·R13 · A7)', () => {
  it('모든 항목의 기본 선택이 다음 주로다', () => {
    render(<Host rows={[row({ id: 'a' }), row({ id: 'b' })]} />)
    for (const el of screen.getAllByRole('button', { name: '다음 주로' })) {
      expect(el).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('아무것도 건드리지 않으면 예외가 빈 배열이다', () => {
    render(<Host rows={[row({ id: 'a' }), row({ id: 'b' })]} />)
    expect(exceptions()).toEqual([])
  })

  it('보내주기를 고르면 그 항목만 예외로 나간다', async () => {
    render(<Host rows={[row({ id: 'a' }), row({ id: 'b' })]} />)
    await userEvent.click(within(rowByTitle('a')).getByRole('button', { name: '보내주기' }))
    expect(exceptions()).toEqual([{ kind: 'drop', itemId: 'a' }])
  })

  it('다시 다음 주로 돌리면 예외에서 빠진다 — 기본은 전송되지 않는다', async () => {
    render(<Host rows={[row({ id: 'a' })]} />)
    await userEvent.click(screen.getByRole('button', { name: '보내주기' }))
    await userEvent.click(screen.getByRole('button', { name: '다음 주로' }))
    expect(exceptions()).toEqual([])
  })
})

describe('PendingSection — 축소 스테퍼 (R15 · A10 · §5.3)', () => {
  it('줄여서를 고르면 스테퍼가 나오고 기본값이 이월 est 의 절반(올림)이다', async () => {
    render(<Host rows={[row({ id: 'a', remaining: 5 })]} />)
    await userEvent.click(screen.getByRole('button', { name: '줄여서' }))
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('3')
    expect(exceptions()).toEqual([{ kind: 'carry_reduced', itemId: 'a', estPomos: 3 }])
  })

  it('하한 1 아래로 내려가지 않고 그 버튼만 비활성된다', async () => {
    render(<Host rows={[row({ id: 'a', remaining: 1 })]} />)
    await userEvent.click(screen.getByRole('button', { name: '줄여서' }))
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /줄이기/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /늘리기/ })).toBeDisabled() // 상한도 1 이다
  })

  it('이월 est 를 넘지 않는다', async () => {
    render(<Host rows={[row({ id: 'a', remaining: 4 })]} />)
    await userEvent.click(screen.getByRole('button', { name: '줄여서' }))
    await userEvent.click(screen.getByRole('button', { name: /늘리기/ }))
    await userEvent.click(screen.getByRole('button', { name: /늘리기/ }))
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('4')
    expect(screen.getByRole('button', { name: /늘리기/ })).toBeDisabled()
  })

  it('A9 — 남은 몫이 0 이어도 이월 est 는 1 이라 스테퍼가 1 에서 잠긴다', async () => {
    render(<Host rows={[row({ id: 'a', estPomos: 2, spentPomos: 5, remaining: 0 })]} />)
    expect(carried()).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: '줄여서' }))
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('1')
  })

  it('경고 문구를 붙이지 않는다 — 줄이는 것은 실패가 아니다', async () => {
    const { container } = render(<Host rows={[row({ id: 'a' })]} />)
    await userEvent.click(screen.getByRole('button', { name: '줄여서' }))
    for (const word of ['경고', '주의', '무리']) {
      expect(container.textContent).not.toContain(word)
    }
  })
})

describe('PendingSection — 정렬과 머리말 (R34 · A26)', () => {
  it('3주 이상 넘어온 항목이 위로 오고 건수가 사실로 적힌다', () => {
    render(
      <Host
        rows={[
          row({ id: 'new', carryWeeks: 1 }),
          row({ id: 'old', carryWeeks: 4 }),
          row({ id: 'older', carryWeeks: 3 })
        ]}
      />
    )
    expect(screen.getByText('3주 이상 넘어온 항목 2건')).toBeInTheDocument()
    expect(titlesInOrder()).toEqual(['old', 'older', 'new'])
  })

  it('그래도 기본 선택은 이월이다 — 클릭 1회 확정이 깨지지 않는다', () => {
    render(<Host rows={[row({ id: 'old', carryWeeks: 5 })]} />)
    expect(screen.getByRole('button', { name: '다음 주로' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('3주 이상이 없으면 머리말을 적지 않는다', () => {
    render(<Host rows={[row({ id: 'a', carryWeeks: 2 })]} />)
    expect(screen.queryByText(/3주 이상/)).not.toBeInTheDocument()
  })

  it('같은 주차면 오래된 주가 먼저 온다', () => {
    render(
      <Host
        rows={[
          row({ id: 'later', week: '2026-08-24', carryWeeks: 2 }),
          row({ id: 'earlier', week: '2026-08-17', carryWeeks: 2 })
        ]}
      />
    )
    expect(titlesInOrder()[0]).toBe('earlier')
  })

  it('넘어갈 항목이 0건이면 3택 대신 한 줄만 남는다 (§8)', () => {
    render(<Host rows={[]} />)
    expect(screen.getByText('넘어갈 항목이 없어요 — 이번 주를 마감할까요')).toBeInTheDocument()
    expect(screen.queryAllByTestId('pending-row')).toHaveLength(0)
  })
})

describe('PendingSection — 행 구성과 시각 규칙 (§5.1·§5.2)', () => {
  it('이월 배지는 N ≥ 2 일 때만 나오고 색으로 강조하지 않는다', () => {
    render(<Host rows={[row({ id: 'a', carryWeeks: 1 }), row({ id: 'b', carryWeeks: 3 })]} />)
    expect(screen.queryByText('1주째')).not.toBeInTheDocument()
    const badge = screen.getByText('3주째')
    expect(badge.className).toMatch(/ink-dim/)
    expect(badge.className).not.toMatch(/amber|teal|danger/)
  })

  it('출처 주 라벨은 범위가 2주 이상일 때만 붙는다', () => {
    const { rerender } = render(<Host rows={[row({ id: 'a', week: '2026-08-17' })]} />)
    expect(screen.queryByText('8/17')).not.toBeInTheDocument()

    rerender(<Host rows={[row({ id: 'a', week: '2026-08-17' })]} merged />)
    expect(screen.getByText('8/17')).toBeInTheDocument()
  })

  it('선택 상태에 배경뿐 아니라 보더가 있다 (design-system ADR-006 §3)', () => {
    render(<Host rows={[row({ id: 'a' })]} />)
    const selected = screen.getByRole('button', { name: '다음 주로' })
    expect(selected.className).toMatch(/border-control-border/)
    expect(selected.className).toMatch(/bg-glass-strong/)
  })

  it('보내주기의 --danger 는 아이콘에만 붙고 라벨은 --ink 다 (ADR-003 §5)', () => {
    render(<Host rows={[row({ id: 'a' })]} />)
    const button = screen.getByRole('button', { name: '보내주기' })
    expect(button.className).not.toMatch(/danger/)
    expect(button.querySelector('svg')?.getAttribute('class')).toMatch(/text-danger/)
  })

  it('보내주기를 고르면 행 제목이 흐려진다', async () => {
    render(<Host rows={[row({ id: 'a' })]} />)
    await userEvent.click(screen.getByRole('button', { name: '보내주기' }))
    expect(screen.getByText('a').className).toMatch(/ink-faint/)
  })

  it('버리기·삭제 워딩을 쓰지 않는다', () => {
    const { container } = render(<Host rows={[row({ id: 'a' })]} />)
    for (const word of ['버리기', '삭제', '정리하세요']) {
      expect(container.textContent).not.toContain(word)
    }
  })

  it('조작 타깃이 --target-min 하한을 갖는다 (principles §7)', () => {
    render(<Host rows={[row({ id: 'a' })]} />)
    expect(screen.getByRole('button', { name: '다음 주로' }).className).toMatch(/target-min/)
  })
})

describe('useDecisions — 이월 뽀모 합 (ux-spec §7.1)', () => {
  it('기본은 이월 est 의 합이다', () => {
    render(<Host rows={[row({ id: 'a', remaining: 3 }), row({ id: 'b', remaining: 2 })]} />)
    expect(carried()).toBe(5)
  })

  it('보내주기는 0 으로 세고 축소는 자른 값으로 센다', async () => {
    render(<Host rows={[row({ id: 'a', remaining: 3 }), row({ id: 'b', remaining: 4 })]} />)
    await userEvent.click(within(rowByTitle('a')).getByRole('button', { name: '보내주기' }))
    await userEvent.click(within(rowByTitle('b')).getByRole('button', { name: '줄여서' }))
    expect(carried()).toBe(2) // b 의 기본 축소값 ceil(4/2)
  })
})
