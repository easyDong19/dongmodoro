// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WeekItemRow } from './WeekItemRow'

type Row = Parameters<typeof WeekItemRow>[0]['row']

const WEEK = '2026-08-03'

function makeRow(over: Partial<Row> = {}): Row {
  return {
    id: 'i1',
    title: '설계 문서',
    estPomos: 4,
    days: [],
    originWeek: WEEK,
    completedAt: null,
    spentPomos: 0,
    measuredSec: 0,
    childTotal: 0,
    childDone: 0,
    ...over
  }
}

function renderRow(
  over: Partial<Row> = {},
  handlers: Partial<Record<string, () => void>> = {},
  todayIndex: number | null = null
) {
  return render(
    <WeekItemRow
      row={makeRow(over)}
      week={WEEK}
      todayIndex={todayIndex}
      onPullNext={handlers.onPullNext ?? vi.fn()}
      onComplete={handlers.onComplete ?? vi.fn()}
      onUncomplete={handlers.onUncomplete ?? vi.fn()}
    />
  )
}

describe('WeekItemRow — 기본 구성 (§3.1)', () => {
  it('제목·측정 시간·요일 핍 7개를 렌더한다', () => {
    renderRow({ measuredSec: 5400 })
    expect(screen.getByText('설계 문서')).toBeInTheDocument()
    expect(screen.getByTestId('measured-time')).toHaveTextContent('1시간 30분')
    expect(screen.getAllByTestId('day-pip')).toHaveLength(7)
  })

  it('세션이 없는 항목도 자리를 지킨다 — 0분 이다 (ux-spec §0.5)', () => {
    renderRow({ measuredSec: 0 })
    expect(screen.getByTestId('measured-time')).toHaveTextContent('0분')
  })

  it('자식 조각이 0개면 조각 카운트를 숨긴다', () => {
    renderRow({ childTotal: 0, childDone: 0 })
    expect(screen.queryByText(/조각/)).not.toBeInTheDocument()
  })

  it('자식 조각이 있으면 완료/전체를 적는다', () => {
    renderRow({ childTotal: 4, childDone: 2 })
    expect(screen.getByText('· 조각 2/4')).toBeInTheDocument()
  })

  it('pull 버튼 라벨은 `+ 오늘로` 다 — 드로어 푸터 문구를 쓰지 않는다', () => {
    renderRow()
    expect(screen.getByRole('button', { name: '+ 오늘로' })).toBeInTheDocument()
    expect(screen.queryByText('오늘로 가져오기')).not.toBeInTheDocument()
  })
})

describe('WeekItemRow — 요일 핍 (§3.2 · principles §3.5)', () => {
  it('월요일 시작 순서로 요일 이름을 노출한다', () => {
    renderRow({ days: [0, 2] })
    // 라벨은 요일 이름으로 시작하고 뒤에 상태가 붙는다 — 이름 순서가 이 테스트의 대상이다.
    expect(
      screen.getAllByTestId('day-pip').map((p) => p.getAttribute('aria-label')?.split(' ·')[0])
    ).toEqual(['월', '화', '수', '목', '금', '토', '일'])
  })

  it('배정 여부를 aria-pressed 로 노출한다', () => {
    renderRow({ days: [0, 2] })
    expect(screen.getAllByTestId('day-pip').map((p) => p.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'true',
      'false',
      'false',
      'false',
      'false'
    ])
  })

  it('색만이 아니라 지름도 다르다 — 두 채널 규칙', () => {
    renderRow({ days: [0] })
    const [mon, tue] = screen.getAllByTestId('day-pip')
    const sizeOf = (el: Element) =>
      (el.className.match(/size-\[?[\d.]+(rem|px)?\]?/) ?? [])[0] ?? el.className
    expect(sizeOf(mon)).not.toBe(sizeOf(tue))
  })

  /**
   * §3.2 의 4상태. 색 축(`--ink-faint` / `--teal` / `--amber`)과 모양 축(solid 작게 /
   * 윤곽선만 / solid / 링 + 지름 확대)이 **둘 다** 갈린다 — 색만 다르면 색각 이상에서
   * 구분이 사라지고, 모양만 다르면 5px 지름에서 안 읽힌다.
   */
  it('오늘을 알면 배정 핍이 지난/오늘/다가올로 갈린다', () => {
    renderRow({ days: [0, 3, 5] }, {}, 3) // 오늘 = 목요일
    const pips = screen.getAllByTestId('day-pip')
    expect(pips[0].getAttribute('data-state')).toBe('past')
    expect(pips[3].getAttribute('data-state')).toBe('today')
    expect(pips[5].getAttribute('data-state')).toBe('upcoming')
    expect(pips[1].getAttribute('data-state')).toBe('off')
  })

  it('지난 요일은 속을 비우고 오늘은 링과 큰 지름을 갖는다', () => {
    renderRow({ days: [0, 3, 5] }, {}, 3)
    const [mon, , , thu, , sat] = screen.getAllByTestId('day-pip')
    expect(mon.className).toMatch(/border-teal/) // 윤곽선만
    expect(mon.className).not.toMatch(/bg-teal/)
    expect(thu.className).toMatch(/ring-/) // 바깥 링 1겹
    expect(sat.className).toMatch(/bg-teal/) // solid 채움
  })

  it('오늘이 지난 요일에 --danger 를 쓰지 않는다 — 놓쳤다는 표시가 아니다', () => {
    renderRow({ days: [0] }, {}, 3)
    for (const pip of screen.getAllByTestId('day-pip')) {
      expect(pip.className).not.toMatch(/danger/)
    }
  })

  it('오늘을 모르면(다른 주) 2상태로 남는다', () => {
    renderRow({ days: [0, 3] }, {}, null)
    const states = screen.getAllByTestId('day-pip').map((p) => p.getAttribute('data-state'))
    expect(new Set(states)).toEqual(new Set(['on', 'off']))
  })

  it('상태를 aria-label 에도 실어 스크린리더가 색에 기대지 않게 한다', () => {
    renderRow({ days: [3] }, {}, 3)
    expect(screen.getAllByTestId('day-pip')[3].getAttribute('aria-label')).toContain('오늘')
  })

  it('불투명도로 배정 여부를 표현하지 않는다 (principles §3.5)', () => {
    // 핍만 본다 — Button 의 `disabled:opacity-50` 은 shadcn 원본의 비활성 스타일이지
    // 상태를 불투명도로 인코딩한 것이 아니다.
    renderRow({ days: [0] })
    for (const pip of screen.getAllByTestId('day-pip')) {
      expect(pip.className).not.toMatch(/opacity-/)
    }
  })
})

describe('WeekItemRow — 이월 배지 (R11 · A14·A15)', () => {
  it('originWeek 이 2주 전이면 3주째다', () => {
    renderRow({ originWeek: '2026-07-20' })
    expect(screen.getByText('3주째')).toBeInTheDocument()
  })

  it('같은 주에 생긴 항목에는 배지가 없다', () => {
    renderRow({ originWeek: WEEK })
    expect(screen.queryByText(/주째/)).not.toBeInTheDocument()
  })
})

describe('WeekItemRow — 완료 제안 (§3.3·§4)', () => {
  it('자식을 전부 끝내고 미완료면 제안과 버튼이 뜬다', () => {
    renderRow({ childTotal: 3, childDone: 3, completedAt: null })
    expect(screen.getByText('할 일을 다 끝냈어요 — 이 할당도 완료할까요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '완료로 표시' })).toBeInTheDocument()
  })

  it('거절 버튼은 없다 — 무시하면 active 로 남는다', () => {
    renderRow({ childTotal: 3, childDone: 3 })
    expect(screen.queryByRole('button', { name: /나중에|아니요|취소/ })).not.toBeInTheDocument()
  })

  it('자식이 0개면 제안이 뜨지 않는다 (§4)', () => {
    renderRow({ childTotal: 0, childDone: 0 })
    expect(screen.queryByText(/이 할당도 완료할까요/)).not.toBeInTheDocument()
  })

  it('자식이 남아 있으면 제안이 뜨지 않는다', () => {
    renderRow({ childTotal: 3, childDone: 2 })
    expect(screen.queryByText(/이 할당도 완료할까요/)).not.toBeInTheDocument()
  })
})

describe('WeekItemRow — 완료 상태 (§3.3)', () => {
  it('제목에 취소선, pull 자리에 `완료됨` 비활성 라벨, `완료 해제` 액션', () => {
    renderRow({ completedAt: '2026-08-05T00:00:00.000Z' })
    expect(screen.getByText('설계 문서').className).toMatch(/line-through/)
    expect(screen.getByText('완료됨')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ 오늘로' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '완료 해제' })).toBeInTheDocument()
  })

  /**
   * R28 의 초과 표시(`+N` · 앰버 도트)는 **비교 대상인 est 와 함께 죽었다** (ADR-030 §1).
   * 완료 뒤 붙은 집중은 초과가 아니라 그냥 시간이라, 측정 시간이 계속 자랄 뿐이다.
   * 그래도 완료 제안이 다시 뜨지 않는다는 규칙은 그대로다 (A37).
   */
  it('완료 후 추가 집중: 시간은 계속 자라고 완료 제안은 다시 뜨지 않는다 (R28·A37)', () => {
    renderRow({
      completedAt: '2026-08-05T00:00:00.000Z',
      measuredSec: 9000,
      childTotal: 2,
      childDone: 2
    })
    expect(screen.getByTestId('measured-time')).toHaveTextContent('2시간 30분')
    expect(screen.queryByText('+2')).not.toBeInTheDocument()
    expect(screen.queryByText(/이 할당도 완료할까요/)).not.toBeInTheDocument()
  })
})

describe('WeekItemRow — 조작 타깃 (design-system ADR-004 §2)', () => {
  /**
   * 24px 하한은 global.css 가 `button` 셀렉터에 `var(--target-min)` 으로 건다 — 컴포넌트가
   * 클래스로 다시 걸면 토큰 대신 raw 24px 를 박게 된다. 그래서 여기서 볼 것은 클래스가
   * 아니라 **조작 요소가 실제 `button` 인가**다. onClick 을 단 div 면 하한이 적용되지 않는다.
   * 실제 픽셀은 jsdom 이 레이아웃을 계산하지 않으므로 `pnpm dev` 수동 확인 몫이다.
   */
  it('캐럿과 pull 이 div 가 아니라 button 이다 — 하한 규칙이 걸리는 조건', () => {
    renderRow()
    for (const name of ['드로어 열기', '+ 오늘로']) {
      expect(screen.getByRole('button', { name }).tagName).toBe('BUTTON')
    }
  })
})
