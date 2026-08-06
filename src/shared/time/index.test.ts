import { describe, it, expect, vi, afterEach } from 'vitest'
import { now, dayKey, weekKey, monthKey, localKeys } from './index'

afterEach(() => vi.useRealTimers())

describe('time module (ADR-009/010)', () => {
  it('now() returns UTC ISO with Z suffix', () => {
    vi.useFakeTimers({ now: new Date('2026-08-04T10:30:00+09:00') })
    expect(now()).toBe('2026-08-04T01:30:00.000Z')
  })
  it('dayKey uses local date', () => {
    expect(dayKey(new Date(2026, 7, 4, 0, 5))).toBe('2026-08-04')
    expect(dayKey(new Date(2026, 7, 3, 23, 55))).toBe('2026-08-03')
  })
  it('weekKey is the Monday of that week', () => {
    expect(weekKey(new Date(2026, 7, 4))).toBe('2026-08-03') // 화 → 그 주 월
    expect(weekKey(new Date(2026, 7, 3))).toBe('2026-08-03') // 월 → 자기 자신
    expect(weekKey(new Date(2026, 7, 9))).toBe('2026-08-03') // 일 → 지난 월요일
  })
  it('weekKey crosses year boundary by date arithmetic (53-week year)', () => {
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-12-28') // 2027-01-01(금) → 2026-12-28(월)
  })
  it('monthKey zero-pads', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01')
  })
  // 서브에이전트 검증(2026-08-05)에서 추가: lint 가 모듈 밖 new Date() 를 막으므로
  // 프로덕션이 실제로 타는 유일한 경로는 "인자 생략"인데, 위 테스트들은 전부
  // 명시적 Date 인자 경로였다 — 무인자 경로가 가짜 시계를 타는지 직접 검증한다.
  it('argless calls read the current (fake) clock', () => {
    vi.useFakeTimers({ now: new Date(2026, 7, 4, 10, 30) }) // 로컬 2026-08-04 화
    expect(dayKey()).toBe('2026-08-04')
    expect(weekKey()).toBe('2026-08-03')
    expect(monthKey()).toBe('2026-08')
  })
  it('weekKey crosses month and year boundaries', () => {
    expect(weekKey(new Date(2030, 0, 1))).toBe('2029-12-31') // 2030-01-01(화) → 전년 12/31(월)
    expect(weekKey(new Date(2029, 0, 1))).toBe('2029-01-01') // 1/1 이 월요일인 해 → 자기 자신
    expect(weekKey(new Date(2027, 7, 1))).toBe('2027-07-26') // 월초 일요일 → 전월 월요일
  })
})

describe('localKeys — 달력 키 짝 (ADR-022 §1)', () => {
  it('derives both keys from one instant', () => {
    expect(localKeys(new Date(2026, 7, 4, 10, 30).getTime())).toEqual({
      localDate: '2026-08-04', // 화
      localWeek: '2026-08-03' // 그 주 월
    })
  })

  it('agrees with dayKey/weekKey on every weekday of a week', () => {
    for (let d = 3; d <= 9; d++) {
      const at = new Date(2026, 7, d, 12)
      expect(localKeys(at.getTime())).toEqual({ localDate: dayKey(at), localWeek: weekKey(at) })
      expect(localKeys(at.getTime()).localWeek).toBe('2026-08-03')
    }
  })

  /**
   * 이 테스트가 이 함수의 존재 이유다. 자정을 사이에 둔 두 번의 시계 읽기는 서로 다른
   * 주를 낸다 — 아래 first/second 가 그 재현이고, localKeys 는 그 갈라짐이 불가능하다.
   */
  it('cannot split across midnight the way two separate clock reads do', () => {
    const sundayLate = new Date(2026, 7, 9, 23, 59, 59, 999) // 일 23:59:59.999
    const mondayEarly = new Date(2026, 7, 10, 0, 0, 0, 0) // 월 00:00:00.000

    // 따로 읽으면 갈라진다 (버그의 형태)
    expect(dayKey(sundayLate)).toBe('2026-08-09')
    expect(weekKey(mondayEarly)).toBe('2026-08-10')

    // 함께 만들면 어느 쪽 순간이든 짝이 맞는다
    expect(localKeys(sundayLate.getTime())).toEqual({
      localDate: '2026-08-09',
      localWeek: '2026-08-03'
    })
    expect(localKeys(mondayEarly.getTime())).toEqual({
      localDate: '2026-08-10',
      localWeek: '2026-08-10'
    })
  })

  it('argless reads the current (fake) clock', () => {
    vi.useFakeTimers({ now: new Date(2026, 7, 9, 23, 59, 59, 999) })
    expect(localKeys()).toEqual({ localDate: '2026-08-09', localWeek: '2026-08-03' })
  })

  it('crosses the year boundary (53-week year)', () => {
    expect(localKeys(new Date(2027, 0, 1, 9).getTime())).toEqual({
      localDate: '2027-01-01',
      localWeek: '2026-12-28'
    })
  })
})
