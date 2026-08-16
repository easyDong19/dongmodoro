// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
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
    days: [],
    originWeek: WEEK,
    completedAt: null,
    measuredSec: 0,
    childTotal: 0,
    childDone: 0,
    ...over
  }
}

function makeSummary(over: Partial<Summary> = {}): Summary {
  return {
    week: WEEK,
    totalMeasuredSec: 0,
    items: [],
    otherRow: { visible: false, measuredSec: 0 },
    ...over
  }
}

type Drawer = Awaited<ReturnType<Api['week']['drawer']>>

const emptyDrawer: Drawer = {
  itemWeek: WEEK,
  completedAt: null,
  tasks: [],
  milestone: null,
  milestoneCandidates: []
}

type Status = Awaited<ReturnType<Api['review']['getStatus']>>
type Pending = Awaited<ReturnType<Api['review']['getPending']>>

async function renderCard(
  summary: Summary,
  over: Partial<Api['week']> = {},
  targetWeek: string = WEEK,
  review: { status?: Status; pending?: Pending } = {}
) {
  window.api = {
    review: {
      // 편집 대상 주의 기본값이 여기서 온다 — renderer 는 plan_lead_days 를 모른다.
      getStatus: vi.fn().mockResolvedValue(review.status ?? { needed: false, targetWeek }),
      getPending: vi.fn().mockResolvedValue(review.pending ?? { needed: false, targetWeek })
    },
    clock: {
      now: vi
        .fn()
        .mockResolvedValue({ dayKey: DAY, weekKey: WEEK, monthKey: '2026-08', weekdayIndex: 4 })
    },
    week: {
      summary: vi.fn().mockResolvedValue(summary),
      planDraft: vi.fn(),
      confirmPlan: vi.fn(),
      drawer: vi.fn().mockResolvedValue(emptyDrawer),
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
  qc.setQueryData(['clock'], { dayKey: DAY, weekKey: WEEK, monthKey: '2026-08', weekdayIndex: 4 })

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
    expect(screen.getByText(/8\/3 – 8\/9/)).toBeInTheDocument()
  })

  it('주 번호 라벨(W32)은 렌더하지 않는다 — ux-spec 이 TBD 로 열어둔 항목이다', async () => {
    await renderCard(makeSummary())
    expect(screen.queryByText(/^W\d+$/)).not.toBeInTheDocument()
  })

  /**
   * 예산 게이지가 있던 자리다 (ADR-030 §3 — 폐기된 통화). 그 자리가 답하던 "이번 주에
   * 얼마나 했나"는 헤더의 측정 시간 합이 답하고, 헤더는 목록 바깥이라 항목이 쌓여도
   * 밀리지 않는다.
   */
  it('목록만 스크롤하고 이번 주 측정 시간 합은 그 바깥 헤더에 있다', async () => {
    await renderCard(makeSummary({ items: [makeItem()], totalMeasuredSec: 12000 }))
    const list = screen.getByTestId('week-item-list')
    expect(list.className).toMatch(/overflow-y-auto/)
    // min-h-0 이 없으면 flex 자식이 줄지 않아 카드가 늘어난다.
    expect(list.className).toMatch(/min-h-0/)

    const total = screen.getByTestId('week-total-measured')
    expect(total).toHaveTextContent('3시간 20분')
    expect(list.contains(total)).toBe(false)
  })

  it('예산 게이지가 없다 — 폐기된 통화다', async () => {
    await renderCard(makeSummary())
    expect(screen.queryByTestId('week-gauge-slot')).not.toBeInTheDocument()
  })
})

describe('WeekCard — 기타 행 (§3.4)', () => {
  it('visible 이면 목록 맨 아래에 측정 시간으로 렌더된다', async () => {
    await renderCard(
      makeSummary({
        items: [makeItem({ measuredSec: 1500 })],
        otherRow: { visible: true, measuredSec: 4500 }
      })
    )
    const other = screen.getByTestId('other-row')
    expect(other).toHaveTextContent('기타 — 계획에 없던 집중')

    const rows = screen.getAllByTestId(/^(week-item-row|other-row)$/)
    expect(rows[rows.length - 1]).toBe(other) // 맨 아래

    // 차액을 그대로 그린다 — 초과라는 개념이 없으므로 +N 배지도 없다
    expect(within(other).getByTestId('measured-time')).toHaveTextContent('1시간 15분')
    expect(other).not.toHaveTextContent('+')
  })

  it('요일 핍·이월 배지·pull 버튼이 없다', async () => {
    await renderCard(makeSummary({ otherRow: { visible: true, measuredSec: 4500 } }))
    const other = screen.getByTestId('other-row')
    expect(other.querySelectorAll('[data-testid="day-pip"]')).toHaveLength(0)
    expect(other).not.toHaveTextContent('주째')
    expect(other).not.toHaveTextContent('+ 오늘로')
    expect(other).not.toHaveTextContent('/4')
  })

  it('점선 테두리를 쓰되 ink-faint 로 낮추지 않는다 — 실제로 한 집중이다', async () => {
    await renderCard(makeSummary({ otherRow: { visible: true, measuredSec: 4500 } }))
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
    expect(
      screen.getByText('이번 주 할당을 잡으면 여기서 집중한 시간이 쌓여요')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ 이번 주 할당 잡기' })).toBeInTheDocument()
  })

  it('항목 0 · 기타 행 있음 → 기타 행과 함께 다른 문구를 쓴다', async () => {
    await renderCard(makeSummary({ otherRow: { visible: true, measuredSec: 3000 } }))
    expect(screen.getByTestId('other-row')).toBeInTheDocument()
    expect(screen.getByText('계획이 없어도 기록은 남아요')).toBeInTheDocument()
    expect(
      screen.queryByText('이번 주 할당을 잡으면 여기서 집중한 시간이 쌓여요')
    ).not.toBeInTheDocument()
  })

  /**
   * §8 의 빈 상태 표는 이 칸에도 CTA 를 요구한다. 문구만 그리고 CTA 를 빼면 **계획 없이
   * 집중 한 번만 해도 그 주에는 플래너로 들어갈 길이 없어진다** — 앱을 처음 열고 타이머부터
   * 눌러 본 사용자가 정확히 밟는 경로다 (실물 앱에서 실측).
   */
  it('항목 0 · 기타 행 있음 → 그래도 할당 잡기 CTA 가 있다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ otherRow: { visible: true, measuredSec: 3000 } }), {
      planDraft: vi.fn().mockResolvedValue({ week: WEEK, items: [] })
    })

    const cta = screen.getByRole('button', { name: '+ 이번 주 할당 잡기' })
    await user.click(cta)
    // 실제로 플래너가 열려야 한다 — 버튼만 있고 아무 데도 안 가면 고친 것이 아니다.
    expect(await screen.findByLabelText('할당 제목')).toBeInTheDocument()
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

describe('WeekCard — 헤더 `수정` 진입 (§2)', () => {
  const draft = {
    week: WEEK,

    items: [{ id: 'i1', title: '설계 문서', days: [], milestoneId: null }]
  }

  /**
   * 진입점이 빈 상태에만 있으면 **활성 항목이 하나라도 있는 순간 플래너가 닫힌다** —
   * 주중 재수정(PRD R23)과 일요일의 다음 주 계획이 전부 그 뒤에 있다. 실물 앱에서
   * 항목 1개를 만든 뒤 카드에 남은 버튼이 드로어와 pull 둘뿐인 것을 실측했다.
   */
  it('활성 항목이 있으면 헤더에 `수정` 이 있고 눌러 플래너로 간다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ items: [makeItem()] }), {
      planDraft: vi.fn().mockResolvedValue(draft)
    })

    await user.click(screen.getByRole('button', { name: '수정' }))
    // 기존 항목이 채워진 채 열려야 한다 (§5.3 — 재수정은 새 계획이 아니다).
    expect(await screen.findByLabelText('할당 제목')).toBeInTheDocument()
    expect(screen.getByText('설계 문서')).toBeInTheDocument()
  })

  /** 진입은 한 번에 하나다 — 빈 상태에는 본문 CTA 가 이미 있다. */
  it('빈 상태에서는 헤더 `수정` 을 그리지 않는다', async () => {
    await renderCard(makeSummary())
    expect(screen.getByRole('button', { name: '+ 이번 주 할당 잡기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  })

  it('플래너를 닫으면 포커스가 헤더 `수정` 으로 돌아온다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary({ items: [makeItem()] }), {
      planDraft: vi.fn().mockResolvedValue(draft)
    })

    await user.click(screen.getByRole('button', { name: '수정' }))
    await screen.findByLabelText('할당 제목')
    await user.click(screen.getByRole('button', { name: '취소' }))

    const back = await screen.findByRole('button', { name: '수정' })
    expect(back).toHaveFocus()
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

  it('행에 원클릭 pull 버튼이 없다 — 가져오기 진입점은 드로어뿐이다', async () => {
    await renderCard(makeSummary({ items: [makeItem()] }))
    expect(screen.queryByRole('button', { name: '+ 오늘로' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '드로어 열기' })).toBeInTheDocument()
  })

  it('완료 항목의 드로어를 열어도 판단 문구가 붙지 않는다 (R28)', async () => {
    const user = userEvent.setup()
    await renderCard(
      makeSummary({
        items: [
          makeItem({
            completedAt: '2026-08-05T00:00:00.000Z',
            measuredSec: 9000
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
    expect(screen.getAllByTestId('measured-time')[0]).toHaveTextContent('2시간 30분')
    expect(screen.queryByText(/초과/)).not.toBeInTheDocument()
  })

  it('기타 행에는 캐럿이 없다 — 드릴다운은 이번 마일스톤에서 뺐다', async () => {
    await renderCard(makeSummary({ otherRow: { visible: true, measuredSec: 4500 } }))
    const other = screen.getByTestId('other-row')
    expect(other.querySelectorAll('button')).toHaveLength(0)
  })
})

describe('WeekCard — 플래너 진입과 복귀 (§5.4)', () => {
  const draft = { week: WEEK, items: [] }

  it('빈 상태 CTA 로 플래너에 들어간다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary(), { planDraft: vi.fn().mockResolvedValue(draft) })

    await user.click(screen.getByRole('button', { name: '+ 이번 주 할당 잡기' }))
    expect(await screen.findByText('이번 주 계획')).toBeInTheDocument()
  })

  it('플래너로 들어가면 일반 뷰의 주 총합이 사라진다 (§1 — 카드째 대체)', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary(), { planDraft: vi.fn().mockResolvedValue(draft) })

    expect(screen.getByTestId('week-total-measured')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ 이번 주 할당 잡기' }))
    await screen.findByText('이번 주 계획')
    expect(screen.queryByTestId('week-total-measured')).not.toBeInTheDocument()
    // 플래너에는 그 자리를 대신할 숫자가 없다 — 총량 바도 함께 죽었다 (ADR-030 §3).
    expect(screen.getByLabelText('할당 제목')).toBeInTheDocument()
  })

  it('취소하면 일반 뷰로 돌아가고 포커스가 열었던 버튼으로 귀속된다', async () => {
    const user = userEvent.setup()
    await renderCard(makeSummary(), { planDraft: vi.fn().mockResolvedValue(draft) })

    await user.click(screen.getByRole('button', { name: '+ 이번 주 할당 잡기' }))
    await user.click(await screen.findByRole('button', { name: '취소' }))

    const cta = screen.getByRole('button', { name: '+ 이번 주 할당 잡기' })
    expect(cta).toBeInTheDocument()
    expect(cta).toHaveFocus()
  })

  it('`수정` 으로 들어가면 복귀 포커스도 `수정` 이다 — 진입 경로가 둘이다', async () => {
    const user = userEvent.setup()
    await renderCard(
      makeSummary({ items: [makeItem({ completedAt: '2026-08-05T00:00:00.000Z' })] }),
      { planDraft: vi.fn().mockResolvedValue(draft) }
    )

    await user.click(screen.getByRole('button', { name: '수정' }))
    await user.click(await screen.findByRole('button', { name: '취소' }))
    expect(screen.getByRole('button', { name: '수정' })).toHaveFocus()
  })

  it('확정하면 일반 뷰로 복귀한다', async () => {
    const user = userEvent.setup()
    const confirmPlan = vi.fn().mockResolvedValue({ week: WEEK, droppedCount: 0 })
    await renderCard(makeSummary(), {
      planDraft: vi.fn().mockResolvedValue(draft),
      confirmPlan
    })

    await user.click(screen.getByRole('button', { name: '+ 이번 주 할당 잡기' }))
    await user.click(await screen.findByRole('button', { name: '이번 주 시작' }))

    expect(confirmPlan).toHaveBeenCalledWith({ week: WEEK, items: [] })
    expect(await screen.findByTestId('week-total-measured')).toBeInTheDocument()
    expect(screen.queryByText('이번 주 계획')).not.toBeInTheDocument()
  })
})

describe('WeekCard — 타이포와 빈 공간', () => {
  it('eyebrow 와 카드 제목이 공용 타이포 클래스를 쓴다', async () => {
    await renderCard(makeSummary())
    expect(screen.getByText('WEEK').className).toContain('eyebrow')
    expect(screen.getByText('이번 주 할당').className).toContain('card-title')
  })

  it('보여줄 행이 하나도 없으면 안내를 세로 가운데에 둔다', async () => {
    await renderCard(makeSummary())
    expect(screen.getByTestId('week-item-list').className).toContain('justify-center')
  })

  it('행이 있으면 위에서부터 쌓는다 — 가운데로 몰지 않는다', async () => {
    await renderCard(makeSummary({ items: [makeItem()] }))
    expect(screen.getByTestId('week-item-list').className).not.toContain('justify-center')
  })

  it('기타 행만 있는 주도 위에서부터 쌓는다 — 보여줄 기록이 있다', async () => {
    await renderCard(makeSummary({ otherRow: { visible: true, measuredSec: 3000 } }))
    expect(screen.getByTestId('week-item-list').className).not.toContain('justify-center')
  })
})

/**
 * §3.1 마지막 줄 — 목록 정렬은 생성순이고 **오늘 배정된 항목만** 상단으로 올린다
 * (PRD R7·R10). 사용자가 순서를 바꾸는 UI 는 없다.
 */
describe('WeekCard — 오늘 배정 상단 정렬 (A8)', () => {
  it('오늘 배정된 항목이 위로 오고 나머지는 원래 순서를 지킨다', async () => {
    await renderCard(
      makeSummary({
        items: [
          makeItem({ id: 'a', title: '먼저', days: [] }),
          makeItem({ id: 'b', title: '오늘 것', days: [4] }), // DAY = 금요일 (weekdayIndex 4)
          makeItem({ id: 'c', title: '나중', days: [0] })
        ]
      })
    )

    const titles = screen
      .getAllByTestId('week-item-row')
      .map((row) => row.querySelector('span')?.textContent)
    expect(titles).toEqual(['오늘 것', '먼저', '나중'])
  })

  it('오늘 배정이 없으면 생성순 그대로다', async () => {
    await renderCard(
      makeSummary({
        items: [makeItem({ id: 'a', title: '먼저' }), makeItem({ id: 'b', title: '나중' })]
      })
    )
    const titles = screen
      .getAllByTestId('week-item-row')
      .map((row) => row.querySelector('span')?.textContent)
    expect(titles).toEqual(['먼저', '나중'])
  })
})

/**
 * §2 라벨 파생 규칙 (PRD R5). 헤더·확정 버튼·빈 상태 CTA 가 **편집 대상 주 선택
 * 하나에서만** 파생한다 — 오늘이 무슨 요일인지에서 직접 파생하면, 일요일에
 * `이번 주 할당 잡기` 를 눌렀는데 다음 주가 열리는 모순이 생긴다.
 */
describe('WeekCard — 편집 대상 주 기본값 (A3·A5)', () => {
  it('계획 대상 주가 다음 주면 빈 상태 CTA 도 다음 주라고 말한다', async () => {
    await renderCard(makeSummary(), {}, '2026-08-10')
    expect(await screen.findByRole('button', { name: '+ 다음 주 할당 잡기' })).toBeInTheDocument()
  })

  it('그 CTA 로 들어가면 다음 주 초안을 불러온다', async () => {
    const planDraft = vi.fn().mockResolvedValue({ week: '2026-08-10', items: [] })
    await renderCard(makeSummary(), { planDraft }, '2026-08-10')

    await userEvent.click(await screen.findByRole('button', { name: '+ 다음 주 할당 잡기' }))
    expect(await screen.findByText('다음 주 계획')).toBeInTheDocument()
    expect(planDraft).toHaveBeenCalledWith('2026-08-10')
  })

  it('평일에는 이번 주가 기본이고 세그먼트로 다음 주 초안으로 옮길 수 있다', async () => {
    const planDraft = vi
      .fn()
      .mockImplementation((week: string) => Promise.resolve({ week, items: [] }))
    await renderCard(makeSummary(), { planDraft }, WEEK)

    await userEvent.click(await screen.findByRole('button', { name: '+ 이번 주 할당 잡기' }))
    expect(planDraft).toHaveBeenCalledWith(WEEK)

    await userEvent.click(screen.getByRole('button', { name: '다음 주' }))
    expect(await screen.findByText('다음 주 계획')).toBeInTheDocument()
    expect(planDraft).toHaveBeenCalledWith('2026-08-10')
  })
})

/**
 * 배너는 일반 뷰 상단에 얹히고, `정산 시작` 은 카드 자리를 패널로 바꾼다 (정정 ③).
 * 오버레이로 덮지 않는 이유는 R7 — 패널이 열려 있어도 타이머·오늘 목록을 계속 써야 한다.
 */
describe('WeekCard — 정산 배너와 패널 (weekly-review §1·§2)', () => {
  const pendingStatus: Status = {
    needed: true,
    targetWeek: '2026-08-10',
    from: WEEK,
    to: WEEK,
    weekCount: 1,
    pendingItemCount: 2
  }

  it('정산 대기가 아니면 배너가 없다', async () => {
    await renderCard(makeSummary())
    expect(screen.queryByTestId('review-banner')).not.toBeInTheDocument()
  })

  it('정산 대기면 배너가 목록 위에 뜨고 일반 뷰는 그대로 동작한다 (R7)', async () => {
    await renderCard(makeSummary({ items: [makeItem()] }), {}, WEEK, { status: pendingStatus })
    expect(await screen.findByTestId('review-banner')).toBeInTheDocument()
    // 배너가 떠 있어도 목록·주 총합이 사라지지 않는다
    expect(screen.getByTestId('week-item-row')).toBeInTheDocument()
    expect(screen.getByTestId('week-total-measured')).toBeInTheDocument()
  })

  it('정산 시작을 누르면 패널이 카드 자리를 대신한다', async () => {
    await renderCard(makeSummary(), {}, WEEK, {
      status: pendingStatus,
      pending: { needed: false, targetWeek: '2026-08-10' }
    })

    await userEvent.click(await screen.findByRole('button', { name: '정산 시작' }))
    expect(await screen.findByText('지금 정산할 주가 없어요')).toBeInTheDocument()
    expect(screen.queryByTestId('week-item-list')).not.toBeInTheDocument()
  })

  it('닫으면 일반 뷰로 돌아가고 포커스가 정산 시작 버튼으로 귀속된다', async () => {
    await renderCard(makeSummary(), {}, WEEK, {
      status: pendingStatus,
      pending: { needed: false, targetWeek: '2026-08-10' }
    })

    await userEvent.click(await screen.findByRole('button', { name: '정산 시작' }))
    await userEvent.click(await screen.findByRole('button', { name: '닫기' }))

    const cta = await screen.findByRole('button', { name: '정산 시작' })
    expect(cta).toHaveFocus()
  })
})
