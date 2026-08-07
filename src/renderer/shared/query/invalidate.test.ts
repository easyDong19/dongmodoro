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
    expect(keys).toContainEqual(['week', '2026-08-03', 'items'])
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
  it('완료 토글: day 는 전체(과거 소급), week 는 부모 항목의 주', () => {
    const keys = keysToInvalidate({
      type: 'task-toggled',
      payload: { parentWeek: '2026-07-27' },
      currentDayKey: '2026-08-07'
    })
    expect(keys).toContainEqual(['day'])
    expect(keys).toContainEqual(['week', '2026-07-27', 'items'])
  })
  it('경계 전이: 주가 바뀌면 week 전체가 추가된다', () => {
    const keys = keysToInvalidate({
      type: 'clock-boundary',
      payload: { dayKey: '2026-08-10', weekKey: '2026-08-10', monthKey: '2026-08' },
      previous: { dayKey: '2026-08-09', weekKey: '2026-08-03', monthKey: '2026-08' },
      currentDayKey: '2026-08-10'
    })
    expect(keys).toContainEqual(['today'])
    expect(keys).toContainEqual(['week'])
    expect(keys).not.toContainEqual(['month']) // 달은 안 바뀜
  })
})
