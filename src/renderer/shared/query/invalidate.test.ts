import { describe, it, expect } from 'vitest'
import { keysToInvalidate } from './invalidate'

describe('keysToInvalidate — ADR-025 §3 표의 코드화', () => {
  it('세션 기록: 자정 안 걸친 세션이면 today 는 그 날짜만', () => {
    const keys = keysToInvalidate({
      type: 'session-recorded',
      payload: {
        sessionId: 's',
        kind: 'focus',
        taskId: 't',
        durationSec: 1500,
        localDate: '2026-08-07',
        localWeek: '2026-08-03'
      },
      currentDayKey: '2026-08-07'
    })
    expect(keys).toContainEqual(['today', '2026-08-07'])
    expect(keys).toContainEqual(['day', '2026-08-07'])
    expect(keys).toContainEqual(['week', '2026-08-03'])
    expect(keys).toContainEqual(['month', '2026-08', 'calendar'])
    expect(keys).toContainEqual(['month']) // milestones 광역 (prefix)
  })
  it('세션 기록: 자정 걸친 세션(localDate ≠ 오늘)이면 today 전체', () => {
    const keys = keysToInvalidate({
      type: 'session-recorded',
      payload: {
        sessionId: 's',
        kind: 'focus',
        taskId: null,
        durationSec: 900,
        localDate: '2026-08-06',
        localWeek: '2026-08-03'
      },
      currentDayKey: '2026-08-07'
    })
    expect(keys).toContainEqual(['today'])
  })
  it('사후 캡처: week·day·month 를 무효화한다', () => {
    const keys = keysToInvalidate({
      type: 'capture-recorded',
      payload: { localDate: '2026-08-07', localWeek: '2026-08-03' },
      currentDayKey: '2026-08-07'
    })
    expect(keys).toContainEqual(['week', '2026-08-03'])
    expect(keys).toContainEqual(['day', '2026-08-07'])
    expect(keys).toContainEqual(['month'])
  })
  it('당김/철회: today·day·week·month calendar 를 무효화한다', () => {
    const keys = keysToInvalidate({
      type: 'pull-changed',
      payload: { itemWeek: '2026-08-03' },
      currentDayKey: '2026-08-07'
    })
    expect(keys).toContainEqual(['today', '2026-08-07'])
    expect(keys).toContainEqual(['day', '2026-08-07'])
    expect(keys).toContainEqual(['week', '2026-08-03'])
    expect(keys).toContainEqual(['month', '2026-08', 'calendar'])
  })
  it('완료 토글: day 는 전체(과거 소급), week 는 부모 항목의 주', () => {
    const keys = keysToInvalidate({
      type: 'task-toggled',
      payload: { parentWeek: '2026-07-27' },
      currentDayKey: '2026-08-07'
    })
    expect(keys).toContainEqual(['day'])
    expect(keys).toContainEqual(['week', '2026-07-27'])
  })
  it('플래너 확정: 확정한 주와 오늘 목록을 무효화한다', () => {
    expect(
      keysToInvalidate({
        type: 'plan-confirmed',
        payload: { week: '2026-08-03' },
        currentDayKey: '2026-08-05'
      })
    ).toEqual([
      ['week', '2026-08-03'],
      ['today', '2026-08-05']
    ])
  })
  it('항목 변경: 그 항목의 주와 오늘 목록을 무효화한다 — 다른 주여도 오늘은 함께 턴다', () => {
    expect(
      keysToInvalidate({
        type: 'item-changed',
        payload: { itemWeek: '2026-08-10' },
        currentDayKey: '2026-08-05'
      })
    ).toEqual([
      ['week', '2026-08-10'],
      ['today', '2026-08-05']
    ])
  })
  it('경계 전이: 주가 바뀌면 week 전체가 추가된다', () => {
    const keys = keysToInvalidate({
      type: 'clock-boundary',
      payload: {
        dayKey: '2026-08-10',
        weekKey: '2026-08-10',
        monthKey: '2026-08',
        weekdayIndex: 0
      },
      previous: {
        dayKey: '2026-08-09',
        weekKey: '2026-08-03',
        monthKey: '2026-08',
        weekdayIndex: 6
      },
      currentDayKey: '2026-08-10'
    })
    expect(keys).toContainEqual(['today'])
    expect(keys).toContainEqual(['week'])
    expect(keys).not.toContainEqual(['month']) // 달은 안 바뀜
  })
})
