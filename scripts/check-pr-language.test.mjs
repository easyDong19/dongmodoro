import { describe, expect, it } from 'vitest'
import { findViolations, titleHasHangul } from './check-pr-language.mjs'

describe('titleHasHangul — 제목은 인용 예외가 없다', () => {
  it('영어 제목은 통과한다', () => {
    expect(titleHasHangul('docs: add m2 core loop implementation plan')).toBe(false)
  })

  it('백틱으로 감싸도 제목이면 위반이다', () => {
    expect(titleHasHangul('docs: rename `할 일` to task')).toBe(true)
  })
})

describe('findViolations — 본문은 백틱 밖의 한글만 잡는다', () => {
  it('영어 본문은 통과한다', () => {
    expect(findViolations('## What\n\nAdd the week card.')).toEqual([])
  })

  it('백틱으로 감싼 UI 문구는 허용한다 — 이것이 인용 예외다', () => {
    const body = 'Reusing `예산을 정하면 예산 대비 소진이 보여요` would say something false.'
    expect(findViolations(body)).toEqual([])
  })

  it('펜스 블록 안의 한글도 허용한다 (문서 인용·diff 붙여넣기)', () => {
    const body = ['Before:', '', '```', '- 리뷰 -> 정산', '```', '', 'After: fixed.'].join('\n')
    expect(findViolations(body)).toEqual([])
  })

  it('감싸지 않은 한글은 산문으로 보고 잡는다', () => {
    const found = findViolations('## 무엇을 하는 PR인가\n\nSome English.')
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(1)
  })

  it('펜스 블록을 지워도 뒤쪽 줄 번호가 밀리지 않는다', () => {
    const body = ['English.', '```', 'ko: 한국어', '```', '여기가 위반이다'].join('\n')
    const found = findViolations(body)
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(5) // 블록을 통째로 지웠다면 3 으로 잘못 나온다
  })

  it('보고하는 줄은 백틱을 지우기 전 원문이다 — 자기가 쓴 문장을 알아볼 수 있어야 한다', () => {
    const found = findViolations('근거는 `docs/x.md` 를 본다')
    expect(found).toHaveLength(1)
    expect(found[0].text).toBe('근거는 `docs/x.md` 를 본다') // 지운 줄이면 백틱 안이 비어 있다
  })

  it('빈 본문·null 을 통과시킨다 (본문 없는 PR 은 이 규칙의 관심사가 아니다)', () => {
    expect(findViolations('')).toEqual([])
    expect(findViolations(null)).toEqual([])
  })
})

describe('실제 이력 회귀 — 과거 PR 본문으로 기준을 고정한다', () => {
  it('#12 같은 한국어 본문을 막는다', () => {
    const body =
      '## 무엇을 하는 PR인가\n\n기능 문서 8개에 독립 리뷰어 8명을 붙인 결과 결정 3건이 뒤집혔다.'
    expect(findViolations(body).length).toBeGreaterThan(0)
  })

  it('#24 의 헤딩은 백틱을 씌우면 통과한다 — 인용이 막히지 않는다는 증거', () => {
    expect(findViolations('## P1 — + 오늘로 now does what it says')).toHaveLength(1)
    expect(findViolations('## P1 — `+ 오늘로` now does what it says')).toEqual([])
  })
})
