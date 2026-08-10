// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { Api } from '@shared/ipc/api'
import { WeekCard } from './WeekCard'

const WEEK = '2026-08-03'
const DAY = '2026-08-07'

type Summary = Awaited<ReturnType<Api['week']['summary']>>
type Item = Summary['items'][number]

function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    title: '설계 문서',
    estPomos: 4,
    days: [],
    originWeek: WEEK,
    completedAt: null,
    spentPomos: 0,
    childTotal: 0,
    childDone: 0,
    ...over
  }
}

function makeSummary(over: Partial<Summary> = {}): Summary {
  return {
    week: WEEK,
    budget: null,
    totalSpent: 0,
    items: [],
    otherRow: { visible: false, spentPomos: 0 },
    ...over
  }
}

type Drawer = Awaited<ReturnType<Api['week']['drawer']>>

const emptyDrawer: Drawer = { itemWeek: WEEK, completedAt: null, tasks: [] }

async function renderCard(summary: Summary, over: Partial<Api['week']> = {}) {
  window.api = {
    clock: { now: vi.fn().mockResolvedValue({ dayKey: DAY, weekKey: WEEK, monthKey: '2026-08' }) },
    week: {
      summary: vi.fn().mockResolvedValue(summary),
      planDraft: vi.fn(),
      confirmPlan: vi.fn(),
      drawer: vi.fn().mockResolvedValue(emptyDrawer),
      pullNext: vi.fn().mockResolvedValue({ itemWeek: WEEK, pulled: null }),
      pullFromDrawer: vi.fn().mockResolvedValue({ itemWeek: WEEK }),
      complete: vi.fn().mockResolvedValue({ itemWeek: WEEK, completedAt: null }),
      uncomplete: vi.fn().mockResolvedValue({ itemWeek: WEEK, completedAt: null }),
      drop: vi.fn().mockResolvedValue({ itemWeek: WEEK }),
      ...over
    }
  } as unknown as Api

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  qc.setQueryData(['clock'], { dayKey: DAY, weekKey: WEEK, monthKey: '2026-08' })

  const view = render(
    <QueryClientProvider client={qc}>
      <WeekCard />
    </QueryClientProvider>
  )
  await screen.findByText('이번 주 할당')
  return view
}

describe('WeekCard — 카드 골격 (§2)', () => {
  it('eyebrow · 제목 · 주 범위를 렌더한다', async () => {
    await renderCard(makeSummary())
    expect(screen.getByText('WEEK')).toBeInTheDocument()
    expect(screen.getByText('이번 주 할당')).toBeInTheDocument()
    expect(screen.getByText('8/3 – 8/9')).toBeInTheDocument()
  })

  it('주 번호 라벨(W32)은 렌더하지 않는다 — ux-spec 이 TBD 로 열어둔 항목이다', async () => {
    await renderCard(makeSummary())
    expect(screen.queryByText(/^W\d+$/)).not.toBeInTheDocument()
  })

  it('목록만 스크롤하고 게이지는 그 바깥에서 하단에 고정된다', async () => {
    await renderCard(makeSummary({ items: [makeItem()] }))
    const list = screen.getByTestId('week-item-list')
    expect(list.className).toMatch(/overflow-y-auto/)
    // min-h-0 이 없으면 flex 자식이 줄지 않아 카드가 늘어나고 게이지가 밖으로 밀린다.
    expect(list.className).toMatch(/min-h-0/)

    const gaugeSlot = screen.getByTestId('week-gauge-slot')
    expect(gaugeSlot.className).toMatch(/shrink-0/)
    expect(list.contains(gaugeSlot)).toBe(false)
  })
})

describe('WeekCard — 기타 행 (§3.4)', () => {
  it('visible 이면 목록 맨 아래에 neutral 도트로 렌더된다', async () => {
    await renderCard(
      makeSummary({
        items: [makeItem({ spentPomos: 1 })],
        totalSpent: 4,
        otherRow: { visible: true, spentPomos: 3 }
      })
    )
    const other = screen.getByTestId('other-row')
    expect(other).toHaveTextContent('기타 — 계획에 없던 집중')

    const rows = screen.getAllByTestId(/^(week-item-row|other-row)$/)
    expect(rows[rows.length - 1]).toBe(other) // 맨 아래

    // neutral 변형 — extra 도트도 +N 배지도 없다
    expect(other.querySelectorAll('[data-testid="pomo-dot-extra"]')).toHaveLength(0)
    expect(other).not.toHaveTextContent('+')
  })

  it('est·요일 핍·이월 배지·pull 버튼이 없다', async () => {
    await renderCard(makeSummary({ totalSpent: 3, otherRow: { visible: true, spentPomos: 3 } }))
    const other = screen.getByTestId('other-row')
    expect(other.querySelectorAll('[data-testid="day-pip"]')).toHaveLength(0)
    expect(other).not.toHaveTextContent('주째')
    expect(other).not.toHaveTextContent('+ 오늘로')
    expect(other).not.toHaveTextContent('/4')
  })

  it('점선 테두리를 쓰되 ink-faint 로 낮추지 않는다 — 실제로 한 집중이다', async () => {
    await renderCard(makeSummary({ totalSpent: 3, otherRow: { visible: true, spentPomos: 3 } }))
    const other = screen.getByTestId('other-row')
    expect(other.className).toMatch(/border-dashed/)
    expect(other.className).not.toMatch(/ink-faint/)
  })

  it('visible 이 false 면 렌더하지 않는다', async () => {
    await renderCard(makeSummary({ items: [makeItem()] }))
    expect(screen.queryByTestId('other-row')).not.toBeInTheDocument()
  })
})

describe('WeekCard — 빈 상태 (§8)', () => {
  it('항목 0 · 세션 0 → 안내와 할당 잡기 CTA', async () => {
    await renderCard(makeSummary())
    expect(screen.getByText('이번 주 할당을 잡으면 뽀모 예산이 여기 보여요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ 이번 주 할당 잡기' })).toBeInTheDocument()
  })

  it('항목 0 · 기타 행 있음 → 기타 행과 함께 다른 문구를 쓴다', async () => {
    await renderCard(makeSummary({ totalSpent: 2, otherRow: { visible: true, spentPomos: 2 } }))
    expect(screen.getByTestId('other-row')).toBeInTheDocument()
    expect(screen.getByText('계획이 없어도 기록은 남아요')).toBeInTheDocument()
    expect(
      screen.queryByText('이번 주 할당을 잡으면 뽀모 예산이 여기 보여요')
    ).not.toBeInTheDocument()
  })

  it('활성 항목이 전부 완료 → 사실만 적고 CTA 는 `수정` 이다', async () => {
    await renderCard(
      makeSummary({ items: [makeItem({ completedAt: '2026-08-05T00:00:00.000Z' })] })
    )
    expect(screen.getByText('이번 주 할당을 다 끝냈어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
  })

  it('미완료 항목이 하나라도 있으면 빈 상태 문구가 없다', async () => {
    await renderCard(makeSummary({ items: [makeItem()] }))
    expect(screen.queryByText(/이번 주 할당을/)).not.toBeInTheDocument()
    expect(screen.queryByText('계획이 없어도 기록은 남아요')).not.toBeInTheDocument()
  })
})

describe('WeekCard — 드로어 배선 (§6·§3.1)', () => {
  it('캐럿에 aria-expanded·aria-controls 가 있고 열림에 따라 바뀐다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ items: [makeItem()] }))

    const caret = screen.getByRole('button', { name: '드로어 열기' })
    expect(caret).toHaveAttribute('aria-expanded', 'false')
    const controls = caret.getAttribute('aria-controls')
    expect(controls).not.toBeNull()

    await user.click(caret)
    expect(screen.getByRole('button', { name: '드로어 닫기' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(document.getElementById(controls as string)).not.toBeNull()
  })

  it('동시에 하나만 열린다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ items: [makeItem(), makeItem({ id: 'i2', title: '두 번째' })] }))

    const [first, second] = screen.getAllByRole('button', { name: '드로어 열기' })
    await user.click(first)
    expect(await screen.findByTestId('item-drawer')).toBeInTheDocument()

    await user.click(second)
    expect(screen.getAllByTestId('item-drawer')).toHaveLength(1)
  })

  it('드로어를 닫으면 포커스가 캐럿으로 돌아온다 (PRODUCT.md 접근성 §4)', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ items: [makeItem()] }))

    const caret = screen.getByRole('button', { name: '드로어 열기' })
    await user.click(caret)
    await user.click(await screen.findByRole('button', { name: '닫기' }))

    expect(screen.getByRole('button', { name: '드로어 열기' })).toHaveFocus()
  })

  it('원클릭 pull 이 pulled: null 로 오면 드로어가 열린다 (§3.1 폴백)', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ items: [makeItem()] }), {
      pullNext: vi.fn().mockResolvedValue({ itemWeek: WEEK, pulled: null })
    })

    expect(screen.queryByTestId('item-drawer')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ 오늘로' }))
    expect(await screen.findByTestId('item-drawer')).toBeInTheDocument()
  })

  it('원클릭 pull 이 성공하면 토스트가 뜨고 드로어는 열리지 않는다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ items: [makeItem()] }), {
      pullNext: vi
        .fn()
        .mockResolvedValue({ itemWeek: WEEK, pulled: { taskId: 't1', title: '초안 쓰기' } })
    })

    await user.click(screen.getByRole('button', { name: '+ 오늘로' }))
    expect(await screen.findByRole('status')).toHaveTextContent('오늘로 가져왔어요 — 초안 쓰기')
    expect(screen.queryByTestId('item-drawer')).not.toBeInTheDocument()
  })

  it('완료 + 초과 항목의 드로어를 열어도 +N 은 그대로 보인다 (R28)', async () => {
    const user = userEvent.setup()
    await renderCard(
      makeSummary({
        items: [
          makeItem({
            completedAt: '2026-08-05T00:00:00.000Z',
            estPomos: 2,
            spentPomos: 5
          })
        ]
      }),
      {
        drawer: vi
          .fn()
          .mockResolvedValue({ ...emptyDrawer, completedAt: '2026-08-05T00:00:00.000Z' })
      }
    )

    await user.click(screen.getByRole('button', { name: '드로어 열기' }))
    await screen.findByTestId('item-drawer')
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.queryByText(/초과/)).not.toBeInTheDocument()
  })

  it('기타 행에는 캐럿이 없다 — 드릴다운은 이번 마일스톤에서 뺐다', async () => {
    await renderCard(makeSummary({ totalSpent: 3, otherRow: { visible: true, spentPomos: 3 } }))
    const other = screen.getByTestId('other-row')
    expect(other.querySelectorAll('button')).toHaveLength(0)
  })
})
