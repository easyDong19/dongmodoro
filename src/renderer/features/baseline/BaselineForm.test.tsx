// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BaselineForm } from './BaselineForm'
import type { BaselineView } from './useBaseline'

function view(over: Partial<BaselineView> = {}): BaselineView {
  return { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, ...over }
}

function renderForm(data: BaselineView, onSave = vi.fn()) {
  render(
    <BaselineForm data={data} pending={false} failed={false} onSave={onSave} onCancel={vi.fn()} />
  )
  return onSave
}

const save = () => screen.getByRole('button', { name: '길이 저장' })

describe('BaselineForm — 길이 3종만 편집한다 (pomo-baseline R5·R25)', () => {
  it('저장된 길이로 열린다', () => {
    renderForm(view({ focusMin: 50 }))

    expect(screen.getByLabelText('집중 길이 (분)')).toHaveValue(50)
    expect(screen.getByLabelText('짧은 휴식 길이 (분)')).toHaveValue(5)
    expect(screen.getByLabelText('긴 휴식 길이 (분)')).toHaveValue(15)
  })

  it('길이 3종만 저장한다', async () => {
    const onSave = renderForm(view())
    const focus = screen.getByLabelText('집중 길이 (분)')
    await userEvent.clear(focus)
    await userEvent.type(focus, '50')
    await userEvent.click(save())

    expect(onSave).toHaveBeenCalledWith({ focusMin: 50, shortBreakMin: 5, longBreakMin: 15 })
  })

  /**
   * 요일별 가용량은 폐기된 통화이고 (ADR-030), 총 집중 시간 비교는 그 분모와 함께
   * 죽었다 (ADR-029 §3). 되살아나면 이 폼이 다시 개수를 묻게 된다.
   */
  it('요일별 가용량 칸과 총 집중 시간 비교가 없다', async () => {
    renderForm(view())
    const focus = screen.getByLabelText('집중 길이 (분)')
    await userEvent.clear(focus)
    await userEvent.type(focus, '50')

    for (const day of ['월', '화', '수', '목', '금', '토', '일']) {
      expect(screen.queryByLabelText(`${day}요일 가용 뽀모`)).not.toBeInTheDocument()
    }
    expect(screen.queryByTestId('baseline-hours')).not.toBeInTheDocument()
  })
})

describe('BaselineForm — 하한 (pomo-baseline R5 · A5)', () => {
  it.each(['0', '-5'])('길이가 %s 면 저장이 막힌다', async (value) => {
    renderForm(view())
    const focus = screen.getByLabelText('집중 길이 (분)')
    await userEvent.clear(focus)
    await userEvent.type(focus, value)

    expect(save()).toBeDisabled()
  })

  it('길이를 비우면 저장이 막힌다', async () => {
    renderForm(view())
    await userEvent.clear(screen.getByLabelText('집중 길이 (분)'))

    expect(save()).toBeDisabled()
  })
})
