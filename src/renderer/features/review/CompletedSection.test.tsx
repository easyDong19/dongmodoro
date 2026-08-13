// @vitest-environment jsdom
import type {} from '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CompletedSection } from './CompletedSection'
import type { ReviewPending } from './useReview'

type Completed = Extract<ReviewPending, { needed: true }>['completed']

const rows: Completed = [
  { id: 'a', week: '2026-08-17', title: '논문 3장', measuredSec: 7500 },
  { id: 'b', week: '2026-08-24', title: '발표 준비', measuredSec: 3000 }
]

describe('CompletedSection — 끝낸 것들 (§4)', () => {
  it('0건이면 섹션 자체를 숨긴다', () => {
    const { container } = render(<CompletedSection rows={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('제목과 측정 시간을 적는다', () => {
    render(<CompletedSection rows={rows} />)
    expect(screen.getByText('논문 3장')).toBeInTheDocument()
    expect(screen.getAllByTestId('measured-time')[0]).toHaveTextContent('2시간 5분')
  })

  it('기본은 펼침이고 접을 수 있다', async () => {
    render(<CompletedSection rows={rows} />)
    expect(screen.getByText('논문 3장')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /끝낸 것들/ }))
    expect(screen.queryByText('논문 3장')).not.toBeInTheDocument()
  })

  it('여기서는 아무 조작도 하지 않는다 — 완료는 이미 사용자 클릭이 만든 사실이다 (Q14)', () => {
    render(<CompletedSection rows={rows} />)
    // 접기 토글 하나뿐이다. 완료 해제·폐기 같은 컨트롤이 없다.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('건수를 머리말에 사실로 적는다', () => {
    render(<CompletedSection rows={rows} />)
    expect(screen.getByRole('button', { name: /끝낸 것들 2건/ })).toBeInTheDocument()
  })

  it('칭찬하지 않는다 (원칙 6)', () => {
    const { container } = render(<CompletedSection rows={rows} />)
    for (const word of ['잘했', '훌륭', '멋져', '대단']) {
      expect(container.textContent).not.toContain(word)
    }
  })
})
