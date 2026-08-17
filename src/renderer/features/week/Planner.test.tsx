// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/ipc/api'
import { Planner } from './Planner'

type Draft = Awaited<ReturnType<Api['week']['planDraft']>>

const WEEK = '2026-08-03'
const NEXT_WEEK = '2026-08-10'

function makeDraft(over: Partial<Draft> = {}): Draft {
  return { week: WEEK, items: [], ...over }
}

function renderPlanner(
  over: Partial<Draft> = {},
  handlers: {
    onConfirm?: (i: unknown) => void
    onCancel?: () => void
    onChangeWeek?: (next: 'current' | 'next') => void
  } = {},
  target: 'current' | 'next' = 'current'
) {
  return render(
    <Planner
      draft={makeDraft(over)}
      week={target === 'current' ? WEEK : NEXT_WEEK}
      target={target}
      onChangeWeek={handlers.onChangeWeek ?? vi.fn()}
      onConfirm={handlers.onConfirm ?? vi.fn()}
      onCancel={handlers.onCancel ?? vi.fn()}
    />
  )
}

const titleInput = () => screen.getByLabelText('Sprint 제목')
const addButton = () => screen.getByRole('button', { name: '항목 추가' })

/**
 * §5.0. 라벨은 **편집 대상 주 선택 하나에서만** 파생한다 — 오늘이 무슨 요일인지에서
 * 직접 파생하면 일요일에 `이번 주 할당 잡기` 를 눌렀는데 다음 주가 열리는 모순이 난다.
 */
describe('Planner — 편집 대상 주 (§5.0)', () => {
  it('두 세그먼트를 렌더하고 선택된 쪽을 aria-pressed 로 알린다', () => {
    renderPlanner()
    expect(screen.getByRole('button', { name: '이번 주' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '다음 주' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('선택 상태에 배경뿐 아니라 보더가 있다 (design-system ADR-006 §3)', () => {
    // --glass-strong 은 고대비 모드에서 사라진다. 배경만으로 선택을 표현하면 안 된다.
    renderPlanner()
    expect(screen.getByRole('button', { name: '이번 주' }).className).toMatch(/border/)
  })

  it('헤더·확정 버튼 라벨이 선택에서 파생된다', () => {
    renderPlanner({}, {}, 'next')
    expect(screen.getByText('다음 주 계획')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 주 시작' })).toBeInTheDocument()
  })

  it('선택된 주의 범위를 사실로 병기한다', () => {
    renderPlanner({}, {}, 'next')
    expect(screen.getByText('8/10 – 8/16')).toBeInTheDocument()
  })

  it('고치던 내용이 없으면 바로 전환한다', async () => {
    const onChangeWeek = vi.fn()
    renderPlanner({}, { onChangeWeek })
    await userEvent.click(screen.getByRole('button', { name: '다음 주' }))
    expect(onChangeWeek).toHaveBeenCalledWith('next')
  })

  it('고치던 내용이 있으면 확인을 1회 거친다 — 조용히 버리지 않는다', async () => {
    const onChangeWeek = vi.fn()
    renderPlanner({}, { onChangeWeek })
    await userEvent.type(titleInput(), '쓰던 것')

    await userEvent.click(screen.getByRole('button', { name: '다음 주' }))
    expect(onChangeWeek).not.toHaveBeenCalled()
    expect(screen.getByText(/고치던 내용이 있어요/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '저장하지 않고 이동' }))
    expect(onChangeWeek).toHaveBeenCalledWith('next')
  })

  it('확인에서 취소하면 전환하지 않고 안내가 사라진다', async () => {
    const onChangeWeek = vi.fn()
    renderPlanner({}, { onChangeWeek })
    await userEvent.type(titleInput(), '쓰던 것')
    await userEvent.click(screen.getByRole('button', { name: '다음 주' }))
    await userEvent.click(screen.getByRole('button', { name: '여기 남기' }))

    expect(onChangeWeek).not.toHaveBeenCalled()
    expect(screen.queryByText(/고치던 내용이 있어요/)).not.toBeInTheDocument()
  })

  it('전환 확인에 --danger 를 쓰지 않는다 — 파괴적 행위가 아니다', async () => {
    renderPlanner({}, {})
    await userEvent.type(titleInput(), '쓰던 것')
    await userEvent.click(screen.getByRole('button', { name: '다음 주' }))
    expect(screen.getByRole('button', { name: '저장하지 않고 이동' }).className).not.toMatch(
      /danger/
    )
  })

  it('이미 선택된 세그먼트를 다시 눌러도 확인을 띄우지 않는다', async () => {
    const onChangeWeek = vi.fn()
    renderPlanner({}, { onChangeWeek })
    await userEvent.type(titleInput(), '쓰던 것')
    await userEvent.click(screen.getByRole('button', { name: '이번 주' }))
    expect(screen.queryByText(/고치던 내용이 있어요/)).not.toBeInTheDocument()
  })
})

/**
 * 계획 시점의 숫자가 통째로 사라졌다 (ADR-030 §3). 이 절은 **없어야 할 것이 없는지**를
 * 지킨다 — 하나라도 되살아나면 "얼마만큼"에 답하는 층이 다시 생긴다.
 */
describe('Planner — 계획 시점의 숫자 입력이 없다 (§5)', () => {
  it('예산 입력도, 그것을 대신하는 안내도 없다', () => {
    renderPlanner()
    expect(screen.queryByLabelText(/예산/)).not.toBeInTheDocument()
    expect(screen.queryByText(/예산/)).not.toBeInTheDocument()
  })

  it('예상 뽀모 스테퍼가 없다', () => {
    renderPlanner()
    expect(screen.queryByRole('button', { name: /예상 뽀모/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('est-value')).not.toBeInTheDocument()
  })

  it('총량 바도 요일별 부하 막대도 없다', () => {
    renderPlanner({ items: [{ id: 'i1', title: 'A', days: [1] }] })
    expect(screen.queryByTestId('plan-total')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plan-total-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('day-load')).not.toBeInTheDocument()
  })

  it('과적이라는 상태가 없으므로 경고도 없다', () => {
    renderPlanner({ items: [{ id: 'i1', title: 'A', days: [] }] })
    expect(screen.queryByText(/과적/)).not.toBeInTheDocument()
  })
})

describe('Planner — 항목 추가 (§5.2)', () => {
  it('제목은 40자를 넘길 수 없다', () => {
    renderPlanner()
    expect(titleInput()).toHaveAttribute('maxLength', '40')
  })

  it('추가 후 제목 포커스가 유지되고 요일 선택이 초기화된다', async () => {
    const user = userEvent.setup()
    renderPlanner()

    await user.type(titleInput(), '설계 문서')
    await user.click(screen.getByRole('button', { name: '월' }))
    await user.click(addButton())

    expect(titleInput()).toHaveFocus()
    expect(titleInput()).toHaveValue('')
    expect(screen.getByRole('button', { name: '월' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('제목이 비면 추가할 수 없다', () => {
    renderPlanner()
    expect(addButton()).toBeDisabled()
  })

  it('초안 행에 제목과 요일만 적는다', async () => {
    const user = userEvent.setup()
    renderPlanner()

    await user.type(titleInput(), '설계 문서')
    await user.click(screen.getByRole('button', { name: '월' }))
    await user.click(screen.getByRole('button', { name: '수' }))
    await user.click(addButton())

    const row = screen.getByTestId('draft-row')
    expect(row).toHaveTextContent('설계 문서')
    expect(row).toHaveTextContent('월수')
    expect(row).not.toHaveTextContent('뽀모')
  })

  it('요일을 고르지 않은 행은 미배치라고 적는다', async () => {
    const user = userEvent.setup()
    renderPlanner()

    await user.type(titleInput(), '설계 문서')
    await user.click(addButton())
    expect(screen.getByTestId('draft-row')).toHaveTextContent('미배치')
  })
})

/**
 * 한글 IME 조합 중 Enter. Chromium 은 조합 중 Enter 에 **keydown 을 두 번** 쏘고 그
 * 사이에서 글자를 확정한다 — 조합 여부를 보지 않으면 한 번의 Enter 로 항목이 두 개
 * 생기고, 두 번째는 마지막 조합 글자 하나짜리다 (`가나다라` → `가나다라`, `라`).
 *
 * `user-event` 는 IME 를 흉내내지 못하므로 세 단계를 직접 만든다.
 */
function commitComposition(input: HTMLElement, composed: string) {
  /*
   * 브라우저는 조합 중이던 글자를 **지금 입력칸에 들어 있는 값 뒤에** 확정해 넣는다.
   * 값이 그대로면 조합 글자가 이미 그 안에 있으므로 값이 변하지 않고, 조합 중에 값이
   * 지워졌으면 확정 글자만 새로 써진다 — 이 재삽입이 중복 항목의 재료다.
   */
  const current = (input as HTMLInputElement).value
  fireEvent.compositionEnd(input, { data: composed })
  if (!current.endsWith(composed)) fireEvent.change(input, { target: { value: composed } })
}

describe('Planner — 한글 조합 중 Enter (§5.2)', () => {
  it('조합 중 Enter 는 항목을 한 번만 추가한다 — 마지막 글자가 따로 붙지 않는다', () => {
    renderPlanner()
    const input = titleInput()

    fireEvent.change(input, { target: { value: '가나다라' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true }) // 조합 중 — 글자 확정일 뿐이다
    commitComposition(input, '라')
    fireEvent.keyDown(input, { key: 'Enter' }) // 확정 후 — 여기서만 추가된다

    const rows = screen.getAllByTestId('draft-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('가나다라')
  })

  it('조합 없이 친 Enter 는 그대로 추가한다 — 영문 입력이 막히지 않는다', () => {
    renderPlanner()
    const input = titleInput()

    fireEvent.change(input, { target: { value: 'spec review' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getAllByTestId('draft-row')).toHaveLength(1)
    expect(screen.getByTestId('draft-row')).toHaveTextContent('spec review')
  })
})

describe('Planner — 요일 칩 (§5.3)', () => {
  it('월요일부터 7개이고 라벨이 붙는다', () => {
    renderPlanner()
    expect(screen.getByText('언제 (선택)')).toBeInTheDocument()
    expect(screen.getAllByTestId('day-chip').map((c) => c.textContent)).toEqual([
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
      '일'
    ])
  })

  it('칩을 토글해도 제목 입력 포커스를 잃지 않는다', async () => {
    const user = userEvent.setup()
    renderPlanner()

    await user.type(titleInput(), '설계')
    await user.click(screen.getByRole('button', { name: '수' }))
    expect(titleInput()).toHaveFocus()
    expect(screen.getByRole('button', { name: '수' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('칩이 토큰 하한 클래스를 갖는다 (design-system ADR-004 §2)', () => {
    renderPlanner()
    for (const chip of screen.getAllByTestId('day-chip')) {
      expect(chip.className).toContain('min-h-[var(--target-min)]')
    }
  })
})

describe('Planner — 초안 행의 톤 (§5.2.1)', () => {
  it('초안 행 `×` 의 danger 는 hover 에만 걸린다', () => {
    renderPlanner({ items: [{ id: 'i1', title: 'A', days: [] }] })
    const remove = within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' })
    for (const cls of remove.className.split(/\s+/).filter((c) => c.includes('danger'))) {
      expect(cls).toMatch(/^hover:/)
    }
  })
})

describe('Planner — × 의 두 의미 (§5.2.1 · R24)', () => {
  it('신규 초안 행은 확인 없이 사라진다', async () => {
    const user = userEvent.setup()
    renderPlanner()

    await user.type(titleInput(), '방금 적은 것')
    await user.click(addButton())
    await user.click(within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' }))

    expect(screen.queryByTestId('draft-row')).not.toBeInTheDocument()
    expect(screen.queryByText(/보내줄까요/)).not.toBeInTheDocument()
  })

  it('기존 항목은 제거되지 않고 보내줄 예정으로 바뀐다 — 확인 1회를 거친다', async () => {
    const user = userEvent.setup()
    renderPlanner({ items: [{ id: 'i1', title: '지난 것', days: [] }] })

    await user.click(within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' }))
    expect(
      screen.getByText('이 Sprint를 보내줄까요? 지금까지 한 집중과 task는 남아요.')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '보내주기' }))
    const row = screen.getByTestId('draft-row')
    expect(row).toBeInTheDocument() // 사라지지 않는다
    expect(row).toHaveTextContent('보내줄 예정')
    expect(within(row).getByTestId('draft-row-title').className).toMatch(/line-through/)
  })

  it('되돌리기를 누르면 원래대로 복구된다', async () => {
    const user = userEvent.setup()
    renderPlanner({ items: [{ id: 'i1', title: '지난 것', days: [] }] })

    await user.click(within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' }))
    await user.click(screen.getByRole('button', { name: '보내주기' }))
    await user.click(screen.getByRole('button', { name: '되돌리기' }))

    const row = screen.getByTestId('draft-row')
    expect(row).not.toHaveTextContent('보내줄 예정')
    expect(within(row).getByTestId('draft-row-title').className).not.toMatch(/line-through/)
  })
})

describe('Planner — 확정과 취소 (§5.4)', () => {
  it('확정은 남은 항목만 올린다 — 보내줄 예정은 목록에서 빠져 폐기가 된다', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderPlanner(
      {
        items: [
          { id: 'i1', title: '남길 것', days: [1] },
          { id: 'i2', title: '보낼 것', days: [] }
        ]
      },
      { onConfirm }
    )

    const rows = screen.getAllByTestId('draft-row')
    await user.click(within(rows[1]).getByRole('button', { name: '제거' }))
    await user.click(screen.getByRole('button', { name: '보내주기' }))
    await user.click(screen.getByRole('button', { name: '이번 주 시작' }))

    expect(onConfirm).toHaveBeenCalledWith({
      items: [{ id: 'i1', title: '남길 것', days: [1] }]
    })
  })

  it('항목이 하나도 없어도 확정할 수 있다 — 차단 0건', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderPlanner({}, { onConfirm })

    await user.click(screen.getByRole('button', { name: '이번 주 시작' }))
    expect(onConfirm).toHaveBeenCalledWith({ items: [] })
  })

  it('취소는 확인 없이 초안을 폐기한다', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    renderPlanner({ items: [{ id: 'i1', title: 'A', days: [] }] }, { onCancel, onConfirm })

    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
