// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/ipc/api'
import { ItemDrawer } from './ItemDrawer'

type Drawer = Awaited<ReturnType<Api['week']['drawer']>>
type Task = Drawer['tasks'][number]

function makeTask(over: Partial<Task> = {}): Task {
  return {
    taskId: 't1',
    title: '초안 쓰기',
    estPomos: 2,
    spentPomos: 0,
    measuredSec: 0,
    completedAt: null,
    inToday: false,
    ...over
  }
}

function renderDrawer(
  over: Partial<Drawer> = {},
  handlers: {
    onPull?: (input: {
      taskIds: string[]
      newTask: { title: string; estPomos: number } | null
    }) => void
    onClose?: () => void
    onComplete?: () => void
    onUncomplete?: () => void
    onDrop?: () => void
    onSetMilestone?: (milestoneId: string | null) => void
  } = {}
) {
  const data: Drawer = {
    itemWeek: '2026-08-03',
    completedAt: null,
    tasks: [],
    milestone: null,
    milestoneCandidates: [],
    ...over
  }
  render(
    <ItemDrawer
      id="drawer-i1"
      data={data}
      onPull={handlers.onPull ?? vi.fn()}
      onClose={handlers.onClose ?? vi.fn()}
      onComplete={handlers.onComplete ?? vi.fn()}
      onUncomplete={handlers.onUncomplete ?? vi.fn()}
      onDrop={handlers.onDrop ?? vi.fn()}
      onSetMilestone={handlers.onSetMilestone ?? vi.fn()}
    />
  )
}

describe('ItemDrawer — 모달이 아니다 (§6)', () => {
  it('role=dialog 를 쓰지 않는다 — 인라인 펼침이라 다른 조작을 막지 않는다', () => {
    renderDrawer()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ItemDrawer — 조각 0개 (§6.4 · R12)', () => {
  it('목록 영역 없이 첫 조각 안내만 보인다', () => {
    renderDrawer({ tasks: [] })
    expect(screen.getByText('오늘 할 몫을 쪼개서 적어요 — 이게 첫 조각이 돼요')).toBeInTheDocument()
    expect(screen.queryByText('이 할당의 조각 — 오늘 할 것을 고르세요')).not.toBeInTheDocument()
    expect(screen.queryByText('또는 새 조각 추가')).not.toBeInTheDocument()
  })
})

describe('ItemDrawer — 조각 목록 (§6.1·§6.2)', () => {
  it('목록 라벨과 새 입력 라벨이 함께 보인다', () => {
    renderDrawer({ tasks: [makeTask()] })
    expect(screen.getByText('이 할당의 조각 — 오늘 할 것을 고르세요')).toBeInTheDocument()
    expect(screen.getByText('또는 새 조각 추가')).toBeInTheDocument()
  })

  it('오늘 목록에 있는 조각은 상태 라벨과 함께 선택 불가다', () => {
    renderDrawer({ tasks: [makeTask({ inToday: true })] })
    expect(screen.getByText('오늘 목록에')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /초안 쓰기/ })).toBeDisabled()
  })

  it('완료된 조각은 취소선 + 상태 라벨과 함께 선택 불가다', () => {
    renderDrawer({ tasks: [makeTask({ completedAt: '2026-08-05T00:00:00.000Z' })] })
    expect(screen.getByText('완료')).toBeInTheDocument()
    expect(screen.getByTestId('drawer-task-title').className).toMatch(/line-through/)
    expect(screen.getByRole('checkbox', { name: /초안 쓰기/ })).toBeDisabled()
  })

  it('선택 가능한 조각은 다중 선택된다', async () => {
    const user = userEvent.setup()
    renderDrawer({
      tasks: [makeTask(), makeTask({ taskId: 't2', title: '검토' })]
    })
    await user.click(screen.getByRole('checkbox', { name: /초안 쓰기/ }))
    await user.click(screen.getByRole('checkbox', { name: /검토/ }))
    expect(screen.getByRole('checkbox', { name: /초안 쓰기/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /검토/ })).toBeChecked()
  })
})

describe('ItemDrawer — 푸터 (§6.1·§6.3)', () => {
  it('버튼은 `닫기` 와 `오늘로 가져오기` 둘이다', () => {
    renderDrawer({ tasks: [makeTask()] })
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '오늘로 가져오기' })).toBeInTheDocument()
    // 행의 원클릭 라벨을 여기에 쓰지 않는다 — 하나는 원클릭, 하나는 선택 후 확정이다.
    expect(screen.queryByRole('button', { name: '+ 오늘로' })).not.toBeInTheDocument()
  })

  it('`닫기` 는 선택 상태를 폐기하고 닫는다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onPull = vi.fn()
    renderDrawer({ tasks: [makeTask()] }, { onClose, onPull })

    await user.click(screen.getByRole('checkbox', { name: /초안 쓰기/ }))
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onPull).not.toHaveBeenCalled()
  })

  it('선택한 조각과 새 조각을 한 번에 올린다', async () => {
    const user = userEvent.setup()
    const onPull = vi.fn()
    renderDrawer({ tasks: [makeTask()] }, { onPull })

    await user.click(screen.getByRole('checkbox', { name: /초안 쓰기/ }))
    await user.type(screen.getByLabelText('또는 새 조각 추가'), '마무리')
    await user.click(screen.getByRole('button', { name: '오늘로 가져오기' }))

    expect(onPull).toHaveBeenCalledWith({
      taskIds: ['t1'],
      newTask: { title: '마무리', estPomos: 1 }
    })
  })

  it('아무것도 고르지 않고 새 조각도 비었으면 가져오기가 비활성이다', () => {
    renderDrawer({ tasks: [makeTask()] })
    expect(screen.getByRole('button', { name: '오늘로 가져오기' })).toBeDisabled()
  })
})

describe('ItemDrawer — 완료된 항목 (§6.4 · R27·R28)', () => {
  const completed = { completedAt: '2026-08-05T00:00:00.000Z', tasks: [makeTask()] }

  it('가져오기가 비활성이고 해제 안내가 붙는다', () => {
    renderDrawer(completed)
    expect(screen.getByRole('button', { name: '오늘로 가져오기' })).toBeDisabled()
    expect(
      screen.getByText('완료된 할당이에요 — 해제하면 다시 가져올 수 있어요')
    ).toBeInTheDocument()
  })

  it('초과에 판단 문구를 붙이지 않는다', () => {
    renderDrawer({ ...completed, tasks: [makeTask({ estPomos: 1, spentPomos: 3 })] })
    expect(screen.queryByText(/초과/)).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument() // 사실은 그대로 보인다
  })
})

describe('ItemDrawer — 항목 액션 (§6.1·§6.3)', () => {
  it('미완료면 `완료로 표시` 와 `보내주기` 가 있다', () => {
    renderDrawer({ tasks: [makeTask()] })
    expect(screen.getByRole('button', { name: '완료로 표시' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '보내주기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '완료 해제' })).not.toBeInTheDocument()
  })

  it('완료 상태면 `완료 해제` 로 바뀐다', () => {
    renderDrawer({ completedAt: '2026-08-05T00:00:00.000Z', tasks: [makeTask()] })
    expect(screen.getByRole('button', { name: '완료 해제' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '완료로 표시' })).not.toBeInTheDocument()
  })

  it('`보내주기` 는 확인을 한 번 거친다 — 문구는 `버리기` 가 아니다', async () => {
    const user = userEvent.setup()
    const onDrop = vi.fn()
    renderDrawer({ tasks: [makeTask()] }, { onDrop })

    await user.click(screen.getByRole('button', { name: '보내주기' }))
    expect(onDrop).not.toHaveBeenCalled()
    expect(
      screen.getByText('이 할당을 보내줄까요? 지금까지 한 집중과 조각은 남아요.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/버리기/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '보내주기' }))
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  it('확인을 취소하면 폐기하지 않는다', async () => {
    const user = userEvent.setup()
    const onDrop = vi.fn()
    renderDrawer({ tasks: [makeTask()] }, { onDrop })

    await user.click(screen.getByRole('button', { name: '보내주기' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.queryByText(/보내줄까요/)).not.toBeInTheDocument()
  })

  it('--danger 는 hover 에만 걸린다 — 기본 상태에서 빨갛지 않다', () => {
    renderDrawer({ tasks: [makeTask()] })
    const drop = screen.getByRole('button', { name: '보내주기' })
    for (const cls of drop.className.split(/\s+/).filter((c) => c.includes('danger'))) {
      expect(cls).toMatch(/^hover:/)
    }
  })
})

describe('ItemDrawer — 조작 타깃 (design-system ADR-004 §2)', () => {
  /**
   * 24px 하한은 global.css 가 `button`·`input` 셀렉터에 `var(--target-min)` 으로 건다.
   * 조각 **행**은 그 셀렉터에 없으므로(라벨이다) 여기서만 토큰 클래스를 직접 붙인다 —
   * raw 24px 가 아니라 `var(--target-min)` 을 참조해야 토큰 규칙 안이다.
   */
  it('조각 선택 행이 토큰 하한 클래스를 갖는다', () => {
    renderDrawer({ tasks: [makeTask()] })
    expect(screen.getByTestId('drawer-task-row').className).toContain('min-h-[var(--target-min)]')
  })

  it('푸터·항목 액션이 div 가 아니라 button 이다', () => {
    renderDrawer({ tasks: [makeTask()] })
    for (const name of ['닫기', '오늘로 가져오기', '완료로 표시', '보내주기']) {
      expect(screen.getByRole('button', { name }).tagName).toBe('BUTTON')
    }
  })
})

describe('ItemDrawer — 마일스톤 연결 (milestones R13·R14·R15 · A11·A12)', () => {
  const m = (id: string, title: string, month = '2026-08') => ({
    id,
    month,
    title,
    completedAt: null,
    archivedAt: null
  })

  it('연결 없음이 정상 선택지이고 경고 문구가 없다 (R13 · A11)', () => {
    renderDrawer({ milestone: null, milestoneCandidates: [m('m1', '결과물')] })
    const select = screen.getByTestId('milestone-select')
    expect(select).toHaveValue('')
    expect(screen.getByText('연결 없음')).toBeInTheDocument()
    expect(screen.queryByText(/연결해|필요|누락/)).not.toBeInTheDocument()
  })

  it('서버가 준 후보만 고를 수 있다 — 화면이 목록을 다시 좁히지 않는다 (A12)', () => {
    renderDrawer({ milestone: null, milestoneCandidates: [m('m1', '8월 결과물')] })
    const options = within(screen.getByTestId('milestone-select')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['연결 없음', '8월 결과물'])
  })

  it('고르면 id 를 올려보낸다', async () => {
    const user = userEvent.setup()
    const onSetMilestone = vi.fn()
    renderDrawer({ milestone: null, milestoneCandidates: [m('m1', '결과물')] }, { onSetMilestone })

    await user.selectOptions(screen.getByTestId('milestone-select'), 'm1')
    expect(onSetMilestone).toHaveBeenCalledWith('m1')
  })

  it('연결 없음을 고르면 null 을 올려보낸다 — 해제는 오류가 아니다 (R13)', async () => {
    const user = userEvent.setup()
    const onSetMilestone = vi.fn()
    renderDrawer(
      { milestone: m('m1', '결과물'), milestoneCandidates: [m('m1', '결과물')] },
      { onSetMilestone }
    )

    await user.selectOptions(screen.getByTestId('milestone-select'), '')
    expect(onSetMilestone).toHaveBeenCalledWith(null)
  })

  /**
   * R15 — 이월이 승계한 타월 연결. 후보 목록에 없다고 지워 버리면 렌더 시점에 연결이
   * 사라진 것처럼 보이고, 사용자가 손대지 않았는데 값이 바뀐다.
   */
  it('타월 연결은 후보 밖이어도 유지되고 비활성 옵션으로 보인다 (R15)', () => {
    renderDrawer({
      milestone: m('m-aug', '8월 결과물', '2026-08'),
      milestoneCandidates: [m('m-sep', '9월 결과물', '2026-09')]
    })
    const select = screen.getByTestId('milestone-select')
    expect(select).toHaveValue('m-aug')
    const foreign = screen.getByTestId('milestone-foreign-option')
    expect(foreign).toBeDisabled()
    expect(foreign).toHaveTextContent('8월 결과물 (다른 달)')
  })
})
