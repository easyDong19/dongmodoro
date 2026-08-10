// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/ipc/api'
import { Planner } from './Planner'

type Draft = Awaited<ReturnType<Api['week']['planDraft']>>

const WEEK = '2026-08-03'
const NEXT_WEEK = '2026-08-10'

function makeDraft(over: Partial<Draft> = {}): Draft {
  return { week: WEEK, budget: null, prefill: null, items: [], ...over }
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

const titleInput = () => screen.getByLabelText('할당 제목')
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

describe('Planner — ① 예산 (§5.2)', () => {
  it('프리필이 없으면 입력이 비어 있고 과적 안내를 대신 띄운다', () => {
    renderPlanner({ prefill: null, budget: null })
    expect(screen.getByLabelText('이번 주 예산 (추정치)')).toHaveValue(null)
    expect(screen.getByText('예산을 정하면 과적을 알려줘요')).toBeInTheDocument()
  })

  it('이미 정한 예산이 있으면 그 값으로 시작한다', () => {
    renderPlanner({ budget: 18 })
    expect(screen.getByLabelText('이번 주 예산 (추정치)')).toHaveValue(18)
    expect(screen.queryByText('예산을 정하면 과적을 알려줘요')).not.toBeInTheDocument()
  })

  it('확정 예산이 없으면 프리필 후보를 쓴다', () => {
    renderPlanner({ budget: null, prefill: 22 })
    expect(screen.getByLabelText('이번 주 예산 (추정치)')).toHaveValue(22)
  })
})

describe('Planner — ② 항목 추가 (§5.3)', () => {
  it('예상 뽀모 스테퍼는 하한이 1 이다 — 0 이 되지 않는다 (A6)', async () => {
    const user = userEvent.setup()
    renderPlanner()
    expect(screen.getByTestId('est-value')).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: '예상 뽀모 줄이기' }))
    expect(screen.getByTestId('est-value')).toHaveTextContent('1')
  })

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

  it('초안 행에 요일과 예상 뽀모를 사실로 적는다', async () => {
    const user = userEvent.setup()
    renderPlanner()

    await user.type(titleInput(), '설계 문서')
    await user.click(screen.getByRole('button', { name: '월' }))
    await user.click(screen.getByRole('button', { name: '수' }))
    await user.click(screen.getByRole('button', { name: '예상 뽀모 늘리기' }))
    await user.click(addButton())

    const row = screen.getByTestId('draft-row')
    expect(row).toHaveTextContent('설계 문서')
    expect(row).toHaveTextContent('월수')
    expect(row).toHaveTextContent('(뽀모 2)')
  })

  it('요일을 고르지 않은 행은 미배치라고 적는다', async () => {
    const user = userEvent.setup()
    renderPlanner()

    await user.type(titleInput(), '설계 문서')
    await user.click(addButton())
    expect(screen.getByTestId('draft-row')).toHaveTextContent('미배치')
  })
})

describe('Planner — ③ 요일 칩 (§5.4)', () => {
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

describe('Planner — ④ 계획 합계 (§5.5)', () => {
  it('합계와 예산을 함께 적고 진행 바를 그린다', () => {
    renderPlanner({ budget: 20, items: [{ id: 'i1', title: 'A', estPomos: 4, days: [] }] })
    expect(screen.getByText('계획 합계 4 / 예산 20')).toBeInTheDocument()
    expect(screen.getByTestId('plan-total-bar')).toBeInTheDocument()
  })

  it('과적이어도 확정을 막지 않고 질문형으로만 묻는다 (A29·R21·R22)', () => {
    renderPlanner({
      budget: 5,
      items: [{ id: 'i1', title: 'A', estPomos: 8, days: [] }]
    })
    expect(
      screen.getByText('+3 과적이에요. 예상 뽀모를 줄일까요, 항목을 덜어낼까요?')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이번 주 시작' })).toBeEnabled()

    // 실패 프레임 금지는 **경고 영역**의 규칙이다 — 초안 행 `×` 의 hover danger 는
    // §5.3.1 이 따로 허용한 것이라 여기 검사에 끌어들이지 않는다.
    const warning = screen.getByTestId('plan-total')
    expect(warning.querySelectorAll('[class*="danger"]')).toHaveLength(0)
    expect(warning.querySelector('.lucide-triangle-alert')).toBeNull()
  })

  it('초안 행 `×` 의 danger 는 hover 에만 걸린다 (§5.3.1)', () => {
    renderPlanner({ items: [{ id: 'i1', title: 'A', estPomos: 1, days: [] }] })
    const remove = within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' })
    for (const cls of remove.className.split(/\s+/).filter((c) => c.includes('danger'))) {
      expect(cls).toMatch(/^hover:/)
    }
  })

  it('과적 안내가 이 화면에 없는 액션을 권하지 않는다 (R22)', () => {
    renderPlanner({ budget: 5, items: [{ id: 'i1', title: 'A', estPomos: 8, days: [] }] })
    expect(screen.getByTestId('plan-total')).not.toHaveTextContent('다음 주')
  })

  it('예산이 없으면 과적을 계산하지 않는다', () => {
    renderPlanner({ budget: null, items: [{ id: 'i1', title: 'A', estPomos: 8, days: [] }] })
    expect(screen.queryByText(/과적이에요/)).not.toBeInTheDocument()
    expect(screen.getByText('예산을 정하면 과적을 알려줘요')).toBeInTheDocument()
  })
})

describe('Planner — × 의 두 의미 (§5.3.1 · R24)', () => {
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
    renderPlanner({ items: [{ id: 'i1', title: '지난 것', estPomos: 3, days: [] }] })

    await user.click(within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' }))
    expect(
      screen.getByText('이 할당을 보내줄까요? 지금까지 한 집중과 조각은 남아요.')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '보내주기' }))
    const row = screen.getByTestId('draft-row')
    expect(row).toBeInTheDocument() // 사라지지 않는다
    expect(row).toHaveTextContent('보내줄 예정')
    expect(within(row).getByTestId('draft-row-title').className).toMatch(/line-through/)
  })

  it('되돌리기를 누르면 원래대로 복구된다', async () => {
    const user = userEvent.setup()
    renderPlanner({ items: [{ id: 'i1', title: '지난 것', estPomos: 3, days: [] }] })

    await user.click(within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' }))
    await user.click(screen.getByRole('button', { name: '보내주기' }))
    await user.click(screen.getByRole('button', { name: '되돌리기' }))

    const row = screen.getByTestId('draft-row')
    expect(row).not.toHaveTextContent('보내줄 예정')
    expect(within(row).getByTestId('draft-row-title').className).not.toMatch(/line-through/)
  })

  it('보내줄 예정 행은 계획 합계에서 빠진다', async () => {
    const user = userEvent.setup()
    renderPlanner({ budget: 20, items: [{ id: 'i1', title: '지난 것', estPomos: 3, days: [] }] })
    expect(screen.getByText('계획 합계 3 / 예산 20')).toBeInTheDocument()

    await user.click(within(screen.getByTestId('draft-row')).getByRole('button', { name: '제거' }))
    await user.click(screen.getByRole('button', { name: '보내주기' }))
    expect(screen.getByText('계획 합계 0 / 예산 20')).toBeInTheDocument()
  })
})

describe('Planner — 확정과 취소 (§5.6)', () => {
  it('확정은 예산과 남은 항목을 함께 올린다 — 보내줄 예정은 목록에서 빠져 폐기가 된다', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderPlanner(
      {
        budget: 20,
        items: [
          { id: 'i1', title: '남길 것', estPomos: 4, days: [1] },
          { id: 'i2', title: '보낼 것', estPomos: 2, days: [] }
        ]
      },
      { onConfirm }
    )

    const rows = screen.getAllByTestId('draft-row')
    await user.click(within(rows[1]).getByRole('button', { name: '제거' }))
    await user.click(screen.getByRole('button', { name: '보내주기' }))
    await user.click(screen.getByRole('button', { name: '이번 주 시작' }))

    expect(onConfirm).toHaveBeenCalledWith({
      budget: 20,
      items: [{ id: 'i1', title: '남길 것', estPomos: 4, days: [1] }]
    })
  })

  it('항목이 하나도 없어도 확정할 수 있다 — 차단 0건 (R22)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderPlanner({ budget: null }, { onConfirm })

    await user.click(screen.getByRole('button', { name: '이번 주 시작' }))
    expect(onConfirm).toHaveBeenCalledWith({ budget: null, items: [] })
  })

  it('취소는 확인 없이 초안을 폐기한다', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    renderPlanner(
      { items: [{ id: 'i1', title: 'A', estPomos: 1, days: [] }] },
      { onCancel, onConfirm }
    )

    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
