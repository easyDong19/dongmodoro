// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BaselineForm } from './BaselineForm'
import type { BaselineView } from './useBaseline'

function view(over: Partial<BaselineView> = {}): BaselineView {
  return {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    capacity: null,
    basisPomos: null,
    basisSource: null,
    ...over
  }
}

function renderForm(data: BaselineView, onSave = vi.fn()) {
  render(
    <BaselineForm data={data} pending={false} failed={false} onSave={onSave} onCancel={vi.fn()} />
  )
  return onSave
}

const save = () => screen.getByRole('button', { name: '길이 저장' })

describe('BaselineForm — 가용량의 미설정 (pomo-baseline R8 · A9)', () => {
  it('미설정이면 7칸이 빈 채로 열린다', () => {
    renderForm(view())
    for (const day of ['월', '화', '수', '목', '금', '토', '일']) {
      expect(screen.getByLabelText(`${day}요일 가용 뽀모`)).toHaveValue(null)
    }
  })

  /**
   * A9 의 핵심. 폼을 열었다 저장하는 것만으로 배열이 생기면 "아직 정하지 않았다"가
   * 영구히 "예산 0 으로 하겠다"가 되고, 미설정 분기를 쓰는 화면이 잘못된 쪽을 고른다.
   */
  it('아무 칸도 건드리지 않고 저장하면 가용량이 null 로 나간다', async () => {
    const onSave = renderForm(view())
    await userEvent.click(save())

    expect(onSave).toHaveBeenCalledWith({
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      capacity: null
    })
  })

  it('한 칸을 채우면 나머지가 0 으로 완성된 길이 7 배열이 나간다', async () => {
    const onSave = renderForm(view())
    await userEvent.type(screen.getByLabelText('월요일 가용 뽀모'), '4')
    await userEvent.click(save())

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: [4, 0, 0, 0, 0, 0, 0] })
    )
  })

  it('이미 정해진 가용량은 그 값으로 열린다 — 인덱스 0 이 월요일이다', () => {
    renderForm(view({ capacity: [4, 2, 4, 2, 4, 0, 8] }))

    expect(screen.getByLabelText('월요일 가용 뽀모')).toHaveValue(4)
    expect(screen.getByLabelText('일요일 가용 뽀모')).toHaveValue(8)
  })
})

describe('BaselineForm — 총 집중 시간 비교 (pomo-baseline R26 · A23)', () => {
  it('길이를 25 에서 50 으로 바꾸면 두 숫자가 함께 바뀐다', async () => {
    renderForm(view({ basisPomos: 24, basisSource: 'budget' }))

    const focus = screen.getByLabelText('집중 길이 (분)')
    await userEvent.clear(focus)
    await userEvent.type(focus, '50')

    expect(screen.getByTestId('baseline-hours')).toHaveTextContent(
      '주 24개 · 지금 10시간 → 바꾸면 20시간'
    )
  })

  /**
   * 기준이 가용량에서 왔으면 그 값은 폼 안에서 움직인다. 서버가 열 때 준 숫자를 고집하면
   * 가용량을 낮춘 사용자에게 옛 기준의 비교가 남는다.
   */
  it('기준이 가용량이면 편집 중인 합으로 다시 계산한다', async () => {
    renderForm(view({ capacity: [4, 4, 4, 4, 4, 0, 0], basisPomos: 20, basisSource: 'capacity' }))

    const focus = screen.getByLabelText('집중 길이 (분)')
    await userEvent.clear(focus)
    await userEvent.type(focus, '50')
    const monday = screen.getByLabelText('월요일 가용 뽀모')
    await userEvent.clear(monday)
    await userEvent.type(monday, '0')

    expect(screen.getByTestId('baseline-hours')).toHaveTextContent(
      '주 16개 · 지금 6.7시간 → 바꾸면 13.3시간'
    )
  })

  /**
   * 실물 검증에서 놓쳤던 자리다. 가용량을 **처음** 정하면서 길이도 함께 바꾸면 서버가 열 때
   * 준 출처는 아직 없지만(`basisSource: null`) 폼 안에는 두 값이 다 있다. 비교를 생략하면
   * 사용자는 예산을 그대로 둔 채 두 배의 시간을 계획하게 된다 — R26 이 막으려던 장면이다.
   */
  it('열 때 미설정이던 가용량을 지금 채우면 그 합이 기준이 된다', async () => {
    renderForm(view())
    const focus = screen.getByLabelText('집중 길이 (분)')
    await userEvent.clear(focus)
    await userEvent.type(focus, '50')
    await userEvent.type(screen.getByLabelText('월요일 가용 뽀모'), '6')

    expect(screen.getByTestId('baseline-hours')).toHaveTextContent(
      '주 6개 · 지금 2.5시간 → 바꾸면 5시간'
    )
  })

  /** A25. 기준이 없는 것은 오류가 아니다 — 비교가 없을 뿐 저장은 그대로 된다. */
  it('기준 개수가 없으면 비교 줄이 아예 없고 저장은 가능하다', async () => {
    const onSave = renderForm(view())
    const focus = screen.getByLabelText('집중 길이 (분)')
    await userEvent.clear(focus)
    await userEvent.type(focus, '50')

    expect(screen.queryByTestId('baseline-hours')).not.toBeInTheDocument()
    expect(screen.queryByText(/오류|실패|안 돼/)).not.toBeInTheDocument()

    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ focusMin: 50 }))
  })

  it('길이를 바꾸지 않으면 비교를 보여줄 이유가 없다', () => {
    renderForm(view({ basisPomos: 24, basisSource: 'budget' }))
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
